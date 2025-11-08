"""Ingest command implementation"""

import pandas as pd
from pathlib import Path
from rich.console import Console
from rich.table import Table

from data_cli.config import load_config, get_sink_config
from data_cli.ai import extract_pdf_to_dataframe
from data_cli.sinks import save_to_sink

console = Console()


def ingest_data(source: str, sink: str) -> bool:
    """Ingest data from source and save to sink."""
    console.print(f"[bold]📥 Ingesting[/bold] {source} → {sink}")
    
    # Load config
    config = load_config()
    if not config:
        return False
    
    # Get sink config
    sink_config = get_sink_config(sink)
    if not sink_config:
        console.print(f"[red]✗[/red] Sink '{sink}' not found in config. Run 'data-cli config view' to see available sinks.")
        return False
    
    # Determine source type and load
    source_path = Path(source)
    if not source_path.exists():
        console.print(f"[red]✗[/red] Source file not found: {source}")
        return False
    
    df = None
    
    # Handle different file types
    if source_path.suffix.lower() == '.pdf':
        console.print("[dim]Extracting data from PDF using AI...[/dim]")
        model_name = config.get("ai", {}).get("model", "gemini-1.5-pro")
        csv_data = extract_pdf_to_dataframe(str(source_path), model_name)
        if not csv_data:
            return False
        
        # Parse CSV string into DataFrame
        from io import StringIO
        df = pd.read_csv(StringIO(csv_data))
        console.print(f"[green]✓[/green] Extracted {len(df)} rows from PDF")
    
    elif source_path.suffix.lower() == '.csv':
        encoding = config.get("source_defaults", {}).get("csv_encoding", "utf-8")
        try:
            df = pd.read_csv(source_path, encoding=encoding)
        except UnicodeDecodeError:
            # Try different encodings
            for enc in ['latin-1', 'iso-8859-1', 'cp1252']:
                try:
                    df = pd.read_csv(source_path, encoding=enc)
                    console.print(f"[yellow]⚠[/yellow] Used encoding: {enc}")
                    break
                except:
                    continue
            if df is None:
                console.print(f"[red]✗[/red] Could not read CSV with any encoding")
                return False
        
        console.print(f"[green]✓[/green] Loaded {len(df)} rows from CSV")
    
    elif source_path.suffix.lower() in ['.xlsx', '.xls']:
        df = pd.read_excel(source_path)
        console.print(f"[green]✓[/green] Loaded {len(df)} rows from Excel")
    
    elif source_path.suffix.lower() == '.json':
        df = pd.read_json(source_path)
        console.print(f"[green]✓[/green] Loaded {len(df)} rows from JSON")
    
    else:
        console.print(f"[red]✗[/red] Unsupported file type: {source_path.suffix}")
        return False
    
    if df is None or df.empty:
        console.print(f"[red]✗[/red] No data loaded")
        return False
    
    # Show preview
    console.print("\n[bold]Preview:[/bold]")
    table = Table(show_header=True, header_style="bold magenta")
    for col in df.columns[:5]:  # Show first 5 columns
        table.add_column(col, overflow="fold")
    
    for idx, row in df.head(5).iterrows():
        table.add_row(*[str(val)[:30] for val in row.values[:5]])
    
    console.print(table)
    console.print(f"[dim]Shape: {df.shape[0]} rows × {df.shape[1]} columns[/dim]\n")
    
    # Save to sink
    console.print(f"[bold]💾 Saving to {sink}...[/bold]")
    success = save_to_sink(df, sink, sink_config)
    
    if success:
        console.print(f"\n[bold green]✓ Success![/bold green] Data ingested and saved to {sink}")
        if sink == 'powerbi':
            console.print("[dim]💡 Tip: Refresh your Power BI dashboard to see the new data[/dim]")
    
    return success


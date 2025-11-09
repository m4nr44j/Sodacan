"""Ingest command implementation"""

from typing import Optional
import pandas as pd
from pathlib import Path
from rich.console import Console
from rich.table import Table

from sodacan.config import load_config, get_sink_config, get_config_command, get_preview_config, get_source_config
from sodacan.ai import extract_pdf_to_dataframe
from sodacan.sinks import save_to_sink
from sodacan.sources import load_from_source

console = Console()


def ingest_data(source: str, sink: str, table_name: Optional[str] = None) -> bool:
    """Ingest data from source and save to sink (non-interactive, headless)."""
    console.print(f"[bold][>] Ingesting[/bold] {source} → {sink}")
    if table_name:
        console.print(f"[dim]Table override: {table_name}[/dim]")
    
    # Load config
    config = load_config()
    if not config:
        return False
    
    # Get sink config
    sink_config = get_sink_config(sink)
    if not sink_config:
        console.print(f"[red][ERROR][/red] Sink '{sink}' not found in config. Run '{get_config_command('view')}' to see available sinks.")
        return False
    
    # Check if source is a configured source (like 'snowflake_prod') or a file path
    source_config = get_source_config(source)
    df = None
    
    if source_config:
        # It's a configured source
        console.print(f"[dim]Loading from configured source: {source}[/dim]")
        df = load_from_source(source, source_config)
        if df is None:
            return False
        console.print(f"[green][OK][/green] Loaded {len(df)} rows from {source}")
    else:
        # It's a file path
        source_path = Path(source)
        if not source_path.exists():
            console.print(f"[red][ERROR][/red] Source not found: '{source}' is not a configured source or valid file path")
            console.print(f"[dim]Tip: Use 'soda config' to see configured sources[/dim]")
            return False
        
        # Handle different file types
        if source_path.suffix.lower() == '.pdf':
            console.print("[dim]Extracting data from PDF using AI...[/dim]")
            model_name = config.get("ai", {}).get("model", "gemini-2.5-flash")
            csv_data = extract_pdf_to_dataframe(str(source_path), model_name)
            if not csv_data:
                return False
            
            # Parse CSV string into DataFrame
            from io import StringIO
            try:
                df = pd.read_csv(StringIO(csv_data))
                console.print(f"[green][OK][/green] Extracted {len(df)} rows from PDF")
            except Exception as e:
                # If CSV parsing fails, the PDF might not have tabular data
                # Create a simple DataFrame with the extracted text
                console.print(f"[yellow][!][/yellow] PDF doesn't contain tabular data. Creating text DataFrame...")
                console.print(f"[dim]CSV parse error: {e}[/dim]")
                # Try to create a DataFrame from the raw text
                lines = csv_data.strip().split('\n')
                if len(lines) > 1 and ',' in lines[0]:
                    # Might be CSV but with parsing issues - try with error handling
                    try:
                        df = pd.read_csv(StringIO(csv_data), on_bad_lines='skip', engine='python')
                    except:
                        # Last resort: create single-column DataFrame
                        df = pd.DataFrame({'content': [csv_data]})
                else:
                    # Not CSV format - create single-column DataFrame
                    df = pd.DataFrame({'content': [csv_data]})
                console.print(f"[green][OK][/green] Created DataFrame with {len(df)} row(s) from PDF text")
        
        elif source_path.suffix.lower() == '.csv':
            encoding = config.get("source_defaults", {}).get("csv_encoding", "utf-8")
            try:
                df = pd.read_csv(source_path, encoding=encoding)
            except UnicodeDecodeError:
                # Try different encodings
                for enc in ['latin-1', 'iso-8859-1', 'cp1252']:
                    try:
                        df = pd.read_csv(source_path, encoding=enc)
                        console.print(f"[yellow][!][/yellow] Used encoding: {enc}")
                        break
                    except:
                        continue
                if df is None:
                    console.print(f"[red][ERROR][/red] Could not read CSV with any encoding")
                    return False
            
            console.print(f"[green][OK][/green] Loaded {len(df)} rows from CSV")
        
        elif source_path.suffix.lower() in ['.xlsx', '.xls']:
            df = pd.read_excel(source_path)
            console.print(f"[green][OK][/green] Loaded {len(df)} rows from Excel")
        
        elif source_path.suffix.lower() == '.json':
            df = pd.read_json(source_path)
            console.print(f"[green][OK][/green] Loaded {len(df)} rows from JSON")
        
        else:
            console.print(f"[red][ERROR][/red] Unsupported file type: {source_path.suffix}")
            return False
    
    if df is None or df.empty:
        console.print(f"[red][ERROR][/red] No data loaded")
        return False
    
    # Show preview
    preview_config = get_preview_config()
    max_rows = preview_config["max_rows"]
    max_cols = preview_config["max_cols"]
    
    console.print("\n[bold]Preview:[/bold]")
    table = Table(show_header=True, header_style="bold magenta")
    display_cols = df.columns[:max_cols].tolist()
    for col in display_cols:
        table.add_column(col, overflow="fold")
    
    for idx, row in df.head(max_rows).iterrows():
        table.add_row(*[str(val)[:30] for val in row[display_cols].values])
    
    console.print(table)
    console.print(f"[dim]Shape: {df.shape[0]} rows × {df.shape[1]} columns[/dim]")
    if len(df.columns) > max_cols:
        console.print(f"[dim]... and {len(df.columns) - max_cols} more columns[/dim]")
    console.print()
    
    # Save to sink
    console.print(f"[bold][*] Saving to {sink}...[/bold]")
    success = save_to_sink(df, sink, sink_config, table_name=table_name)
    
    if success:
        console.print(f"\n[bold green][OK] Success![/bold green] Data ingested and saved to {sink}")
        if sink == 'powerbi':
            console.print("[dim]Tip: Refresh your Power BI dashboard to see the new data[/dim]")
    
    return success


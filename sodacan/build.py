"""Build command implementation with interactive REPL"""

import pandas as pd
from pathlib import Path
from rich.console import Console
from rich.table import Table
from rich.panel import Panel

from sodacan.config import load_config, get_sink_config
from sodacan.ai import translate_natural_language_to_pandas
from sodacan.sinks import save_to_sink

console = Console()


def format_dataframe_preview(df: pd.DataFrame, max_rows: int = 5, max_cols: int = 8) -> str:
    """Format DataFrame as a string preview."""
    preview_df = df.head(max_rows)
    
    # Limit columns for display
    if len(df.columns) > max_cols:
        preview_df = preview_df.iloc[:, :max_cols]
    
    return str(preview_df)


def show_dataframe_preview(df: pd.DataFrame):
    """Display DataFrame in a nice table format."""
    console.print("\n[bold cyan]🤖 Preview of your data:[/bold cyan]")
    
    # Create table
    table = Table(show_header=True, header_style="bold magenta")
    
    # Limit columns for display
    display_cols = df.columns[:10].tolist()
    for col in display_cols:
        table.add_column(str(col), overflow="fold")
    
    # Add rows
    for idx, row in df.head(5).iterrows():
        table.add_row(*[str(val)[:30] if pd.notna(val) else "NaN" for val in row[display_cols].values])
    
    console.print(table)
    console.print(f"[dim]Shape: {df.shape[0]} rows × {df.shape[1]} columns[/dim]")
    
    if len(df.columns) > 10:
        console.print(f"[dim]... and {len(df.columns) - 10} more columns[/dim]")


def build_interactive(source: str) -> bool:
    """Interactive REPL for data cleaning."""
    console.print(f"[bold]🔧 Interactive Data Workbench[/bold]")
    console.print(f"[dim]Loading: {source}[/dim]\n")
    
    # Load config
    config = load_config()
    if not config:
        return False
    
    # Load source data
    source_path = Path(source)
    if not source_path.exists():
        console.print(f"[red]✗[/red] Source file not found: {source}")
        return False
    
    df = None
    
    # Load based on file type
    if source_path.suffix.lower() == '.csv':
        encoding = config.get("source_defaults", {}).get("csv_encoding", "utf-8")
        try:
            df = pd.read_csv(source_path, encoding=encoding)
        except UnicodeDecodeError:
            for enc in ['latin-1', 'iso-8859-1', 'cp1252']:
                try:
                    df = pd.read_csv(source_path, encoding=enc)
                    break
                except:
                    continue
            if df is None:
                console.print(f"[red]✗[/red] Could not read CSV")
                return False
    
    elif source_path.suffix.lower() in ['.xlsx', '.xls']:
        df = pd.read_excel(source_path)
    
    elif source_path.suffix.lower() == '.json':
        df = pd.read_json(source_path)
    
    else:
        console.print(f"[red]✗[/red] Unsupported file type")
        return False
    
    if df is None or df.empty:
        console.print(f"[red]✗[/red] No data loaded")
        return False
    
    console.print(f"[green]✓[/green] Loaded {len(df)} rows\n")
    
    # Show initial preview
    show_dataframe_preview(df)
    
    # REPL loop
    console.print("\n[bold yellow]Enter commands (type 'help' for help, 'save to <sink>' to finish):[/bold yellow]")
    
    while True:
        try:
            command = input("\n(sodacan) > ").strip()
            
            if not command:
                continue
            
            if command.lower() in ['exit', 'quit', 'q']:
                console.print("[yellow]Exiting without saving...[/yellow]")
                break
            
            if command.lower() == 'help':
                console.print(Panel("""
[bold]Available commands:[/bold]
• Natural language: "rename 'col' to 'new_col'", "drop null rows", etc.
• save to <sink>: Save to configured sink (e.g., 'save to snowflake')
• preview: Show current data preview
• exit/quit: Exit without saving
                """, title="Help"))
                continue
            
            if command.lower() == 'preview':
                show_dataframe_preview(df)
                continue
            
            # Check for save command
            if command.lower().startswith('save to '):
                sink_name = command[8:].strip()
                sink_config = get_sink_config(sink_name)
                
                if not sink_config:
                    console.print(f"[red]✗[/red] Sink '{sink_name}' not found in config")
                    continue
                
                console.print(f"\n[bold]💾 Saving to {sink_name}...[/bold]")
                success = save_to_sink(df, sink_name, sink_config)
                
                if success:
                    console.print(f"\n[bold green]✓ Success![/bold green] Data saved to {sink_name}")
                
                break
            
            # Natural language command - translate to pandas
            console.print(f"[dim]🤖 Processing: {command}[/dim]")
            
            df_preview = format_dataframe_preview(df)
            pandas_code = translate_natural_language_to_pandas(command, df_preview, config)
            
            if not pandas_code:
                console.print("[red]✗[/red] Could not translate command. Try rephrasing.")
                continue
            
            console.print(f"[dim]Generated code:[/dim] [cyan]{pandas_code}[/cyan]")
            
            # Execute pandas code
            try:
                # Create a safe execution environment
                exec_globals = {'df': df.copy(), 'pd': pd}
                exec(pandas_code, exec_globals)
                df = exec_globals['df']
                
                console.print("[green]✓[/green] Command executed successfully")
                show_dataframe_preview(df)
                
            except Exception as e:
                console.print(f"[red]✗[/red] Error executing code: {e}")
                console.print("[yellow]Try rephrasing your command[/yellow]")
        
        except KeyboardInterrupt:
            console.print("\n[yellow]Exiting...[/yellow]")
            break
        except EOFError:
            break
    
    return True


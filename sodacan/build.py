"""Build command implementation with interactive REPL"""

import pandas as pd
import sys
from pathlib import Path
from rich.console import Console
from rich.table import Table
from rich.panel import Panel

from sodacan.config import load_config, get_sink_config
from sodacan.ai import translate_natural_language_to_pandas, extract_pdf_to_dataframe
from sodacan.sinks import save_to_sink

# Add parent directory to path to import model and executor
sys.path.insert(0, str(Path(__file__).parent.parent))
from model import start_analyzer_session, analyze_user_input
from executor import start_executor_session, execute_instructions

console = Console()


def format_dataframe_preview(df: pd.DataFrame, max_rows: int = 20, max_cols: int = 8) -> str:
    """Format DataFrame as a string preview."""
    preview_df = df.head(max_rows)
    
    # Limit columns for display
    if len(df.columns) > max_cols:
        preview_df = preview_df.iloc[:, :max_cols]
    
    return str(preview_df)


def get_dataframe_schema(df: pd.DataFrame) -> str:
    """Get DataFrame schema information as a string."""
    schema_parts = []
    for col, dtype in df.dtypes.items():
        schema_parts.append(f"'{col}': {str(dtype)}")
    return "{" + ", ".join(schema_parts) + "}"


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
    for idx, row in df.head(20).iterrows():
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
    if source_path.suffix.lower() == '.pdf':
        console.print("[dim]Extracting data from PDF using AI...[/dim]")
        model_name = config.get("ai", {}).get("model", "gemini-2.5-flash")
        csv_data = extract_pdf_to_dataframe(str(source_path), model_name)
        if not csv_data:
            console.print(f"[red]✗[/red] Could not extract data from PDF")
            return False
        
        # Parse CSV string into DataFrame
        from io import StringIO
        try:
            df = pd.read_csv(StringIO(csv_data))
            console.print(f"[green]✓[/green] Extracted {len(df)} rows from PDF")
        except Exception as e:
            # If CSV parsing fails, the PDF might not have tabular data
            # Create a simple DataFrame with the extracted text
            console.print(f"[yellow]⚠[/yellow] PDF doesn't contain tabular data. Creating text DataFrame...")
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
            console.print(f"[green]✓[/green] Created DataFrame with {len(df)} row(s) from PDF text")
    
    elif source_path.suffix.lower() == '.csv':
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
        console.print(f"[red]✗[/red] Unsupported file type: {source_path.suffix}")
        return False
    
    if df is None or df.empty:
        console.print(f"[red]✗[/red] No data loaded")
        return False
    
    console.print(f"[green]✓[/green] Loaded {len(df)} rows\n")
    
    # Initialize two-stage AI pipeline
    console.print("[dim]Initializing AI pipeline (Analyzer + Executor)...[/dim]")
    try:
        analyzer_session = start_analyzer_session()
        executor_session = start_executor_session()
        console.print("[green]✓[/green] AI pipeline ready (two-stage: Analyzer → Executor)\n")
        use_two_stage = True
    except Exception as e:
        console.print(f"[yellow]⚠[/yellow] Could not initialize two-stage pipeline: {e}")
        console.print("[dim]Falling back to single-stage translation...[/dim]\n")
        use_two_stage = False
    
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
            
            # Natural language command - two-stage pipeline
            console.print(f"[dim]🤖 Processing: {command}[/dim]")
            
            df_preview = format_dataframe_preview(df)
            df_schema = get_dataframe_schema(df)
            
            if use_two_stage:
                # Stage 1: Analyzer - Natural language → JSON instructions
                console.print("[dim]Stage 1 (Analyzer): Converting to JSON instructions...[/dim]")
                try:
                    instructions = analyze_user_input(analyzer_session, command, df_schema)
                    console.print(f"[dim]Intent: {instructions.get('intent')}[/dim]")
                    
                    # Stage 2: Executor - JSON instructions → pandas code
                    console.print("[dim]Stage 2 (Executor): Generating code from instructions...[/dim]")
                    pandas_code = execute_instructions(executor_session, instructions, df_preview)
                    
                    if pandas_code == "SINK_COMMAND":
                        console.print("[yellow]💡 Detected save command. Use 'save to <sink>' explicitly.[/yellow]")
                        continue
                    elif pandas_code == "ERROR":
                        console.print("[red]✗[/red] Could not understand command. Try rephrasing.")
                        continue
                    
                except Exception as e:
                    console.print(f"[yellow]⚠[/yellow] Two-stage pipeline error: {e}")
                    console.print("[dim]Falling back to single-stage...[/dim]")
                    pandas_code = translate_natural_language_to_pandas(command, df_preview, config)
            else:
                # Fallback to single-stage
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


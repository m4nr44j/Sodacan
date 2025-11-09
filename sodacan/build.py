"""Build command implementation with interactive REPL"""

from typing import Optional, List
import pandas as pd
import sys
from pathlib import Path
from rich.console import Console
from rich.table import Table
from rich.panel import Panel

from sodacan.config import load_config, get_sink_config, get_preview_config, get_source_config
from sodacan.ai import translate_natural_language_to_pandas, extract_pdf_to_dataframe
from sodacan.sinks import save_to_sink
from sodacan.sources import load_from_source, download_from_s3
from sodacan.pdf_merge import merge_10q_pdf

# Add parent directory to path to import model and executor
sys.path.insert(0, str(Path(__file__).parent.parent))
from model import start_analyzer_session, analyze_user_input
from executor import start_executor_session, execute_instructions

console = Console()


def format_dataframe_preview(df: pd.DataFrame, max_rows: Optional[int] = None, max_cols: Optional[int] = None) -> str:
    """Format DataFrame as a string preview."""
    # Get preview config if not provided
    if max_rows is None or max_cols is None:
        preview_config = get_preview_config()
        max_rows = max_rows or preview_config["max_rows"]
        max_cols = max_cols or preview_config["max_cols"]
    
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
    # Get preview config
    preview_config = get_preview_config()
    max_rows = preview_config["max_rows"]
    max_cols = preview_config["max_cols"]
    
    console.print("\n[bold cyan][*] Preview of your data:[/bold cyan]")
    
    # Create table
    table = Table(show_header=True, header_style="bold magenta")
    
    # Limit columns for display
    display_cols = df.columns[:max_cols].tolist()
    for col in display_cols:
        table.add_column(str(col), overflow="fold")
    
    # Add rows
    for idx, row in df.head(max_rows).iterrows():
        table.add_row(*[str(val)[:30] if pd.notna(val) else "NaN" for val in row[display_cols].values])
    
    console.print(table)
    console.print(f"[dim]Shape: {df.shape[0]} rows × {df.shape[1]} columns[/dim]")
    
    if len(df.columns) > max_cols:
        console.print(f"[dim]... and {len(df.columns) - max_cols} more columns[/dim]")


def build_interactive(source: str) -> bool:
    """Interactive REPL for data cleaning."""
    console.print(f"[bold][*] Interactive Data Workbench[/bold]")
    console.print(f"[dim]Loading: {source}[/dim]\n")
    
    # Load config
    config = load_config()
    if not config:
        return False
    
    # Check if source is a configured source name (not a file path)
    source_config = get_source_config(source)
    if source_config:
        # It's a configured source (e.g., "snowflake_prod")
        console.print(f"[dim]Loading from configured source: {source}[/dim]")
        df = load_from_source(source, source_config)
        if df is None or df.empty:
            return False
    else:
        # Check if it's an S3 path
        if source.startswith('s3://'):
            console.print(f"[dim]Downloading from S3: {source}[/dim]")
            source_path = download_from_s3(source)
            if not source_path:
                console.print(f"[red][ERROR][/red] Failed to download from S3")
                return False
            console.print(f"[green][OK][/green] Downloaded to: {source_path}")
        else:
            # It's a local file path
            source_path = Path(source)
            if not source_path.exists():
                console.print(f"[red][ERROR][/red] Source file or source name not found: {source}")
                return False
        
        df = None
        
        # Load based on file type
        if source_path.suffix.lower() == '.pdf':
            console.print("[dim]Extracting data from PDF using AI...[/dim]")
            model_name = config.get("ai", {}).get("model", "gemini-2.5-flash")
            csv_data = extract_pdf_to_dataframe(str(source_path), model_name)
            if not csv_data:
                console.print(f"[red][ERROR][/red] Could not extract data from PDF")
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
                for enc in ['latin-1', 'iso-8859-1', 'cp1252']:
                    try:
                        df = pd.read_csv(source_path, encoding=enc)
                        break
                    except:
                        continue
                if df is None:
                    console.print(f"[red][ERROR][/red] Could not read CSV")
                    return False
        
        elif source_path.suffix.lower() in ['.xlsx', '.xls']:
            df = pd.read_excel(source_path)
        
        elif source_path.suffix.lower() == '.json':
            df = pd.read_json(source_path)
        
        else:
            console.print(f"[red][ERROR][/red] Unsupported file type: {source_path.suffix}")
            return False
        
        if df is None or df.empty:
            console.print(f"[red][ERROR][/red] No data loaded")
            return False
    
    console.print(f"[green][OK][/green] Loaded {len(df)} rows\n")
    
    # Initialize two-stage AI pipeline
    console.print("[dim]Initializing AI pipeline (Analyzer + Executor)...[/dim]")
    try:
        analyzer_session = start_analyzer_session()
        executor_session = start_executor_session()
        console.print("[green][OK][/green] AI pipeline ready (two-stage: Analyzer → Executor)\n")
        use_two_stage = True
    except Exception as e:
        console.print(f"[yellow][!][/yellow] Could not initialize two-stage pipeline: {e}")
        console.print("[dim]Falling back to single-stage translation...[/dim]\n")
        use_two_stage = False
    
    # Show initial preview
    show_dataframe_preview(df)
    
    # Initialize DataFrame history for undo/redo
    df_history: List[pd.DataFrame] = [df.copy()]  # Store initial state
    history_index = 0  # Current position in history
    
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
• merge_10Q "s3://bucket/file.pdf" --company "Google" --quarter "Q2-2025": Merge 10-Q PDF from S3
• save to <sink>: Save to configured sink (e.g., 'save to snowflake_prod "QBR_FINAL"')
• save to <sink1> and <sink2>: Save to multiple sinks
• preview: Show current data preview
• undo: Revert to previous DataFrame state
• redo: Re-apply transformation after undo
• history: Show transformation history
• exit/quit: Exit without saving
                """, title="Help"))
                continue
            
            if command.lower() == 'preview':
                show_dataframe_preview(df)
                continue
            
            # Handle undo command
            if command.lower() == 'undo':
                if history_index > 0:
                    history_index -= 1
                    df = df_history[history_index].copy()
                    console.print(f"[green][OK][/green] Undone. Reverted to state {history_index + 1}/{len(df_history)}")
                    show_dataframe_preview(df)
                else:
                    console.print("[yellow][!][/yellow] Nothing to undo. Already at initial state.")
                continue
            
            # Handle redo command
            if command.lower() == 'redo':
                if history_index < len(df_history) - 1:
                    history_index += 1
                    df = df_history[history_index].copy()
                    console.print(f"[green][OK][/green] Redone. Restored to state {history_index + 1}/{len(df_history)}")
                    show_dataframe_preview(df)
                else:
                    console.print("[yellow][!][/yellow] Nothing to redo. Already at latest state.")
                continue
            
            # Handle history command
            if command.lower() == 'history':
                console.print(f"\n[bold]Transformation History:[/bold]")
                console.print(f"Total states: {len(df_history)}")
                console.print(f"Current state: {history_index + 1}/{len(df_history)}")
                for i, state_df in enumerate(df_history):
                    marker = "←" if i == history_index else " "
                    console.print(f"  {marker} State {i + 1}: {state_df.shape[0]} rows × {state_df.shape[1]} columns")
                console.print()
                continue
            
            # Check for merge_10Q command
            if command.lower().startswith('merge_10q ') or command.lower().startswith('merge_10q '):
                # Parse: merge_10Q "s3://bucket/file.pdf" --company "Google" --quarter "Q2-2025"
                parts = command.split('"')
                if len(parts) >= 2:
                    s3_path = parts[1]
                    # Extract company and quarter from command
                    company = "Google"  # default
                    quarter = "Q2-2025"  # default
                    if '--company' in command:
                        try:
                            company_idx = command.index('--company') + len('--company')
                            company_part = command[company_idx:].strip().split()[0].strip('"\'')
                            company = company_part
                        except:
                            pass
                    if '--quarter' in command:
                        try:
                            quarter_idx = command.index('--quarter') + len('--quarter')
                            quarter_part = command[quarter_idx:].strip().split()[0].strip('"\'')
                            quarter = quarter_part
                        except:
                            pass
                    
                    console.print(f"[dim]Merging 10-Q PDF: {s3_path}[/dim]")
                    merged_df = merge_10q_pdf(s3_path, company, quarter, df, config)
                    if merged_df is not None:
                        # Store in history before merge
                        if history_index < len(df_history) - 1:
                            df_history = df_history[:history_index + 1]
                        df = merged_df
                        df_history.append(df.copy())
                        history_index = len(df_history) - 1
                        console.print("[green][OK][/green] Merge complete")
                        show_dataframe_preview(df)
                    else:
                        console.print("[red][ERROR][/red] Merge failed")
                else:
                    console.print("[red][ERROR][/red] Invalid merge_10Q syntax. Use: merge_10Q \"s3://bucket/file.pdf\" --company \"Google\" --quarter \"Q2-2025\"")
                continue
            
            # Check for save command (supports multiple sinks: "save to sink1 and sink2")
            if command.lower().startswith('save to '):
                rest = command[8:].strip()
                
                # Parse multiple sinks: "snowflake_prod 'QBR_FINAL_DATA' and google_sheet_bi"
                sinks_to_save = []
                if ' and ' in rest:
                    parts = rest.split(' and ')
                    for part in parts:
                        part = part.strip()
                        # Check for table name in quotes
                        if "'" in part or '"' in part:
                            # Extract sink name and table name
                            import re
                            match = re.search(r"(\w+)\s+['\"]([^'\"]+)['\"]", part)
                            if match:
                                sink_name = match.group(1)
                                table_name = match.group(2)
                                sinks_to_save.append((sink_name, {'table_name': table_name}))
                            else:
                                sink_name = part.split()[0]
                                sinks_to_save.append((sink_name, {}))
                        else:
                            sink_name = part.split()[0]
                            sinks_to_save.append((sink_name, {}))
                else:
                    # Single sink, check for table name
                    import re
                    match = re.search(r"(\w+)\s+['\"]([^'\"]+)['\"]", rest)
                    if match:
                        sink_name = match.group(1)
                        table_name = match.group(2)
                        sinks_to_save.append((sink_name, {'table_name': table_name}))
                    else:
                        sink_name = rest.split()[0]
                        sinks_to_save.append((sink_name, {}))
                
                # Save to all sinks
                all_success = True
                for sink_name, kwargs in sinks_to_save:
                    sink_config = get_sink_config(sink_name)
                    if not sink_config:
                        console.print(f"[red][ERROR][/red] Sink '{sink_name}' not found in config")
                        all_success = False
                        continue
                    
                    console.print(f"\n[bold][*] Saving to {sink_name}...[/bold]")
                    success = save_to_sink(df, sink_name, sink_config, **kwargs)
                    if not success:
                        all_success = False
                
                if all_success:
                    console.print(f"\n[bold green][OK] Success![/bold green] Data saved to all sinks")
                
                break
            
            # Natural language command - two-stage pipeline
            console.print(f"[dim][*] Processing: {command}[/dim]")
            
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
                        console.print("[yellow]Tip: Detected save command. Use 'save to <sink>' explicitly.[/yellow]")
                        continue
                    elif pandas_code == "ERROR":
                        console.print("[red][ERROR][/red] Could not understand command. Try rephrasing.")
                        continue
                    
                except Exception as e:
                    console.print(f"[yellow][!][/yellow] Two-stage pipeline error: {e}")
                    console.print("[dim]Falling back to single-stage...[/dim]")
                    pandas_code = translate_natural_language_to_pandas(command, df_preview, config)
            else:
                # Fallback to single-stage
                pandas_code = translate_natural_language_to_pandas(command, df_preview, config)
            
            if not pandas_code:
                console.print("[red][ERROR][/red] Could not translate command. Try rephrasing.")
                continue
            
            console.print(f"[dim]Generated code:[/dim] [cyan]{pandas_code}[/cyan]")
            
            # Execute pandas code
            try:
                # Store current state in history before transformation
                # If we're not at the end of history, truncate future states
                if history_index < len(df_history) - 1:
                    df_history = df_history[:history_index + 1]
                
                # Create a safe execution environment
                exec_globals = {'df': df.copy(), 'pd': pd}
                exec(pandas_code, exec_globals)
                new_df = exec_globals['df']
                
                # Only add to history if DataFrame actually changed
                if not new_df.equals(df):
                    df = new_df
                    df_history.append(df.copy())
                    history_index = len(df_history) - 1
                    console.print("[green][OK][/green] Command executed successfully")
                    show_dataframe_preview(df)
                else:
                    console.print("[yellow][!][/yellow] Command executed but DataFrame unchanged")
                    show_dataframe_preview(df)
                
            except Exception as e:
                console.print(f"[red][ERROR][/red] Error executing code: {e}")
                console.print("[yellow]Try rephrasing your command[/yellow]")
        
        except KeyboardInterrupt:
            console.print("\n[yellow]Exiting...[/yellow]")
            break
        except EOFError:
            break
    
    return True


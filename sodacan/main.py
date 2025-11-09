"""Main CLI entry point for sodacan"""

import io
from pathlib import Path

import pandas as pd
import typer
from rich.console import Console
from rich.panel import Panel
from rich.table import Table
from rich.text import Text
from rich.align import Align

# Load environment variables from .env file
try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass  # dotenv is optional

try:
    from model import start_soda_chat_session
except Exception:  # pragma: no cover - optional dependency
    start_soda_chat_session = None  # type: ignore[assignment]
from sodacan import build as build_module
from sodacan import config
from sodacan import ingest as ingest_module
from sodacan import shell as shell_module
from sodacan import watch as watch_module

app = typer.Typer(
    name="sodacan",
    help="The AI Data Workbench - Turn messy enterprise data into BI-ready insights in minutes",
    add_completion=False,
    invoke_without_command=True,
)

console = Console()

INTRO_LOGO = r"""
                                                                          ║
███████╗ ██████╗ ██████╗  █████╗  ██████╗ █████╗ ███╗   ██╗        ██████╗║
██╔════╝██╔═══██╗██╔══██╗██╔══██╗██╔════╝██╔══██╗████╗  ██║          █╔═══█║
███████╗██║   ██║██║  ██║███████║██║     ███████║██╔██╗ ██║          █║   █║
╚════██║██║   ██║██║  ██║██╔══██║██║     ██╔══██║██║╚██╗██║          █║ █ █║
███████║╚██████╔╝██████╔╝██║  ██║╚██████╗██║  ██║██║ ╚████║          █╚═══█║   
╚══════╝ ╚═════╝ ╚═════╝ ╚═╝  ╚═╝ ╚═════╝╚═╝  ╚═╝╚═╝  ╚═══╝           ╚███╔╝                                                                                                                                            
"""


def _render_logo() -> None:
    """Display the sodacan logo."""
    console.print(
        Panel(
            Align.center(Text(INTRO_LOGO.rstrip() + "\n", style="bold cyan")),
            border_style="cyan",
        )
    )


def _render_intro() -> None:
    """Display a splash screen with top commands and aliases."""
    _render_logo()

    table = Table.grid(padding=(0, 2))
    table.add_column("Command", style="bold")
    table.add_column("Description", style="dim")
    table.add_column("Alias", style="cyan")
    table.add_row("ingest", "One-shot source → sink magic", "i")
    table.add_row("build", "Interactive AI data workbench", "b")
    table.add_row("watch", "Live feed watcher with AI tasks", "w")
    table.add_row("config", "Inspect or edit sodacan.yaml", "cfg")
    table.add_row("shell", "Immersive multi-command environment", "-")

    console.print(table)
    console.print()
    console.print(Text("Tip: run 'sodacan <command> --help' for details.", style="bold"))


def config_init():
    """Initialize a new sodacan.yaml configuration file."""
    config.init_config()


def config_view():
    """View the current sodacan.yaml configuration."""
    config.view_config()

def get_schema_string(df: pd.DataFrame) -> str:
    """
    Captures the output of df.info() as a string to be used 
    as context for the AI.
    """
    # Create an in-memory text buffer
    buffer = io.StringIO()
    
    # By default, df.info() prints to the console. 
    # The 'buf=buffer' argument redirects that output into our buffer.
    df.info(buf=buffer)
    
    # Get the string value from the buffer
    return buffer.getvalue()

def config_set(
    key: str = typer.Argument(..., help="Configuration key (e.g., 'sinks.snowflake.role')"),
    value: str = typer.Argument(..., help="Value to set")
):
    """Set a configuration value using dot notation."""
    config.set_config(key, value)


# Create config subcommand group
config_app = typer.Typer(help="Manage sodacan configuration")
config_app.command("init")(config_init)
config_app.command("view")(config_view)
config_app.command("set")(config_set)
app.add_typer(config_app, name="config")
app.add_typer(watch_module.watch_app, name="watch")

cfg_app = typer.Typer(hidden=True)
cfg_app.command("init")(config_init)
cfg_app.command("view")(config_view)
cfg_app.command("set")(config_set)
app.add_typer(cfg_app, name="cfg")


@app.command()
def ingest(
    source: str = typer.Argument(..., help="Source file path (PDF, CSV, Excel, JSON)"),
    sink: str = typer.Argument(..., help="Sink name from config (e.g., 'powerbi', 'snowflake')"),
    table: str = typer.Option(None, "--table", help="Override table name (for database sinks)"),
):
    """Ingest data from source and save to configured sink (non-interactive, headless)."""
    ingest_module.ingest_data(source, sink, table_name=table)


@app.command("i", help="Alias for 'ingest'", hidden=True)
def ingest_alias(
    source: str = typer.Argument(..., help="Source file path (PDF, CSV, Excel, JSON)"),
    sink: str = typer.Argument(..., help="Sink name from config (e.g., 'powerbi', 'snowflake')"),
    table: str = typer.Option(None, "--table", help="Override table name (for database sinks)"),
) -> None:
    ingest(source=source, sink=sink, table=table)


@app.command()
def build(
    source: str = typer.Argument(..., help="Source file path (PDF, CSV, Excel, JSON)"),
    interactive: bool = typer.Option(True, "--interactive/--no-interactive", help="Run in interactive REPL mode")
):
    """Build and clean data interactively."""
    if interactive:
        build_module.build_interactive(source)
    else:
        console.print("[yellow]Non-interactive mode not yet implemented[/yellow]")


@app.command("b", help="Alias for 'build'", hidden=True)
def build_alias(
    source: str = typer.Argument(..., help="Source file path (CSV, Excel, JSON)"),
    interactive: bool = typer.Option(True, "--interactive/--no-interactive", help="Run in interactive REPL mode")
) -> None:
    build(source=source, interactive=interactive)


@app.callback()
def main(ctx: typer.Context):
    """sodacan: The AI Data Workbench"""
    # Display logo on all commands
    if ctx.invoked_subcommand is not None:
        _render_logo()
    else:
        _render_intro()

@app.command()
def shell() -> None:
    """Open the sodacan interactive shell."""
    shell_module.launch_shell()


@app.command("w", help="Alias for 'watch'", hidden=True)
def watch_alias(
    source: Path = typer.Option(..., "--source", resolve_path=True, help="Path to the source CSV file to watch"),
    sink: str = typer.Option(..., "--sink", help="Sink name from the configuration"),
    task: str = typer.Option(..., "--task", help="AI task identifier to execute for new records"),
    poll_interval: float = typer.Option(1.0, "--poll-interval", min=0.1, help="Polling interval in seconds for file changes"),
    once: bool = typer.Option(False, "--once/--continuous", help="Process the file once instead of watching continuously"),
) -> None:
    watch_module.watch_source(
        source=source,
        sink=sink,
        task=task,
        poll_interval=poll_interval,
        once=once,
    )


def cli():
    """Entry point for setuptools."""
    app()


if __name__ == "__main__":
    cli()

    if start_soda_chat_session is not None:
        chat = start_soda_chat_session()
        while True:
            user_input = input("(soda) > ")
            if user_input.lower() in ["exit", "quit"]:
                break

            schema_string = get_schema_string(df)  # noqa: F821 - placeholder for future integration
            prompt = f"""
            **Current DataFrame Schema:**
            ```
            {schema_string}
            ```

            **User Instruction:**
            "{user_input}"
            """
            response = chat.send_message(prompt)

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
    name="soda",
    help="AI Data Workbench - Clean, transform, and ship data with natural language",
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
    table.add_column("Command", style="bold cyan")
    table.add_column("Description", style="dim")
    table.add_row("soda build <source>", "Interactive AI data workbench")
    table.add_row("soda watch <source>", "Live feed monitoring with AI enrichment")
    table.add_row("soda config", "View or edit configuration")
    table.add_row("soda ingest <source> <sink>", "One-shot data pipeline")

    console.print(table)
    console.print()
    console.print(Text("Run 'soda --help' for all commands", style="dim"))


def config_command(
    init: bool = typer.Option(False, "--init", help="Create a new sodacan.yaml file"),
    edit: bool = typer.Option(False, "--edit", help="Open sodacan.yaml in your editor"),
):
    """View or manage your sodacan.yaml configuration."""
    if init:
        config.init_config()
    elif edit:
        import subprocess
        import os
        editor = os.environ.get('EDITOR', 'nano')
        config_path = Path.cwd() / 'sodacan.yaml'
        if not config_path.exists():
            console.print("[yellow]No sodacan.yaml found. Use --init to create one.[/yellow]")
            return
        subprocess.run([editor, str(config_path)])
    else:
        config.view_config()


# Register commands
app.command("config")(config_command)
app.add_typer(watch_module.watch_app, name="watch")


@app.command()
def ingest(
    source: str = typer.Argument(..., help="Source: file path or configured source name"),
    sink: str = typer.Argument(..., help="Sink: configured sink name (snowflake_prod, google_sheet_bi, etc.)"),
    table: str = typer.Option(None, "--table", "-t", help="Table name (for database sinks)"),
):
    """One-shot pipeline: load from source, save to sink. No transformations."""
    ingest_module.ingest_data(source, sink, table_name=table)


@app.command()
def build(
    source: str = typer.Argument(..., help="Source: file path or configured source name (e.g., 'snowflake_prod')"),
):
    """Interactive AI workbench: clean, transform, and ship data with natural language."""
    build_module.build_interactive(source)


@app.callback()
def main(ctx: typer.Context):
    """soda: AI Data Workbench"""
    # Display logo on all commands
    if ctx.invoked_subcommand is not None:
        _render_logo()
    else:
        _render_intro()


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

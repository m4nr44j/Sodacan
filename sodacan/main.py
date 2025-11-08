"""Main CLI entry point for sodacan"""

import typer
from rich.console import Console

from sodacan import config
from sodacan import ingest as ingest_module
from sodacan import build as build_module
from sodacan import shell as shell_module

app = typer.Typer(
    name="sodacan",
    help="The AI Data Workbench - Turn messy enterprise data into BI-ready insights in minutes",
    add_completion=False,
)

console = Console()


def config_init():
    """Initialize a new sodacan.yaml configuration file."""
    config.init_config()


def config_view():
    """View the current sodacan.yaml configuration."""
    config.view_config()


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


@app.command()
def ingest(
    source: str = typer.Argument(..., help="Source file path (PDF, CSV, Excel, JSON)"),
    sink: str = typer.Argument(..., help="Sink name from config (e.g., 'powerbi', 'snowflake')")
):
    """Ingest data from source and save to configured sink."""
    ingest_module.ingest_data(source, sink)


@app.command()
def build(
    source: str = typer.Argument(..., help="Source file path (CSV, Excel, JSON)"),
    interactive: bool = typer.Option(True, "--interactive/--no-interactive", help="Run in interactive REPL mode")
):
    """Build and clean data interactively."""
    if interactive:
        build_module.build_interactive(source)
    else:
        console.print("[yellow]Non-interactive mode not yet implemented[/yellow]")


@app.callback()
def main():
    """sodacan: The AI Data Workbench"""
    pass


@app.command()
def shell() -> None:
    """Open the sodacan interactive shell."""
    shell_module.launch_shell()


def cli():
    """Entry point for setuptools."""
    app()


if __name__ == "__main__":
    cli()


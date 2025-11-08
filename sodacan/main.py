"""Main CLI entry point for sodacan"""

import typer
import io
import pandas as pd
from rich.console import Console
from model import start_soda_chat_session
from sodacan import config
from sodacan import ingest as ingest_module
from sodacan import build as build_module
from sodacan import shell as shell_module
from sodacan import watch as watch_module

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

chat = start_soda_chat_session()

@app.command()
def shell() -> None:
    """Open the sodacan interactive shell."""
    shell_module.launch_shell()


def cli():
    """Entry point for setuptools."""
    app()


if __name__ == "__main__":
    cli()
    while True: 

        user_input = input("(soda) > ")
        if user_input.lower() in ['exit', 'quit']:
            break

        # ----------------------------------------------------
        # THIS IS WHERE YOU CREATE THE 'prompt'
        # ----------------------------------------------------
        
        # 1. Get the "hidden context": the *current* schema of your DataFrame
        #    (You need to define this helper function)
        schema_string = get_schema_string(df) 
        
        # 2. Build the full prompt string using an f-string
        prompt = f"""
        **Current DataFrame Schema:**
        ```
        {schema_string}
        ```

        **User Instruction:**
        "{user_input}"
        """
        response = chat.send_message(prompt)

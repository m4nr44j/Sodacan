"""Interactive shell entry point for sodacan."""

from __future__ import annotations

import shlex
from pathlib import Path
from typing import Set, List, Optional

import typer
from rich.console import Console
from rich.panel import Panel
from rich.table import Table

from sodacan import config
from sodacan.config import set_shell_mode
from sodacan import ingest as ingest_module
from sodacan import build as build_module
from sodacan import watch as watch_module

console = Console()

PROMPT = "(sodacan) > "
EXIT_COMMANDS: Set[str] = {"exit", "quit", "q"}
HELP_COMMANDS: Set[str] = {"help", "?"}


def _parse_command(command: str) -> tuple[str, List[str]]:
    """Parse a command string into command and arguments."""
    parts = shlex.split(command)
    if not parts:
        return "", []
    cmd = parts[0].lower()
    args = parts[1:]
    return cmd, args


def _show_help() -> None:
    """Display help information for all available commands."""
    console.print(Panel("""
[bold]Available Commands:[/bold]

[bold cyan]Data Operations:[/bold cyan]
  ingest --source <path> --sink <name> [--table <table>]
                              - Ingest data from source to sink
  i --source <path> --sink <name> [--table <table>]
                              - Alias for ingest
  build <source>             - Interactive data cleaning workbench
  b <source>                 - Alias for build
  watch --source <file> --sink <sink> --task <task>
                              - Watch CSV file and enrich with AI tasks
  w --source <file> --sink <sink> --task <task>
                              - Alias for watch

[bold cyan]Configuration:[/bold cyan]
  config init                - Initialize sodacan.yaml
  config view                - View current configuration
  config set <key> <value>   - Set configuration value
  cfg <subcommand>           - Alias for config

[bold cyan]Shell:[/bold cyan]
  help, ?                    - Show this help message
  exit, quit, q              - Exit the shell
  clear                      - Clear the screen

[bold]Examples:[/bold]
  ingest --source sample.csv --sink powerbi
  ingest --source report.pdf --sink snowflake_prod --table raw_pdf_ingest
  build messy_data.csv
  config set sinks.snowflake.role SYSADMIN
  watch --source data.csv --sink powerbi --task categorize_transaction
    """, title="Sodacan Shell Help", border_style="cyan"))


def _handle_ingest(args: List[str]) -> bool:
    """Handle ingest command."""
    # Parse flags: --source, --sink, --table
    source = None
    sink = None
    table = None
    
    i = 0
    while i < len(args):
        if args[i] == "--source" and i + 1 < len(args):
            source = args[i + 1]
            i += 2
        elif args[i] == "--sink" and i + 1 < len(args):
            sink = args[i + 1]
            i += 2
        elif args[i] == "--table" and i + 1 < len(args):
            table = args[i + 1]
            i += 2
        else:
            # Backward compatibility: allow positional args
            if source is None:
                source = args[i]
            elif sink is None:
                sink = args[i]
            i += 1
    
    if not source or not sink:
        console.print("[red]✗[/red] Usage: ingest --source <path> --sink <name> [--table <table>]")
        console.print("[dim]Or (legacy): ingest <source> <sink>[/dim]")
        return False
    
    return ingest_module.ingest_data(source, sink, table_name=table)


def _handle_build(args: List[str]) -> bool:
    """Handle build command."""
    if len(args) < 1:
        console.print("[red]✗[/red] Usage: build <source>")
        return False
    
    source = args[0]
    # Check for --interactive flag
    interactive = "--no-interactive" not in args
    return build_module.build_interactive(source)


def _handle_config(args: List[str]) -> bool:
    """Handle config commands."""
    if not args:
        console.print("[red]✗[/red] Usage: config <init|view|set> [args...]")
        return False
    
    subcommand = args[0].lower()
    
    if subcommand == "init":
        return config.init_config()
    elif subcommand == "view":
        config.view_config()
        return True
    elif subcommand == "set":
        if len(args) < 3:
            console.print("[red]✗[/red] Usage: config set <key> <value>")
            return False
        key = args[1]
        value = args[2]
        return config.set_config(key, value)
    else:
        console.print(f"[red]✗[/red] Unknown config subcommand: {subcommand}")
        console.print("[yellow]Available: init, view, set[/yellow]")
        return False


def _handle_watch(args: List[str]) -> bool:
    """Handle watch command."""
    # Parse watch arguments
    source = None
    sink = None
    task = None
    poll_interval = 1.0
    once = False
    
    i = 0
    while i < len(args):
        if args[i] == "--source" and i + 1 < len(args):
            source = Path(args[i + 1])
            i += 2
        elif args[i] == "--sink" and i + 1 < len(args):
            sink = args[i + 1]
            i += 2
        elif args[i] == "--task" and i + 1 < len(args):
            task = args[i + 1]
            i += 2
        elif args[i] == "--poll-interval" and i + 1 < len(args):
            try:
                poll_interval = float(args[i + 1])
            except ValueError:
                console.print(f"[red]✗[/red] Invalid poll-interval: {args[i + 1]}")
                return False
            i += 2
        elif args[i] == "--once":
            once = True
            i += 1
        else:
            i += 1
    
    if not source or not sink or not task:
        console.print("[red]✗[/red] Usage: watch --source <file> --sink <sink> --task <task> [--poll-interval <seconds>] [--once]")
        return False
    
    watch_module.watch_source(
        source=source,
        sink=sink,
        task=task,
        poll_interval=poll_interval,
        once=once
    )
    return True


def launch_shell() -> None:
    """Launch the full-featured interactive shell."""
    # Enable shell mode for command recommendations
    set_shell_mode(True)
    
    console.print("[bold cyan]Welcome to the sodacan shell![/bold cyan]")
    console.print("[dim]Type 'help' to see all available commands. Type 'exit' to leave.\n[/dim]")

    while True:
        try:
            command = typer.prompt(PROMPT, prompt_suffix="").strip()
        except typer.Abort:
            console.print("\n[dim]Aborted shell session.[/dim]")
            break
        except EOFError:
            console.print("\n[dim]EOF received. Exiting shell.[/dim]")
            break
        except KeyboardInterrupt:
            console.print("\n[yellow]Use 'exit' or 'quit' to leave the shell.[/yellow]")
            continue

        if not command:
            continue

        # Parse command
        cmd, args = _parse_command(command)
        
        if not cmd:
            continue

        # Handle exit commands
        if cmd in EXIT_COMMANDS:
            console.print("[bold]Goodbye![/bold]")
            break

        # Handle help
        if cmd in HELP_COMMANDS:
            _show_help()
            continue

        # Handle clear
        if cmd == "clear":
            console.clear()
            continue

        # Route to appropriate handler
        try:
            if cmd in ["ingest", "i"]:
                _handle_ingest(args)
            elif cmd in ["build", "b"]:
                _handle_build(args)
            elif cmd in ["config", "cfg"]:
                _handle_config(args)
            elif cmd in ["watch", "w"]:
                _handle_watch(args)
            else:
                console.print(f"[yellow]Unknown command:[/yellow] {cmd}")
                console.print("[dim]Type 'help' to see available commands.[/dim]")
        except Exception as e:
            console.print(f"[red]✗[/red] Error executing command: {e}")
            console.print("[dim]Try 'help' for usage examples.[/dim]")

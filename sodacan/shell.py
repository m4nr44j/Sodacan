"""Interactive shell entry point for sodacan."""

from __future__ import annotations

from typing import Set

import typer

from rich.console import Console

console = Console()

PROMPT = "(sodacan) > "
EXIT_COMMANDS: Set[str] = {"exit", "quit", "q"}
HELP_COMMANDS: Set[str] = {"help", "?"}


def launch_shell() -> None:
    """Launch a lightweight interactive shell placeholder."""
    console.print("[bold]Welcome to the sodacan shell (preview)[/bold]")
    console.print("Type 'help' to see placeholder commands. Type 'exit' to leave.\n")

    while True:
        try:
            command = typer.prompt(PROMPT, prompt_suffix="").strip()
        except typer.Abort:
            console.print("\n[dim]Aborted shell session.[/dim]")
            break
        except EOFError:
            console.print("\n[dim]EOF received. Exiting shell.[/dim]")
            break

        if not command:
            continue

        lower = command.lower()
        if lower in EXIT_COMMANDS:
            console.print("[bold]Goodbye![/bold]")
            break

        if lower in HELP_COMMANDS:
            console.print("\n[bold cyan]Placeholder commands[/bold cyan]")
            console.print("  help           Show this message")
            console.print("  exit, quit, q  Leave the shell")
            console.print("\nMore actions will arrive as the workbench evolves.\n")
            continue

        console.print(f"[yellow]Unrecognized placeholder command:[/yellow] {command}")
        console.print("Try 'help' for now—the real shell will wire into ingest/build soon.\n")

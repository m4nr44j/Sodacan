"""File watching command implementation for sodacan."""

from __future__ import annotations

import csv
import time
from pathlib import Path
from typing import Dict, List

import pandas as pd
import typer
from rich.console import Console

from sodacan import ai
from sodacan import config as config_module
from sodacan.config import get_config_command
from sodacan import sinks

console = Console()


def _load_header(source: Path) -> List[str]:
    """Read the header row from a CSV source."""
    with source.open("r", encoding="utf-8", newline="") as handle:
        header_line = handle.readline()
        if not header_line:
            return []
        return next(csv.reader([header_line.strip()]))


def _read_new_lines(source: Path, offset: int) -> List[str]:
    """Return new lines appended since the last offset."""
    with source.open("r", encoding="utf-8", newline="") as handle:
        handle.seek(offset)
        lines = handle.readlines()
        return [line for line in lines if line.strip()]


def _lines_to_records(header: List[str], lines: List[str]) -> List[Dict[str, str]]:
    """Convert CSV lines into dictionaries using the header."""
    records: List[Dict[str, str]] = []
    reader = csv.reader(lines)
    for row in reader:
        records.append({header[idx]: value for idx, value in enumerate(row)})
    return records


def watch_source(
    source: Path,
    sink: str,
    task: str,
    poll_interval: float = 1.0,
    once: bool = False,
) -> None:
    """Monitor the source for new rows, enrich them, and save to the sink."""
    config = config_module.load_config()
    if not config:
        return

    sink_config = config_module.get_sink_config(sink)
    if not sink_config:
        console.print(f"[red][ERROR][/red] Sink '{sink}' not found in configuration. Run '{get_config_command('view')}' to inspect available sinks.")
        return

    task_config = config_module.get_task_config(task)
    if not task_config:
        console.print(f"[red][ERROR][/red] Task '{task}' not found in configuration. Define it under 'tasks' in sodacan.yaml.")
        return

    if not source.exists():
        console.print(f"[yellow][!][/yellow] Source file '{source}' does not exist yet. Waiting for it to appear...")

    header: List[str] = []
    last_offset = 0
    output_field = task_config.get("output_field", "task_output")
    
    # Check if this is a pass-through task (no AI enrichment needed)
    is_pass_through = task == "pass_through" or task_config.get("pass_through", False)

    console.print(f"[bold][*] Watching[/bold] {source} → {sink} (task: {task})")
    console.print("[dim]Press Ctrl+C to stop.[/dim]" if not once else "[dim]Running single pass...[/dim]")

    try:
        while True:
            if not source.exists():
                if once:
                    console.print(f"[red][ERROR][/red] Source '{source}' not found. Exiting because '--once' was supplied.")
                    return
                time.sleep(poll_interval)
                continue

            if not header:
                header = _load_header(source)
                if not header:
                    time.sleep(poll_interval)
                    continue
                with source.open("r", encoding="utf-8", newline="") as handle:
                    handle.seek(0, 2)
                    last_offset = handle.tell()
                continue

            new_lines = _read_new_lines(source, last_offset)
            last_offset = source.stat().st_size

            if new_lines:
                records = _lines_to_records(header, new_lines)
                console.print(f"[green][OK][/green] Detected {len(records)} new row(s)")

                for record in records:
                    if is_pass_through:
                        # Pass-through: no AI call, just use the record as-is
                        enriched = record
                    else:
                        # Regular task: call AI to enrich the record
                        task_output = ai.run_task_prompt(task_config, record, config)
                        if task_output is None:
                            console.print("[red][ERROR][/red] Skipping row due to AI error.")
                            continue
                        enriched = {**record, output_field: task_output}
                    
                    df = pd.DataFrame([enriched])
                    # Use append mode for watch command to add rows incrementally
                    success = sinks.save_to_sink(df, sink, sink_config, append=True)
                    if success:
                        console.print(f"[dim]Appended row to {sink}[/dim]")

            if once:
                console.print("[bold green][OK][/bold green] Completed single pass.")
                return

            time.sleep(poll_interval)
    except KeyboardInterrupt:
        console.print("\n[dim]Watcher stopped by user.[/dim]")


watch_app = typer.Typer(help="Monitor sources and apply AI tasks before saving to sinks.", invoke_without_command=True)


@watch_app.callback()
def watch_callback(
    ctx: typer.Context,
    source: Path = typer.Option(..., "--source", resolve_path=True, help="Path to the source CSV file to watch"),
    sink: str = typer.Option(..., "--sink", help="Sink name from the configuration"),
    task: str = typer.Option(..., "--task", help="AI task identifier to execute for new records"),
    poll_interval: float = typer.Option(1.0, "--poll-interval", min=0.1, help="Polling interval in seconds for file changes"),
    once: bool = typer.Option(False, "--once/--continuous", help="Process the file once instead of watching continuously"),
) -> None:
    """Entry point for the `sodacan watch` command."""
    if ctx.invoked_subcommand is not None:
        return
    watch_source(source=source, sink=sink, task=task, poll_interval=poll_interval, once=once)

"""Configuration management for sodacan"""

import os
import yaml
from pathlib import Path
from typing import Any, Dict, Optional
from rich.console import Console
from rich.syntax import Syntax

console = Console()

CONFIG_FILENAME = "sodacan.yaml"

# Track if we're running in shell mode (for command recommendations)
_in_shell_mode = False


def set_shell_mode(enabled: bool = True) -> None:
    """Set whether we're running in shell mode (affects command recommendations)."""
    global _in_shell_mode
    _in_shell_mode = enabled


def get_config_command(operation: str) -> str:
    """Get the appropriate config command based on shell mode."""
    if _in_shell_mode:
        return f"config {operation}"
    return f"sodacan config {operation}"


def get_config_path() -> Path:
    """Get the path to the config file in the current directory."""
    return Path.cwd() / CONFIG_FILENAME


def get_default_config() -> Dict[str, Any]:
    """Return the default configuration."""
    return {
        "source_defaults": {
            "csv_encoding": "utf-8"
        },
        "sinks": {
            "powerbi": {
                "type": "sqlite",
                "database_file": "./prod_dashboard.db",
                "table_name": "sales_data_2025"
            },
            "snowflake": {
                "type": "snowflake",
                "auto_connect": True,
                "account": "your_account.snowflakecomputing.com",
                "user": "your_username",
                "password": "your_password",
                "role": "ANALYST",
                "warehouse": "COMPUTE_WH",
                "database": "HACKATHON_DB",
                "schema": "PUBLIC",
                "table_name": "LOADED_DATA"
            },
            "postgres": {
                "type": "postgres",
                "host": "localhost",
                "port": 5432,
                "database": "mydb",
                "user": "postgres",
                "password": "your_password",
                "schema": "public",
                "table_name": "loaded_data"
            },
            "mysql": {
                "type": "mysql",
                "host": "localhost",
                "port": 3306,
                "database": "mydb",
                "user": "root",
                "password": "your_password",
                "table_name": "loaded_data"
            },
            "excel": {
                "type": "excel",
                "output_dir": "./client_exports/"
            },
            "googlesheets": {
                "type": "googlesheets",
                "spreadsheet_id": "your_spreadsheet_id_here",
                "worksheet_name": "Sheet1",
                "credentials_path": "./path/to/service-account.json"
            },
            "gcs": {
                "type": "gcs_parquet",
                "bucket_name": "your-bucket-name",
                "blob_path": "data/export.parquet",
                "project_id": "your-gcp-project-id",
                "credentials_path": "./path/to/service-account.json"
            }
        },
        "tasks": {
            "categorize_transaction": {
                "prompt_template": (
                    "You are a finance expert. Categorize the transaction described below "
                    "into a high-level expense category. Provide only the category name.\n\n"
                    "{row}"
                ),
                "output_field": "category"
            }
        }
    }


def init_config() -> bool:
    """Initialize a new sodacan.yaml file."""
    config_path = get_config_path()
    
    if config_path.exists():
        console.print(f"[yellow]⚠[/yellow] {CONFIG_FILENAME} already exists. Use '{get_config_command('view')}' to see it.")
        return False
    
    config = get_default_config()
    with open(config_path, 'w') as f:
        yaml.dump(config, f, default_flow_style=False, sort_keys=False)
    
    console.print(f"[green]✓[/green] Created {CONFIG_FILENAME}")
    return True


def load_config() -> Dict[str, Any]:
    """Load the configuration from sodacan.yaml."""
    config_path = get_config_path()
    
    if not config_path.exists():
        console.print(f"[red]✗[/red] {CONFIG_FILENAME} not found. Run '{get_config_command('init')}' first.")
        return {}
    
    with open(config_path, 'r') as f:
        return yaml.safe_load(f) or {}


def save_config(config: Dict[str, Any]) -> None:
    """Save the configuration to sodacan.yaml."""
    config_path = get_config_path()
    with open(config_path, 'w') as f:
        yaml.dump(config, f, default_flow_style=False, sort_keys=False)


def view_config() -> None:
    """Display the current configuration."""
    config_path = get_config_path()
    
    if not config_path.exists():
        console.print(f"[red]✗[/red] {CONFIG_FILENAME} not found. Run '{get_config_command('init')}' first.")
        return
    
    with open(config_path, 'r') as f:
        content = f.read()
    
    syntax = Syntax(content, "yaml", theme="monokai", line_numbers=True)
    console.print(syntax)


def set_config(key: str, value: str) -> bool:
    """Set a configuration value using dot notation (e.g., 'sinks.snowflake.role')."""
    config = load_config()
    
    if not config:
        return False
    
    # Parse the key path
    keys = key.split('.')
    
    # Navigate/create nested structure
    current = config
    for k in keys[:-1]:
        if k not in current:
            current[k] = {}
        current = current[k]
    
    # Set the value (try to parse as appropriate type)
    final_key = keys[-1]
    try:
        # Try to parse as number
        if value.isdigit():
            parsed_value = int(value)
        elif value.replace('.', '', 1).isdigit():
            parsed_value = float(value)
        elif value.lower() in ('true', 'false'):
            parsed_value = value.lower() == 'true'
        else:
            parsed_value = value
    except:
        parsed_value = value
    
    current[final_key] = parsed_value
    
    save_config(config)
    console.print(f"[green]✓[/green] Set {key} = {parsed_value}")
    return True


def get_sink_config(sink_name: str) -> Optional[Dict[str, Any]]:
    """Get configuration for a specific sink."""
    config = load_config()
    sinks = config.get("sinks", {})
    return sinks.get(sink_name)


def get_task_config(task_name: str) -> Optional[Dict[str, Any]]:
    """Return the task configuration for the given task identifier."""
    config = load_config()
    tasks = config.get("tasks", {})
    task_config = tasks.get(task_name)
    if isinstance(task_config, dict):
        return task_config
    if isinstance(task_config, str):
        # Allow simple string prompts for quick tasks
        return {"prompt_template": task_config, "output_field": "task_output"}
    return None


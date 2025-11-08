"""Configuration management for data-cli"""

import os
import yaml
from pathlib import Path
from typing import Any, Dict, Optional
from rich.console import Console
from rich.syntax import Syntax

console = Console()

CONFIG_FILENAME = "data-cli.yaml"


def get_config_path() -> Path:
    """Get the path to the config file in the current directory."""
    return Path.cwd() / CONFIG_FILENAME


def get_default_config() -> Dict[str, Any]:
    """Return the default configuration."""
    return {
        "ai": {
            "model": "gemini-1.5-pro",
            "default_prompt": "You are an expert data engineer. Transform user requests into clean, efficient pandas operations."
        },
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
                "role": "ANALYST",
                "warehouse": "COMPUTE_WH",
                "database": "HACKATHON_DB"
            },
            "excel": {
                "output_dir": "./client_exports/"
            }
        }
    }


def init_config() -> bool:
    """Initialize a new data-cli.yaml file."""
    config_path = get_config_path()
    
    if config_path.exists():
        console.print(f"[yellow]⚠[/yellow] {CONFIG_FILENAME} already exists. Use 'data-cli config view' to see it.")
        return False
    
    config = get_default_config()
    with open(config_path, 'w') as f:
        yaml.dump(config, f, default_flow_style=False, sort_keys=False)
    
    console.print(f"[green]✓[/green] Created {CONFIG_FILENAME}")
    return True


def load_config() -> Dict[str, Any]:
    """Load the configuration from data-cli.yaml."""
    config_path = get_config_path()
    
    if not config_path.exists():
        console.print(f"[red]✗[/red] {CONFIG_FILENAME} not found. Run 'data-cli config init' first.")
        return {}
    
    with open(config_path, 'r') as f:
        return yaml.safe_load(f) or {}


def save_config(config: Dict[str, Any]) -> None:
    """Save the configuration to data-cli.yaml."""
    config_path = get_config_path()
    with open(config_path, 'w') as f:
        yaml.dump(config, f, default_flow_style=False, sort_keys=False)


def view_config() -> None:
    """Display the current configuration."""
    config_path = get_config_path()
    
    if not config_path.exists():
        console.print(f"[red]✗[/red] {CONFIG_FILENAME} not found. Run 'data-cli config init' first.")
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


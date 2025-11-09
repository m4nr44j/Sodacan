# Sodacan AI Agent Instructions

## Project Overview
Sodacan is an AI-powered data workbench that transforms enterprise data into BI-ready insights using natural language processing. It provides a terminal-first interface with three main workflows:

1. Quick Ingest (`ingest`/`i`): PDF/CSV → BI-ready data
2. Interactive Build (`build`/`b`): Natural language data cleaning
3. Live Watch (`watch`/`w`): Streaming AI enrichment

## Core Architecture

### Key Components
- `main.py`: CLI entry point using Typer framework
- `config.py`: YAML-based configuration with dot-notation updates
- `ai.py`: Google Gemini integration for PDF extraction and pandas code generation
- `build.py`: Interactive REPL for data cleaning
- `watch.py`: Live data monitoring and enrichment
- `sinks.py`: Data output adapters (SQLite, Excel, Snowflake, etc.)

### Data Flow
1. Input: PDF/CSV/Excel → 
2. Processing: AI translation → pandas operations →
3. Output: Configurable sinks (PowerBI, Snowflake, etc.)

## Development Patterns

### Configuration Management
- Configuration lives in `sodacan.yaml` in project root
- Use dot notation for updates: `sinks.powerbi.table_name`
- Environment variables for secrets (e.g., `GEMINI_API_KEY`)

### AI Integration
- Uses Google Gemini API for:
  - PDF structure extraction (`ai.extract_pdf_to_dataframe`)
  - Natural language → pandas translation (`ai.translate_natural_language_to_pandas`) 
  - Custom task processing (`ai.run_task_prompt`)
- AI task templates defined in config:
```yaml
tasks:
  categorize_transaction:
    prompt_template: "You are a finance expert..."
    output_field: "category"
```

### Error Handling
- Rich console output with color-coded status indicators
- Graceful fallbacks for missing optional dependencies
- Configuration validation before operations

## Common Operations

### Testing & Debugging
1. Interactive REPL: `sodacan build --interactive data.csv`
2. One-shot test: `sodacan ingest report.pdf powerbi`
3. Validate config: `sodacan config view`

### Adding Features
1. New sink: Add type definition to `config.py:get_default_config`
2. New task: Define template in config `tasks` section
3. New command: Add to `main.py` using Typer decorators

## Integration Points
- PowerBI: SQLite-based integration (`sinks.powerbi`)
- Snowflake: SQL generation for data loading
- Google Sheets: Service account auth required
- GCS: Parquet export support

## Project Conventions
- CLI aliases: Main commands have short aliases (`i`, `b`, `w`, `cfg`)
- Shell mode: Special command hints in interactive shell
- Rich formatting: Use `rich` library for terminal output
- Type hints: Python type annotations throughout codebase

Remember to check for the existence of `sodacan.yaml` and required API keys before operations. Use the configuration commands to initialize and verify the setup.
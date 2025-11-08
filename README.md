# sodacan: The AI Data Workbench

> Turn messy enterprise data into BI-ready insights in minutes, not weeks.

An AI-powered, terminal-first workbench that makes data ingestion and transformation 10x faster for consultants and forward-deployed engineers.

## 🚀 Quick Start

### Installation

```bash
pip install -r requirements.txt
export GEMINI_API_KEY=your_api_key_here
```

Get your API key from: https://makersuite.google.com/app/apikey

### Initialize Configuration

```bash
sodacan config init
```

This creates a `sodacan.yaml` file in your current directory with default settings.

### Basic Usage

**Quick ingest (10-second magic):**
```bash
sodacan ingest report.pdf powerbi
```

**Interactive cleaning (10-minute surgical clean):**
```bash
sodacan build --interactive messy_dump.csv
```

## 📋 Commands

### Configuration Management

- `sodacan config init` - Create a new config file
- `sodacan config view` - View current configuration
- `sodacan config set <key> <value>` - Set a config value (e.g., `sodacan config set sinks.snowflake.role SYSADMIN`)
- `sodacan config set tasks.categorize_transaction.prompt_template "Prompt text"` - Update AI task templates used by `watch`

### Data Operations

- `sodacan ingest <source> <sink>` - Quick ingest from source to sink
- `sodacan build --interactive <source>` - Interactive REPL for data cleaning
- `sodacan watch --source <path> --sink <name> --task <id>` - Monitor a live source and stream AI-enriched results to a sink

## 🎯 Demo Flow

### Demo 1: The "No-Code" Magic
```bash
# Show old Power BI dashboard
sodacan ingest report.pdf powerbi
# Refresh Power BI → Charts update!
```

### Demo 2: The "Pro-Code" Workbench
```bash
sodacan build --interactive messy.csv
# (Sodacan) > drop null rows and convert 'sale_amount' to a number
# (Sodacan) > save to snowflake
# → Generates load_to_snowflake.sql
```

### Demo 3: The "Enterprise" Feature
```bash
sodacan config view
sodacan config set sinks.powerbi.table_name 'new_demo_table'
```

## 🏗️ Architecture

- **Config Management**: YAML-based configuration with dot-notation updates
- **AI Integration**: Google Gemini for PDF extraction and natural language → pandas translation
- **Sink Integrations**: SQLite (Power BI), Excel, Snowflake SQL generation
- **Interactive REPL**: Real-time data preview and natural language commands

## 📦 Tech Stack

- Python 3.8+
- Typer (CLI framework)
- pandas (data manipulation)
- Google Gemini API (AI)
- PyYAML (config)
- Rich (beautiful terminal output)

## 🔒 Security

- No data leaves your environment except for AI API calls
- Config files are local to your project
- API keys via environment variables

## 📝 License

MIT


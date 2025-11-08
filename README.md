# data-cli: The AI Data Workbench

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
data-cli config init
```

This creates a `data-cli.yaml` file in your current directory with default settings.

### Basic Usage

**Quick ingest (10-second magic):**
```bash
data-cli ingest report.pdf powerbi
```

**Interactive cleaning (10-minute surgical clean):**
```bash
data-cli build --interactive messy_dump.csv
```

## 📋 Commands

### Configuration Management

- `data-cli config init` - Create a new config file
- `data-cli config view` - View current configuration
- `data-cli config set <key> <value>` - Set a config value (e.g., `data-cli config set sinks.snowflake.role SYSADMIN`)

### Data Operations

- `data-cli ingest <source> <sink>` - Quick ingest from source to sink
- `data-cli build --interactive <source>` - Interactive REPL for data cleaning

## 🎯 Demo Flow

### Demo 1: The "No-Code" Magic
```bash
# Show old Power BI dashboard
data-cli ingest report.pdf powerbi
# Refresh Power BI → Charts update!
```

### Demo 2: The "Pro-Code" Workbench
```bash
data-cli build --interactive messy.csv
# (Data-CLI) > drop null rows and convert 'sale_amount' to a number
# (Data-CLI) > save to snowflake
# → Generates load_to_snowflake.sql
```

### Demo 3: The "Enterprise" Feature
```bash
data-cli config view
data-cli config set sinks.powerbi.table_name 'new_demo_table'
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


# sodacan: The AI Data Workbench

> Turn messy enterprise data into BI-ready insights in minutes, not weeks.

An AI-powered, terminal-first workbench that makes data ingestion and transformation 10x faster for consultants and forward-deployed engineers.

## Quick Start

### Installation

```bash
pip install -r requirements.txt
pip install -e .  # Install in development mode
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
sodacan ingest --source report.pdf --sink powerbi
```

**Interactive cleaning (10-minute surgical clean):**
```bash
sodacan build messy_dump.csv
```

**Interactive shell:**
```bash
sodacan shell
```

## Commands

### Configuration Management

- `sodacan config init` - Create a new config file
- `sodacan config view` - View current configuration
- `sodacan config set <key> <value>` - Set a config value using dot notation
  - Example: `sodacan config set sinks.snowflake.role SYSADMIN`
  - Example: `sodacan config set preview.max_rows 50`
- `sodacan cfg` - Alias for `config`

### Data Operations

- `sodacan ingest --source <path> --sink <name> [--table <table>]` - Quick ingest from source to sink
  - Supports: PDF, CSV, Excel, JSON, S3 paths
  - Example: `sodacan ingest --source s3://bucket/report.pdf --sink snowflake_prod --table raw_pdf_ingest`
- `sodacan build <source>` - Interactive REPL for data cleaning with undo/redo
  - Supports: PDF, CSV, Excel, JSON
  - Natural language commands with two-stage AI pipeline
  - Built-in undo/redo system
- `sodacan watch --source <path> --sink <name> --task <id> [--poll-interval <seconds>] [--once]` - Monitor a live CSV source and stream AI-enriched results to a sink
- `sodacan shell` - Open interactive multi-command environment
- `sodacan i`, `sodacan b`, `sodacan w` - Short aliases for commands

## Demo Flow

### Demo 1: The "No-Code" Magic
```bash
# Show old Power BI dashboard
sodacan ingest --source report.pdf --sink powerbi
# Refresh Power BI → Charts update!
```

### Demo 2: The "Pro-Code" Workbench
```bash
sodacan build messy.csv
# (sodacan) > drop null rows and convert 'sale_amount' to a number
# (sodacan) > undo  # Revert if needed
# (sodacan) > save to snowflake_prod "QBR_FINAL"
# → Automatically inserts data into Snowflake!
```

### Demo 3: Live Data Enrichment
```bash
# Watch a CSV file and enrich each new row with AI
sodacan watch --source transactions.csv --sink powerbi --task categorize_transaction
# New rows automatically categorized and saved!
```

### Demo 4: Interactive Shell
```bash
sodacan shell
(sodacan) > ingest --source data.csv --sink snowflake_prod
(sodacan) > build messy_data.csv
(sodacan) > config view
(sodacan) > exit
```

## Architecture

### Two-Stage AI Pipeline

Sodacan uses a sophisticated two-stage AI pipeline for natural language processing:

1. **Analyzer (model.py)**: Converts natural language → JSON instructions
   - Intent classification (transform, analyze, export, error)
   - Context-aware with conversation memory
   - Model: `gemini-2.5-flash`

2. **Executor (executor.py)**: Converts JSON instructions → pandas code
   - Specialized code generation
   - Maintains separate conversation history
   - Model: `gemini-2.5-flash`

**Benefits:**
- Better accuracy through specialization
- Easier debugging (inspect JSON between stages)
- Flexible model swapping
- Automatic fallback to single-stage if needed

### Core Components

- **Config Management**: YAML-based configuration with dot-notation updates
- **AI Integration**: Google Gemini for PDF extraction and natural language → pandas translation
- **Source Connectors**: Local files, AWS S3, Snowflake, MySQL
- **Sink Connectors**: SQLite (Power BI), Excel, Snowflake (direct insert), PostgreSQL, MySQL, Google Sheets, Google Cloud Storage (Parquet)
- **Interactive REPL**: Real-time data preview, undo/redo, natural language commands
- **State Management**: DataFrame history tracking with branch management

## 🔄 Key Features

### Undo/Redo System
- Full transformation history
- Navigate between states with `undo`/`redo`
- View history with `history` command
- Branch management (new transformations after undo create branches)

### Direct Database Connections
- **Snowflake**: Automatic connection and data insertion
- **PostgreSQL**: Direct insert via SQLAlchemy
- **MySQL**: Direct insert via SQLAlchemy
- **Fallback**: SQL file generation if credentials not provided

### AI Task System
- User-defined AI prompts in `sodacan.yaml`
- Real-time enrichment for streaming data
- Template variables: `{row}`, `{field_name}`
- Configurable output fields

### Preview Configuration
- Configurable row/column limits
- Set via: `sodacan config set preview.max_rows 50`
- Applies to all preview displays

## Tech Stack

### Core
- **Python 3.8+**
- **Typer** - Modern CLI framework
- **pandas** - Data manipulation
- **Rich** - Beautiful terminal output

### AI & ML
- **Google Gemini API** - AI processing (gemini-2.5-flash)
- **google-generativeai** - Gemini SDK

### Data Processing
- **pdfplumber** - PDF text extraction
- **tabula-py** - Table extraction from PDFs
- **openpyxl** - Excel file handling
- **pyarrow** - Parquet file format

### Databases & Data Warehouses
- **SQLite** - Local database (Power BI integration)
- **Snowflake** - snowflake-connector-python
- **PostgreSQL** - psycopg2-binary, SQLAlchemy
- **MySQL** - pymysql, SQLAlchemy
- **SQLAlchemy** - Database abstraction layer

### Cloud Services
- **Google Cloud Storage** - Parquet file uploads
- **Google Sheets API** - Direct data writing (gspread)
- **AWS S3** - Data source (boto3)

### Configuration & Utilities
- **PyYAML** - YAML configuration management
- **Jinja2** - SQL script templating
- **python-dotenv** - Environment variable management

## Configuration

### Example `sodacan.yaml`

```yaml
source_defaults:
  csv_encoding: utf-8

preview:
  max_rows: 20
  max_cols: 10

sources:
  snowflake_prod:
    type: snowflake
    account: ${SNOWFLAKE_ACCOUNT}
    user: ${SNOWFLAKE_USER}
    password: ${SNOWFLAKE_PASSWORD}
    role: ACCOUNTADMIN
    warehouse: SODA_WH
    database: HACKATHON_DB
    schema: PUBLIC
    query: "SELECT * FROM INTERNAL_TRANSACTIONS"

sinks:
  powerbi:
    type: sqlite
    database_file: ./prod_dashboard.db
    table_name: sales_data_2025
  
  snowflake_prod:
    type: snowflake
    auto_connect: true
    account: ${SNOWFLAKE_ACCOUNT}
    user: ${SNOWFLAKE_USER}
    password: ${SNOWFLAKE_PASSWORD}
    role: ACCOUNTADMIN
    warehouse: SODA_WH
    database: HACKATHON_DB
    schema: PUBLIC
    table_name: LOADED_DATA
  
  postgres:
    type: postgres
    host: localhost
    port: 5432
    database: mydb
    user: postgres
    password: your_password
    schema: public
    table_name: loaded_data
  
  googlesheets:
    type: googlesheets
    spreadsheet_id: your_spreadsheet_id_here
    worksheet_name: Sheet1
    credentials_path: ./path/to/service-account.json
  
  gcs:
    type: gcs_parquet
    bucket_name: your-bucket-name
    blob_path: data/export.parquet
    project_id: your-gcp-project-id
    credentials_path: ./path/to/service-account.json

tasks:
  categorize_transaction:
    prompt_template: 'You are a finance expert. Categorize this transaction: {row_dict}'
    output_field: category
```

### Environment Variables

- `GEMINI_API_KEY` - Required for AI features
- `GEMINI_API_KEY_EXECUTOR` - Optional, separate key for executor (falls back to `GEMINI_API_KEY`)
- `SNOWFLAKE_ACCOUNT`, `SNOWFLAKE_USER`, `SNOWFLAKE_PASSWORD` - For Snowflake connections
- `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` - For S3 sources

## 🎮 Interactive Build Commands

Within the `build` REPL:

- **Natural language**: `"rename 'col1' to 'id' and drop null rows"`
- **undo**: Revert to previous DataFrame state
- **redo**: Restore transformation after undo
- **history**: Show all transformation states
- **preview**: Show current data preview
- **save to <sink>**: Save to configured sink (supports multiple: `save to sink1 and sink2`)
- **exit/quit**: Exit without saving

## Security

- No data leaves your environment except for AI API calls
- Config files are local to your project
- API keys via environment variables
- Credentials support environment variable expansion (`${VAR_NAME}`)
- Add `sodacan.yaml` to `.gitignore` to avoid committing credentials

## 📚 Documentation

- **TWO_STAGE_PIPELINE.md** - Detailed explanation of the AI pipeline
- **DATABASE_CONNECTORS.md** - Database connection guide
- **INSTALL.md** - Installation instructions

## Advanced Features

### Multi-Sink Saving
```bash
sodacan build data.csv
(sodacan) > save to snowflake_prod "QBR_FINAL" and google_sheet_bi
```

### Custom Table Names
```bash
sodacan ingest --source data.csv --sink snowflake_prod --table custom_table_name
```

### S3 Sources
```bash
sodacan ingest --source s3://bucket-name/path/to/file.pdf --sink powerbi
```

### Database Sources
Configure sources in `sodacan.yaml`, then:
```bash
sodacan build snowflake_prod  # Uses configured source
```

### Preview Customization
```bash
sodacan config set preview.max_rows 50
sodacan config set preview.max_cols 15
```

## License

MIT

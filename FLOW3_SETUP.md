# Flow 3 Setup Guide

## Quick Start

1. **Export credentials:**
   ```bash
   source setup_flow3.sh
   # OR manually:
   export AWS_ACCESS_KEY_ID="AKIA2SBJDPUAB7AGGR21"
   export AWS_SECRET_ACCESS_KEY="P|27jRyBhb2ZkA9c7S33rbMOGORm10jmCcfZDgVG"
   export SNOWFLAKE_ACCOUNT="dgbhzvw-uh42222"
   export SNOWFLAKE_USER="manraaj"
   export SNOWFLAKE_PASSWORD="Derp123456((**"
   ```

2. **Install dependencies:**
   ```bash
   pip install -r requirements.txt
   ```

3. **Run Flow 3:**
   ```bash
   # Step 1: Connect to Snowflake
   soda build "snowflake_prod"
   
   # Step 2: Merge Q2 PDF
   (sodacan) > merge_10Q "s3://sodacan-pdf-reports/GOOG-10-Q-Q2-2025.pdf" --company "Google" --quarter "Q2-2025"
   
   # Step 3: Merge Q3 PDF
   (sodacan) > merge_10Q "s3://sodacan-pdf-reports/GOOG-10-Q-Q3-2025.pdf" --company "Google" --quarter "Q3-2025"
   
   # Step 4: Save to both Snowflake and Google Sheets
   (sodacan) > save to snowflake_prod "QBR_FINAL_DATA" and google_sheet_bi
   ```

## What Flow 3 Does

1. **Connects to Snowflake** - Loads aggregated internal transaction data
2. **Downloads PDFs from S3** - Retrieves 10-Q reports automatically
3. **Hybrid PDF Extraction**:
   - Programmatic: Uses `tabula-py` to extract tables
   - AI Enrichment: Uses Gemini to extract financial segments and MD&A commentary
4. **Merges Data** - Combines internal data with competitor data
5. **Saves to Multiple Sinks** - Writes to both Snowflake and Google Sheets simultaneously

## Configuration

Make sure your `sodacan.yaml` has:
- `sources.snowflake_prod` - Snowflake connection with query
- `sinks.snowflake_prod` - Snowflake write config
- `sinks.google_sheet_bi` - Google Sheets config with spreadsheet_id
- `tasks.merge_10Q` - AI task prompt for PDF extraction

## Demo Script

```bash
# 1. Setup
source setup_flow3.sh

# 2. Start workbench
soda build "snowflake_prod"

# 3. In REPL:
merge_10Q "s3://sodacan-pdf-reports/GOOG-10-Q-Q2-2025.pdf" --company "Google" --quarter "Q2-2025"
merge_10Q "s3://sodacan-pdf-reports/GOOG-10-Q-Q3-2025.pdf" --company "Google" --quarter "Q3-2025"
save to snowflake_prod "QBR_FINAL_DATA" and google_sheet_bi

# 4. Refresh Tableau dashboard to see results!
```


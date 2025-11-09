"""Sink integrations for sodacan with automatic database connections"""

import sqlite3
import pandas as pd
from pathlib import Path
from typing import Dict, Any, Optional
from jinja2 import Template
from rich.console import Console
import os
import re

console = Console()

def expand_env_vars(value: str) -> str:
    """Expand environment variables in the format ${VAR_NAME}."""
    pattern = re.compile(r'\$\{([^}]+)\}')
    
    def replacer(match):
        env_var = match.group(1)
        return os.environ.get(env_var, match.group(0))
    
    return pattern.sub(replacer, value)

# Try importing database connectors (optional dependencies)
try:
    import snowflake.connector
    SNOWFLAKE_AVAILABLE = True
except ImportError:
    SNOWFLAKE_AVAILABLE = False

try:
    from sqlalchemy import create_engine, text
    SQLALCHEMY_AVAILABLE = True
except ImportError:
    SQLALCHEMY_AVAILABLE = False

# Try importing Google services
try:
    import gspread
    from google.oauth2.service_account import Credentials
    GSPREAD_AVAILABLE = True
except ImportError:
    GSPREAD_AVAILABLE = False

try:
    from google.cloud import storage
    import pyarrow as pa
    import pyarrow.parquet as pq
    GCS_AVAILABLE = True
except ImportError:
    GCS_AVAILABLE = False


def save_to_sqlite(df: pd.DataFrame, database_file: str, table_name: str) -> bool:
    """Save DataFrame to SQLite database."""
    try:
        # Ensure directory exists
        db_path = Path(database_file)
        db_path.parent.mkdir(parents=True, exist_ok=True)
        
        conn = sqlite3.connect(database_file)
        df.to_sql(table_name, conn, if_exists='replace', index=False)
        conn.close()
        
        console.print(f"[green]✓[/green] Saved {len(df)} rows to {database_file}::{table_name}")
        return True
    except Exception as e:
        console.print(f"[red]✗[/red] Error saving to SQLite: {e}")
        return False


def save_to_excel(df: pd.DataFrame, output_dir: str, filename: Optional[str] = None) -> bool:
    """Save DataFrame to Excel file."""
    try:
        output_path = Path(output_dir)
        output_path.mkdir(parents=True, exist_ok=True)
        
        if not filename:
            filename = "export.xlsx"
        
        filepath = output_path / filename
        df.to_excel(filepath, index=False, engine='openpyxl')
        
        console.print(f"[green]✓[/green] Saved {len(df)} rows to {filepath}")
        return True
    except Exception as e:
        console.print(f"[red]✗[/red] Error saving to Excel: {e}")
        return False


def sanitize_value(value) -> str:
    """Sanitize a value for SQL insertion."""
    if pd.isna(value) or value is None:
        return 'NULL'
    elif isinstance(value, str):
        # Escape single quotes and wrap in quotes
        escaped = value.replace("'", "''")
        return f"'{escaped}'"
    elif isinstance(value, (int, float)):
        return str(value)
    elif isinstance(value, bool):
        return 'TRUE' if value else 'FALSE'
    else:
        # Convert to string and escape
        escaped = str(value).replace("'", "''")
        return f"'{escaped}'"


def generate_insert_statements(df: pd.DataFrame, table_name: str, schema: Optional[str] = None) -> str:
    """Generate INSERT statements with actual data."""
    # Clean column names for SQL
    clean_cols = [col.replace(' ', '_').replace('-', '_').replace('.', '_') for col in df.columns]
    
    # Build INSERT statements
    full_table = f"{schema}.{table_name}" if schema else table_name
    insert_lines = []
    
    # For large datasets, use batch inserts
    batch_size = 1000
    for i in range(0, len(df), batch_size):
        batch = df.iloc[i:i+batch_size]
        values_list = []
        
        for _, row in batch.iterrows():
            values = [sanitize_value(val) for val in row.values]
            values_list.append(f"({', '.join(values)})")
        
        columns_str = ', '.join(clean_cols)
        values_str = ',\n    '.join(values_list)
        insert_lines.append(f"INSERT INTO {full_table} ({columns_str}) VALUES\n    {values_str};")
    
    return '\n\n'.join(insert_lines)


def save_to_snowflake_direct(df: pd.DataFrame, sink_config: Dict[str, Any], table_name: str) -> bool:
    """Save DataFrame directly to Snowflake with automatic data insertion."""
    if not SNOWFLAKE_AVAILABLE:
        console.print("[red]✗[/red] snowflake-connector-python not installed. Run: pip install snowflake-connector-python")
        return False
    
    # Get connection parameters
    account = expand_env_vars(str(sink_config.get('account', '')))
    user = expand_env_vars(str(sink_config.get('user', '')))
    password = expand_env_vars(str(sink_config.get('password', '')))
    warehouse = sink_config.get('warehouse', 'COMPUTE_WH')
    database = sink_config.get('database', 'HACKATHON_DB')
    schema = sink_config.get('schema', 'PUBLIC')
    role = sink_config.get('role', 'ANALYST')
    
    if not all([account, user, password]):
        console.print("[red]✗[/red] Snowflake credentials missing. Set account, user, and password in config.")
        return False
    
    try:
        # Connect to Snowflake
        console.print("[dim]Connecting to Snowflake...[/dim]")
        conn = snowflake.connector.connect(
            account=account,
            user=user,
            password=password,
            warehouse=warehouse,
            database=database,
            schema=schema,
            role=role
        )
        
        cursor = conn.cursor()
        
        # Set context
        cursor.execute(f"USE ROLE {role}")
        cursor.execute(f"USE WAREHOUSE {warehouse}")
        cursor.execute(f"USE DATABASE {database}")
        cursor.execute(f"USE SCHEMA {schema}")
        
        # Create table if not exists
        console.print(f"[dim]Creating table {schema}.{table_name}...[/dim]")
        column_defs = []
        clean_cols = []
        for col, dtype in df.dtypes.items():
            clean_col = col.replace(' ', '_').replace('-', '_').replace('.', '_')
            clean_cols.append(clean_col)
            
            if dtype == 'int64':
                sql_type = 'INTEGER'
            elif dtype == 'float64':
                sql_type = 'FLOAT'
            elif dtype == 'bool':
                sql_type = 'BOOLEAN'
            elif dtype == 'datetime64[ns]':
                sql_type = 'TIMESTAMP_NTZ'
            else:
                sql_type = 'VARCHAR(16777216)'
            
            column_defs.append(f"{clean_col} {sql_type}")
        
        create_table_sql = f"""
        CREATE TABLE IF NOT EXISTS {table_name} (
            {', '.join(column_defs)}
        )
        """
        cursor.execute(create_table_sql)
        
        # Truncate table (replace mode)
        cursor.execute(f"TRUNCATE TABLE IF EXISTS {table_name}")
        
        # Insert data in batches
        console.print(f"[dim]Inserting {len(df)} rows...[/dim]")
        batch_size = 1000
        total_inserted = 0
        
        for i in range(0, len(df), batch_size):
            batch = df.iloc[i:i+batch_size]
            
            # Prepare data for insertion
            values_list = []
            for _, row in batch.iterrows():
                values = [sanitize_value(val) for val in row.values]
                values_list.append(f"({', '.join(values)})")
            
            columns_str = ', '.join(clean_cols)
            values_str = ', '.join(values_list)
            insert_sql = f"INSERT INTO {table_name} ({columns_str}) VALUES {values_str}"
            
            cursor.execute(insert_sql)
            total_inserted += len(batch)
        
        conn.commit()
        cursor.close()
        conn.close()
        
        console.print(f"[green]✓[/green] Successfully inserted {total_inserted} rows into Snowflake {database}.{schema}.{table_name}")
        return True
        
    except Exception as e:
        console.print(f"[red]✗[/red] Error connecting to Snowflake: {e}")
        return False


def save_to_postgres(df: pd.DataFrame, sink_config: Dict[str, Any], table_name: str) -> bool:
    """Save DataFrame to PostgreSQL database."""
    if not SQLALCHEMY_AVAILABLE:
        console.print("[red]✗[/red] sqlalchemy not installed. Run: pip install sqlalchemy psycopg2-binary")
        return False
    
    # Get connection parameters
    host = sink_config.get('host', 'localhost')
    port = sink_config.get('port', 5432)
    database = sink_config.get('database')
    user = sink_config.get('user')
    password = sink_config.get('password')
    schema = sink_config.get('schema', 'public')
    
    if not all([host, database, user, password]):
        console.print("[red]✗[/red] PostgreSQL credentials missing. Set host, database, user, and password in config.")
        return False
    
    try:
        # Create connection string
        connection_string = f"postgresql://{user}:{password}@{host}:{port}/{database}"
        engine = create_engine(connection_string)
        
        console.print(f"[dim]Connecting to PostgreSQL {host}:{port}/{database}...[/dim]")
        
        # Set schema if specified
        if schema != 'public':
            with engine.connect() as conn:
                conn.execute(text(f"SET search_path TO {schema}"))
                conn.commit()
        
        # Save DataFrame
        df.to_sql(
            table_name,
            engine,
            schema=schema,
            if_exists='replace',
            index=False,
            method='multi'
        )
        
        console.print(f"[green]✓[/green] Saved {len(df)} rows to PostgreSQL {database}.{schema}.{table_name}")
        return True
        
    except Exception as e:
        console.print(f"[red]✗[/red] Error connecting to PostgreSQL: {e}")
        return False


def save_to_mysql(df: pd.DataFrame, sink_config: Dict[str, Any], table_name: str) -> bool:
    """Save DataFrame to MySQL database."""
    if not SQLALCHEMY_AVAILABLE:
        console.print("[red]✗[/red] sqlalchemy not installed. Run: pip install sqlalchemy pymysql")
        return False
    
    # Get connection parameters
    host = sink_config.get('host', 'localhost')
    port = sink_config.get('port', 3306)
    database = sink_config.get('database')
    user = sink_config.get('user')
    password = sink_config.get('password')
    
    if not all([host, database, user, password]):
        console.print("[red]✗[/red] MySQL credentials missing. Set host, database, user, and password in config.")
        return False
    
    try:
        # Create connection string
        connection_string = f"mysql+pymysql://{user}:{password}@{host}:{port}/{database}"
        engine = create_engine(connection_string)
        
        console.print(f"[dim]Connecting to MySQL {host}:{port}/{database}...[/dim]")
        
        # Save DataFrame
        df.to_sql(
            table_name,
            engine,
            if_exists='replace',
            index=False,
            method='multi'
        )
        
        console.print(f"[green]✓[/green] Saved {len(df)} rows to MySQL {database}.{table_name}")
        return True
        
    except Exception as e:
        console.print(f"[red]✗[/red] Error connecting to MySQL: {e}")
        return False


def generate_snowflake_sql_with_data(df: pd.DataFrame, sink_config: Dict[str, Any], table_name: Optional[str] = None) -> str:
    """Generate Snowflake SQL script with CREATE TABLE and INSERT statements."""
    
    # Infer column types from DataFrame
    column_defs = []
    clean_cols = []
    for col, dtype in df.dtypes.items():
        clean_col = col.replace(' ', '_').replace('-', '_').replace('.', '_')
        clean_cols.append(clean_col)
        
        if dtype == 'int64':
            sql_type = 'INTEGER'
        elif dtype == 'float64':
            sql_type = 'FLOAT'
        elif dtype == 'bool':
            sql_type = 'BOOLEAN'
        elif dtype == 'datetime64[ns]':
            sql_type = 'TIMESTAMP_NTZ'
        else:
            sql_type = 'VARCHAR(16777216)'
        
        column_defs.append(f"    {clean_col} {sql_type}")
    
    # Get sink config
    role = sink_config.get('role', 'ANALYST')
    warehouse = sink_config.get('warehouse', 'COMPUTE_WH')
    database = sink_config.get('database', 'HACKATHON_DB')
    schema = sink_config.get('schema', 'PUBLIC')
    table = table_name or sink_config.get('table_name', 'LOADED_DATA')
    
    # Generate INSERT statements
    insert_statements = generate_insert_statements(df, table, schema)
    
    # Generate full SQL script
    sql = f"""-- Snowflake Load Script
-- Generated by sodacan
-- Automatically includes CREATE TABLE and INSERT statements

USE ROLE {role};
USE WAREHOUSE {warehouse};
USE DATABASE {database};
USE SCHEMA {schema};

-- Create table if not exists
CREATE TABLE IF NOT EXISTS {table} (
{chr(10).join(column_defs)}
);

-- Truncate table (replace mode)
TRUNCATE TABLE IF EXISTS {table};

-- Insert data
{insert_statements}
"""
    
    return sql


def save_to_googlesheets(df: pd.DataFrame, sink_config: Dict[str, Any], spreadsheet_id: str, worksheet_name: str) -> bool:
    """Save DataFrame directly to Google Sheets."""
    if not GSPREAD_AVAILABLE:
        console.print("[red]✗[/red] gspread not installed. Run: pip install gspread google-auth-oauthlib")
        return False
    
    # Get credentials
    credentials_path = sink_config.get('credentials_path')
    credentials_json = sink_config.get('credentials_json')  # For inline JSON
    
    if not credentials_path and not credentials_json:
        console.print("[red]✗[/red] Google Sheets credentials missing. Set credentials_path or credentials_json in config.")
        return False
    
    try:
        # Authenticate
        if credentials_path:
            # Use service account file
            creds = Credentials.from_service_account_file(
                credentials_path,
                scopes=['https://www.googleapis.com/auth/spreadsheets', 'https://www.googleapis.com/auth/drive']
            )
        else:
            # Use inline JSON
            import json
            creds = Credentials.from_service_account_info(
                json.loads(credentials_json),
                scopes=['https://www.googleapis.com/auth/spreadsheets', 'https://www.googleapis.com/auth/drive']
            )
        
        client = gspread.authorize(creds)
        
        console.print(f"[dim]Opening spreadsheet {spreadsheet_id}...[/dim]")
        spreadsheet = client.open_by_key(spreadsheet_id)
        
        # Get or create worksheet
        try:
            worksheet = spreadsheet.worksheet(worksheet_name)
            console.print(f"[dim]Using existing worksheet: {worksheet_name}[/dim]")
        except gspread.exceptions.WorksheetNotFound:
            console.print(f"[dim]Creating new worksheet: {worksheet_name}[/dim]")
            worksheet = spreadsheet.add_worksheet(title=worksheet_name, rows=len(df)+1, cols=len(df.columns))
        
        # Clear existing data
        worksheet.clear()
        
        # Write headers
        headers = df.columns.tolist()
        worksheet.append_row(headers)
        
        # Write data in batches
        console.print(f"[dim]Writing {len(df)} rows to Google Sheets...[/dim]")
        batch_size = 100
        for i in range(0, len(df), batch_size):
            batch = df.iloc[i:i+batch_size]
            values = batch.values.tolist()
            worksheet.append_rows(values)
        
        console.print(f"[green]✓[/green] Successfully wrote {len(df)} rows to Google Sheets: {spreadsheet.title} > {worksheet_name}")
        console.print(f"[dim]Spreadsheet URL: https://docs.google.com/spreadsheets/d/{spreadsheet_id}[/dim]")
        return True
        
    except Exception as e:
        console.print(f"[red]✗[/red] Error writing to Google Sheets: {e}")
        return False


def save_to_gcs_parquet(df: pd.DataFrame, sink_config: Dict[str, Any], bucket_name: str, blob_path: str) -> bool:
    """Save DataFrame to Google Cloud Storage as Parquet file."""
    if not GCS_AVAILABLE:
        console.print("[red]✗[/red] google-cloud-storage or pyarrow not installed.")
        console.print("[dim]Run: pip install google-cloud-storage pyarrow[/dim]")
        return False
    
    # Get credentials
    credentials_path = sink_config.get('credentials_path')
    project_id = sink_config.get('project_id')
    
    try:
        # Initialize GCS client
        if credentials_path:
            from google.oauth2 import service_account
            credentials = service_account.Credentials.from_service_account_file(credentials_path)
            storage_client = storage.Client(credentials=credentials, project=project_id)
        else:
            # Use default credentials (from environment or gcloud)
            storage_client = storage.Client(project=project_id)
        
        console.print(f"[dim]Connecting to GCS bucket: {bucket_name}...[/dim]")
        bucket = storage_client.bucket(bucket_name)
        
        # Convert DataFrame to Parquet in memory
        console.print(f"[dim]Converting {len(df)} rows to Parquet format...[/dim]")
        from io import BytesIO
        parquet_buffer = BytesIO()
        df.to_parquet(parquet_buffer, engine='pyarrow', index=False)
        parquet_buffer.seek(0)
        file_size = len(parquet_buffer.getvalue())
        
        # Upload to GCS
        console.print(f"[dim]Uploading to gs://{bucket_name}/{blob_path}...[/dim]")
        blob = bucket.blob(blob_path)
        blob.upload_from_file(parquet_buffer, content_type='application/octet-stream')
        
        console.print(f"[green]✓[/green] Successfully uploaded {len(df)} rows to GCS: gs://{bucket_name}/{blob_path}")
        console.print(f"[dim]File size: {file_size / 1024:.2f} KB[/dim]")
        return True
        
    except Exception as e:
        console.print(f"[red]✗[/red] Error uploading to GCS: {e}")
        return False


def save_to_sink(df: pd.DataFrame, sink_name: str, sink_config: Dict[str, Any], **kwargs) -> bool:
    """Save DataFrame to the specified sink."""
    sink_type = sink_config.get('type', sink_name.lower())
    auto_connect = sink_config.get('auto_connect', True)  # Default to auto-connect
    
    if sink_type == 'sqlite' or sink_name == 'powerbi':
        database_file = sink_config.get('database_file', './prod_dashboard.db')
        table_name = kwargs.get('table_name') or sink_config.get('table_name', 'data')
        return save_to_sqlite(df, database_file, table_name)
    
    elif sink_type == 'excel':
        output_dir = sink_config.get('output_dir', './client_exports/')
        filename = kwargs.get('filename')
        return save_to_excel(df, output_dir, filename)
    
    elif sink_type == 'snowflake' or sink_name == 'snowflake':
        table_name = kwargs.get('table_name') or sink_config.get('table_name', 'LOADED_DATA')
        
        # Check if we should auto-connect or generate SQL file
        if auto_connect and sink_config.get('account') and sink_config.get('user') and sink_config.get('password'):
            # Direct connection with automatic insertion
            return save_to_snowflake_direct(df, sink_config, table_name)
        else:
            # Generate SQL file with data
            console.print("[yellow]⚠[/yellow] No Snowflake credentials found. Generating SQL file instead.")
            console.print("[dim]To enable auto-connect, set account, user, and password in config.[/dim]")
            
            sql = generate_snowflake_sql_with_data(df, sink_config, table_name)
            output_file = f"load_to_{sink_name}.sql"
            with open(output_file, 'w') as f:
                f.write(sql)
            
            console.print(f"[green]✓[/green] Generated Snowflake SQL script with data: {output_file}")
            console.print(f"[dim]Preview (first 500 chars):[/dim]")
            console.print(sql[:500] + "..." if len(sql) > 500 else sql)
            return True
    
    elif sink_type == 'postgres' or sink_type == 'postgresql':
        table_name = kwargs.get('table_name') or sink_config.get('table_name', 'loaded_data')
        return save_to_postgres(df, sink_config, table_name)
    
    elif sink_type == 'mysql':
        table_name = kwargs.get('table_name') or sink_config.get('table_name', 'loaded_data')
        return save_to_mysql(df, sink_config, table_name)
    
    elif sink_type == 'googlesheets' or sink_name == 'googlesheets':
        spreadsheet_id = sink_config.get('spreadsheet_id')
        worksheet_name = sink_config.get('worksheet_name', 'Sheet1')
        return save_to_googlesheets(df, sink_config, spreadsheet_id, worksheet_name)
    
    elif sink_type == 'gcs' or sink_type == 'gcs_parquet' or sink_name == 'gcs':
        bucket_name = sink_config.get('bucket_name')
        blob_path = sink_config.get('blob_path') or sink_config.get('file_path', 'data.parquet')
        return save_to_gcs_parquet(df, sink_config, bucket_name, blob_path)
    
    else:
        console.print(f"[red]✗[/red] Unknown sink type: {sink_type}")
        return False

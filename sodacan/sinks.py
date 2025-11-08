"""Sink integrations for sodacan with automatic database connections"""

import sqlite3
import pandas as pd
from pathlib import Path
from typing import Dict, Any, Optional
from jinja2 import Template
from rich.console import Console
import os

console = Console()

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
    account = sink_config.get('account')
    user = sink_config.get('user')
    password = sink_config.get('password')
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


def save_to_sink(df: pd.DataFrame, sink_name: str, sink_config: Dict[str, Any], **kwargs) -> bool:
    """Save DataFrame to the specified sink."""
    sink_type = sink_config.get('type', sink_name.lower())
    auto_connect = sink_config.get('auto_connect', True)  # Default to auto-connect
    
    if sink_type == 'sqlite' or sink_name == 'powerbi':
        database_file = sink_config.get('database_file', './prod_dashboard.db')
        table_name = sink_config.get('table_name', 'data')
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
    
    else:
        console.print(f"[red]✗[/red] Unknown sink type: {sink_type}")
        return False

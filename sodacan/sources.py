"""Source connectors for sodacan - read data from various sources"""

import pandas as pd
import os
from typing import Dict, Any, Optional
from pathlib import Path
from rich.console import Console

console = Console()

# Try importing connectors
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

try:
    import boto3
    from botocore.exceptions import ClientError
    BOTO3_AVAILABLE = True
except ImportError:
    BOTO3_AVAILABLE = False


def expand_env_vars(value: str) -> str:
    """Expand environment variables in string (e.g., ${VAR} -> actual value)."""
    if isinstance(value, str) and value.startswith("${") and value.endswith("}"):
        var_name = value[2:-1]
        return os.getenv(var_name, value)
    return value


def load_from_snowflake(source_config: Dict[str, Any]) -> Optional[pd.DataFrame]:
    """Load data from Snowflake source."""
    if not SNOWFLAKE_AVAILABLE:
        console.print("[red]✗[/red] snowflake-connector-python not installed. Run: pip install snowflake-connector-python")
        return None
    
    # Get connection parameters (expand env vars)
    account = expand_env_vars(str(source_config.get('account', '')))
    user = expand_env_vars(str(source_config.get('user', '')))
    password = expand_env_vars(str(source_config.get('password', '')))
    warehouse = source_config.get('warehouse', 'COMPUTE_WH')
    database = source_config.get('database', 'HACKATHON_DB')
    schema = source_config.get('schema', 'PUBLIC')
    role = source_config.get('role', 'ANALYST')
    query = source_config.get('query', 'SELECT 1')
    
    # Clean account (remove https:// and .snowflakecomputing.com if present)
    if '://' in account:
        account = account.split('://')[1]
    if '.snowflakecomputing.com' in account:
        account = account.replace('.snowflakecomputing.com', '')
    
    if not all([account, user, password]):
        console.print("[red]✗[/red] Snowflake credentials missing. Set account, user, and password in config.")
        return None
    
    try:
        console.print(f"[dim]Connecting to Snowflake: {account}...[/dim]")
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
        
        console.print(f"[dim]Executing query...[/dim]")
        cursor.execute(query)
        
        # Fetch results
        columns = [desc[0] for desc in cursor.description]
        rows = cursor.fetchall()
        
        # Convert to DataFrame
        df = pd.DataFrame(rows, columns=columns)
        
        cursor.close()
        conn.close()
        
        console.print(f"[green]✓[/green] Loaded {len(df)} rows from Snowflake")
        return df
        
    except Exception as e:
        console.print(f"[red]✗[/red] Error connecting to Snowflake: {e}")
        return None


def load_from_mysql(source_config: Dict[str, Any]) -> Optional[pd.DataFrame]:
    """Load data from MySQL source."""
    if not SQLALCHEMY_AVAILABLE:
        console.print("[red]✗[/red] sqlalchemy not installed. Run: pip install sqlalchemy pymysql")
        return None
    
    host = source_config.get('host', 'localhost')
    port = source_config.get('port', 3306)
    database = source_config.get('database')
    user = source_config.get('user')
    password = source_config.get('password')
    query = source_config.get('query', 'SELECT 1')
    
    if not all([host, database, user, password]):
        console.print("[red]✗[/red] MySQL credentials missing.")
        return None
    
    try:
        connection_string = f"mysql+pymysql://{user}:{password}@{host}:{port}/{database}"
        engine = create_engine(connection_string)
        
        console.print(f"[dim]Connecting to MySQL {host}:{port}/{database}...[/dim]")
        df = pd.read_sql(query, engine)
        
        console.print(f"[green]✓[/green] Loaded {len(df)} rows from MySQL")
        return df
        
    except Exception as e:
        console.print(f"[red]✗[/red] Error connecting to MySQL: {e}")
        return None


def download_from_s3(s3_path: str, local_path: Optional[Path] = None) -> Optional[Path]:
    """Download a file from S3 to local filesystem."""
    if not BOTO3_AVAILABLE:
        console.print("[red]✗[/red] boto3 not installed. Run: pip install boto3")
        return None
    
    # Parse S3 path: s3://bucket-name/path/to/file.pdf
    if not s3_path.startswith('s3://'):
        console.print(f"[red]✗[/red] Invalid S3 path. Must start with 's3://'")
        return None
    
    parts = s3_path[5:].split('/', 1)
    if len(parts) != 2:
        console.print(f"[red]✗[/red] Invalid S3 path format: {s3_path}")
        return None
    
    bucket_name = parts[0]
    object_key = parts[1]
    
    # Get AWS credentials from environment
    aws_access_key = os.getenv('AWS_ACCESS_KEY_ID')
    aws_secret_key = os.getenv('AWS_SECRET_ACCESS_KEY')
    aws_region = os.getenv('AWS_DEFAULT_REGION', 'us-east-1')
    
    if not aws_access_key or not aws_secret_key:
        console.print("[red]✗[/red] AWS credentials not found. Set AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY")
        return None
    
    try:
        # Create S3 client
        s3_client = boto3.client(
            's3',
            aws_access_key_id=aws_access_key,
            aws_secret_access_key=aws_secret_key,
            region_name=aws_region
        )
        
        # Determine local path
        if local_path is None:
            filename = Path(object_key).name
            local_path = Path.cwd() / '.sodacan_cache' / filename
            local_path.parent.mkdir(parents=True, exist_ok=True)
        
        console.print(f"[dim]Downloading s3://{bucket_name}/{object_key}...[/dim]")
        
        # Download file
        s3_client.download_file(bucket_name, object_key, str(local_path))
        
        console.print(f"[green]✓[/green] Downloaded to {local_path}")
        return local_path
        
    except ClientError as e:
        console.print(f"[red]✗[/red] Error downloading from S3: {e}")
        return None
    except Exception as e:
        console.print(f"[red]✗[/red] Unexpected error: {e}")
        return None


def load_from_source(source_name: str, source_config: Dict[str, Any]) -> Optional[pd.DataFrame]:
    """Load data from a configured source."""
    source_type = source_config.get('type', '').lower()
    
    if source_type == 'snowflake':
        return load_from_snowflake(source_config)
    elif source_type == 'mysql':
        return load_from_mysql(source_config)
    else:
        console.print(f"[red]✗[/red] Unknown source type: {source_type}")
        return None


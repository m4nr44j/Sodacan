# Database Connectors - Automated Data Insertion

Sodacan now supports **direct database connections** with **automatic data insertion**! No more manual SQL execution needed.

## 🚀 Supported Databases

### 1. **Snowflake** ✅
- Direct connection with automatic data insertion
- Falls back to SQL file generation if credentials not provided
- Supports batch inserts for large datasets

### 2. **PostgreSQL** ✅
- Direct connection via SQLAlchemy
- Automatic table creation
- Schema support

### 3. **MySQL** ✅
- Direct connection via SQLAlchemy
- Automatic table creation
- Full CRUD support

### 4. **SQLite** ✅ (Power BI)
- Already supported - direct file connection

## 📋 Configuration

### Snowflake Configuration

```yaml
snowflake:
  type: snowflake
  auto_connect: true  # Enable automatic connection
  account: "your_account.snowflakecomputing.com"
  user: "your_username"
  password: "your_password"
  role: "ANALYST"
  warehouse: "COMPUTE_WH"
  database: "HACKATHON_DB"
  schema: "PUBLIC"
  table_name: "LOADED_DATA"
```

**Usage:**
```bash
sodacan ingest data.csv snowflake
# Automatically connects and inserts data!
```

### PostgreSQL Configuration

```yaml
postgres:
  type: postgres
  host: "localhost"
  port: 5432
  database: "mydb"
  user: "postgres"
  password: "your_password"
  schema: "public"
  table_name: "loaded_data"
```

**Usage:**
```bash
sodacan ingest data.csv postgres
# Automatically connects and inserts data!
```

### MySQL Configuration

```yaml
mysql:
  type: mysql
  host: "localhost"
  port: 3306
  database: "mydb"
  user: "root"
  password: "your_password"
  table_name: "loaded_data"
```

**Usage:**
```bash
sodacan ingest data.csv mysql
# Automatically connects and inserts data!
```

## 🔄 How It Works

### Automatic Mode (Default)

1. **Check credentials**: If credentials are provided in config → use direct connection
2. **Connect**: Establishes database connection
3. **Create table**: Automatically creates table with correct schema
4. **Insert data**: Batch inserts all data automatically
5. **Done**: Data is live in the database!

### Fallback Mode (No Credentials)

If credentials are not provided:
- **Snowflake**: Generates SQL file with INSERT statements (includes actual data)
- **PostgreSQL/MySQL**: Shows error message

## 📊 Features

### ✅ Automatic Table Creation
- Infers column types from DataFrame
- Creates table if not exists
- Handles schema differences

### ✅ Batch Insertion
- Processes data in batches (1000 rows at a time)
- Efficient for large datasets
- Progress indicators

### ✅ Data Type Mapping
- **pandas → SQL types**:
  - `int64` → `INTEGER`
  - `float64` → `FLOAT`
  - `bool` → `BOOLEAN`
  - `datetime64[ns]` → `TIMESTAMP_NTZ`
  - `object` → `VARCHAR(16777216)`

### ✅ Replace Mode
- Uses `if_exists='replace'` by default
- Truncates table before inserting (Snowflake)
- Drops and recreates table (PostgreSQL/MySQL)

## 🔒 Security

### Credential Storage
- Credentials stored in `sodacan.yaml` (local file)
- **Recommendation**: Use environment variables for production
- Add `sodacan.yaml` to `.gitignore` to avoid committing credentials

### Environment Variables (Alternative)

You can also use environment variables:

```bash
export SNOWFLAKE_ACCOUNT="your_account"
export SNOWFLAKE_USER="your_user"
export SNOWFLAKE_PASSWORD="your_password"
```

Then reference in config:
```yaml
snowflake:
  account: "${SNOWFLAKE_ACCOUNT}"
  user: "${SNOWFLAKE_USER}"
  password: "${SNOWFLAKE_PASSWORD}"
```

## 📝 Examples

### Example 1: Snowflake Auto-Connect

```bash
# Configure Snowflake
sodacan config set sinks.snowflake.account "myaccount.snowflakecomputing.com"
sodacan config set sinks.snowflake.user "myuser"
sodacan config set sinks.snowflake.password "mypassword"

# Ingest data - automatically inserts!
sodacan ingest sales.csv snowflake
```

**Output:**
```
📥 Ingesting sales.csv → snowflake
✓ Loaded 1000 rows from CSV
Connecting to Snowflake...
Creating table PUBLIC.LOADED_DATA...
Inserting 1000 rows...
✓ Successfully inserted 1000 rows into Snowflake HACKATHON_DB.PUBLIC.LOADED_DATA
```

### Example 2: PostgreSQL Auto-Connect

```bash
# Configure PostgreSQL
sodacan config set sinks.postgres.host "localhost"
sodacan config set sinks.postgres.database "analytics"
sodacan config set sinks.postgres.user "postgres"
sodacan config set sinks.postgres.password "mypassword"

# Ingest data
sodacan ingest customers.csv postgres
```

### Example 3: SQL File Generation (Fallback)

If credentials are not provided for Snowflake:

```bash
sodacan ingest data.csv snowflake
```

**Output:**
```
⚠ No Snowflake credentials found. Generating SQL file instead.
✓ Generated Snowflake SQL script with data: load_to_snowflake.sql
```

The SQL file includes:
- CREATE TABLE statement
- INSERT statements with **actual data**
- Ready to execute in Snowflake

## 🛠️ Installation

Install required packages:

```bash
pip install -r requirements.txt
```

This installs:
- `snowflake-connector-python` - Snowflake connector
- `sqlalchemy` - Database abstraction layer
- `psycopg2-binary` - PostgreSQL driver
- `pymysql` - MySQL driver

## ⚙️ Advanced Options

### Disable Auto-Connect

Force SQL file generation even with credentials:

```yaml
snowflake:
  auto_connect: false  # Always generate SQL file
  account: "..."
  # ...
```

### Custom Table Names

Override table name per operation:

```bash
# Uses custom table name
sodacan ingest data.csv snowflake --table custom_table
```

## 🎯 Summary

**Before**: Generate SQL → Manual execution  
**After**: Automatic connection → Automatic insertion → Done!

All databases now support:
- ✅ Direct connections
- ✅ Automatic table creation
- ✅ Automatic data insertion
- ✅ Batch processing
- ✅ Error handling
- ✅ Progress indicators

The entire pipeline is now **fully automated**! 🚀


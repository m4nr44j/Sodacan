#!/bin/bash
# Quick setup script for GCP Compute Engine
# Run this after cloning the repository

set -e  # Exit on error

echo "🚀 Setting up Sodacan on GCP VM..."
echo ""

# Navigate to project
cd ~/Sodacan

# 1. Create Python virtual environment
echo "📦 Creating Python virtual environment..."
python3 -m venv ~/sodacan-env
source ~/sodacan-env/bin/activate

# 2. Upgrade pip
echo "📦 Upgrading pip..."
pip install --upgrade pip

# 3. Install dependencies
echo "📦 Installing dependencies..."
pip install -r requirements.txt

# 4. Install package in editable mode
echo "📦 Installing sodacan package..."
pip install -e .

# 5. Create credentials directory
echo "📁 Creating credentials directory..."
mkdir -p ~/.sodacan-creds

# 6. Create .env file
echo "🔐 Creating .env file..."
cat > ~/Sodacan/.env << 'ENVEOF'
# AWS Credentials (for S3 PDF access)
AWS_ACCESS_KEY_ID=AKIA2SBJDPUAB7AGGR21
AWS_SECRET_ACCESS_KEY=P|27jRyBhb2ZkA9c7S33rbMOGORm10jmCcfZDgVG
AWS_DEFAULT_REGION=us-east-1

# Snowflake Credentials
SNOWFLAKE_ACCOUNT=dgbhzvw-uh42222
SNOWFLAKE_USER=manraaj
SNOWFLAKE_PASSWORD=Derp123456((**

# Gemini API Key (⚠️ YOU NEED TO SET THIS)
# GEMINI_API_KEY=your_gemini_api_key_here

# GCP Project (optional, will use gcloud default if not set)
# GOOGLE_CLOUD_PROJECT=your-project-id
ENVEOF

# Get GCP project if available
GCP_PROJECT=$(gcloud config get-value project 2>/dev/null || echo '')
if [ -n "$GCP_PROJECT" ]; then
    echo "GOOGLE_CLOUD_PROJECT=$GCP_PROJECT" >> ~/Sodacan/.env
fi

chmod 600 ~/Sodacan/.env
echo "✓ Created .env file at ~/Sodacan/.env"

echo ""
echo "✅ Setup complete!"
echo ""
echo "📋 Next steps:"
echo ""
echo "1. Set your Gemini API key:"
echo "   nano ~/Sodacan/.env"
echo "   # Uncomment and set GEMINI_API_KEY"
echo ""
echo "2. Upload GCP service account key:"
echo "   # Place it at: ~/.sodacan-creds/gcp-service-key.json"
echo "   # Or use: gcloud iam service-accounts keys create ..."
echo ""
echo "3. Update Google Sheets IDs in sodacan.yaml:"
echo "   nano ~/Sodacan/sodacan.yaml"
echo "   # Update spreadsheet_id for google_sheet_live and google_sheet_bi"
echo ""
echo "4. Test the setup:"
echo "   source ~/sodacan-env/bin/activate"
echo "   cd ~/Sodacan"
echo "   soda --help"
echo ""
echo "5. Run Flow 3 demo:"
echo "   soda build 'snowflake_prod'"
echo ""


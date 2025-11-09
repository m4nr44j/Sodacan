#!/bin/bash
# Setup script for Flow 3 demo - exports all required credentials

# AWS Credentials (for S3 PDF access)
export AWS_ACCESS_KEY_ID="AKIA2SBJDPUAB7AGGR21"
export AWS_SECRET_ACCESS_KEY="P|27jRyBhb2ZkA9c7S33rbMOGORm10jmCcfZDgVG"
export AWS_DEFAULT_REGION="us-east-1"

# Snowflake Credentials
export SNOWFLAKE_ACCOUNT="dgbhzvw-uh42222"
export SNOWFLAKE_USER="manraaj"
export SNOWFLAKE_PASSWORD="Derp123456((**"

echo "✓ Flow 3 credentials exported"
echo "  - AWS credentials set for S3 access"
echo "  - Snowflake credentials set"
echo ""
echo "You can now run: soda build 'snowflake_prod'"


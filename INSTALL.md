# Installation Guide

## Quick Setup

### 1. Install Dependencies

```bash
pip install -r requirements.txt
```

Or install in development mode:

```bash
pip install -e .
```

### 2. Set Gemini API Key

Get your API key from: https://makersuite.google.com/app/apikey

```bash
export GEMINI_API_KEY=your_api_key_here
```

Or create a `.env` file:

```bash
echo "GEMINI_API_KEY=your_api_key_here" > .env
```

### 3. Initialize Configuration

```bash
data-cli config init
```

This creates a `data-cli.yaml` file in your current directory.

### 4. Test the CLI

```bash
data-cli --help
```

## Development Mode

If you want to run without installing:

```bash
python -m data_cli.main --help
```

Or add to your PATH:

```bash
export PATH=$PATH:$(pwd)
chmod +x data_cli/main.py
```

## Troubleshooting

### "command not found: data-cli"

Make sure you've installed the package:
```bash
pip install -e .
```

Or run directly:
```bash
python -m data_cli.main
```

### "GEMINI_API_KEY not found"

Set the environment variable:
```bash
export GEMINI_API_KEY=your_key
```

Get your API key from: https://makersuite.google.com/app/apikey

### Import errors

Make sure you're in the project directory and have installed dependencies:
```bash
pip install -r requirements.txt
```


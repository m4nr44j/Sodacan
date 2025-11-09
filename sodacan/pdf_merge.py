"""Hybrid PDF extraction for Flow 3 - 10-Q report merging"""

import json
import pandas as pd
from pathlib import Path
from typing import Dict, Any, Optional
from rich.console import Console

from sodacan.sources import download_from_s3
from sodacan.ai import configure_gemini, run_task_prompt
from sodacan.config import load_config, get_task_config

console = Console()

try:
    import google.generativeai as genai
    GENAI_AVAILABLE = True
except ImportError:
    GENAI_AVAILABLE = False

try:
    import pdfplumber
    PDFPLUMBER_AVAILABLE = True
except ImportError:
    PDFPLUMBER_AVAILABLE = False

try:
    import tabula
    TABULA_AVAILABLE = True
except ImportError:
    TABULA_AVAILABLE = False


def extract_tables_with_tabula(pdf_path: str) -> list:
    """Extract tables from PDF using tabula-py (programmatic)."""
    if not TABULA_AVAILABLE:
        console.print("[yellow][!][/yellow] tabula-py not available, using fallback method")
        return []
    
    try:
        # Extract all tables
        tables = tabula.read_pdf(pdf_path, pages='all', multiple_tables=True)
        return [df for df in tables if df is not None and not df.empty]
    except Exception as e:
        console.print(f"[yellow][!][/yellow] Tabula extraction failed: {e}")
        return []


def extract_mda_text(pdf_path: str) -> str:
    """Extract Management's Discussion and Analysis text from PDF."""
    if not PDFPLUMBER_AVAILABLE:
        return ""
    
    try:
        mda_text = ""
        with pdfplumber.open(pdf_path) as pdf:
            for page in pdf.pages:
                text = page.extract_text() or ""
                # Look for MD&A section
                if "management's discussion" in text.lower() or "mda" in text.lower():
                    mda_text += text + "\n"
        return mda_text[:10000]  # Limit to 10k chars
    except Exception as e:
        console.print(f"[yellow][!][/yellow] MD&A extraction failed: {e}")
        return ""


def merge_10q_pdf(
    s3_path: str,
    company: str,
    quarter: str,
    df: pd.DataFrame,
    config: Dict[str, Any]
) -> Optional[pd.DataFrame]:
    """
    Hybrid PDF extraction: programmatic table extraction + AI enrichment.
    
    Args:
        s3_path: S3 path to PDF (e.g., s3://bucket/file.pdf)
        company: Company name (e.g., "Google")
        quarter: Quarter identifier (e.g., "Q2-2025")
        df: Current DataFrame to merge with
        config: Configuration dict
    
    Returns:
        Merged DataFrame with new data from PDF
    """
    console.print(f"[bold][*] Processing 10-Q PDF: {s3_path}[/bold]")
    console.print(f"[dim]Company: {company}, Quarter: {quarter}[/dim]\n")
    
    # Step 1: Download PDF from S3
    console.print("[dim]Step 1: Downloading PDF from S3...[/dim]")
    local_pdf = download_from_s3(s3_path)
    if not local_pdf:
        return None
    
    # Step 2: Programmatic table extraction
    console.print("[dim]Step 2: Extracting tables programmatically...[/dim]")
    tables = extract_tables_with_tabula(str(local_pdf))
    
    # Step 3: Extract MD&A text
    console.print("[dim]Step 3: Extracting Management Discussion text...[/dim]")
    mda_text = extract_mda_text(str(local_pdf))
    
    # Step 4: Use AI to extract and enrich data
    console.print("[dim]Step 4: Using AI to extract and enrich financial data...[/dim]")
    
    # Get task config
    task_config = get_task_config("merge_10Q")
    if not task_config:
        console.print("[red][ERROR][/red] Task 'merge_10Q' not found in config")
        return None
    
    # Prepare PDF content for AI
    pdf_content = ""
    if tables:
        pdf_content += "Extracted Tables:\n"
        for i, table in enumerate(tables[:3]):  # Limit to first 3 tables
            pdf_content += f"\nTable {i+1}:\n{table.to_string()}\n"
    
    if mda_text:
        pdf_content += f"\n\nManagement Discussion:\n{mda_text[:5000]}\n"
    
    # Call AI with task prompt
    payload = {
        "company": company,
        "quarter": quarter,
        "pdf_content": pdf_content
    }
    
    ai_response = run_task_prompt(task_config, payload, config)
    if not ai_response:
        console.print("[red][ERROR][/red] AI extraction failed")
        return None
    
    # Parse JSON response
    try:
        # Clean JSON if wrapped in markdown
        if ai_response.startswith("```json"):
            ai_response = ai_response.split("\n", 1)[1].rsplit("\n", 1)[0]
        elif ai_response.startswith("```"):
            ai_response = ai_response.split("\n", 1)[1].rsplit("\n", 1)[0]
        
        pdf_data = json.loads(ai_response)
        
        if not isinstance(pdf_data, list):
            pdf_data = [pdf_data]
        
        # Convert to DataFrame
        pdf_df = pd.DataFrame(pdf_data)
        
        console.print(f"[green][OK][/green] Extracted {len(pdf_df)} segments from PDF")
        
        # Merge with existing DataFrame
        if df is None or df.empty:
            return pdf_df
        else:
            merged_df = pd.concat([df, pdf_df], ignore_index=True)
            console.print(f"[green][OK][/green] Merged data: {len(df)} + {len(pdf_df)} = {len(merged_df)} rows")
            return merged_df
            
    except json.JSONDecodeError as e:
        console.print(f"[red][ERROR][/red] Failed to parse AI response as JSON: {e}")
        console.print(f"[dim]AI Response: {ai_response[:500]}...[/dim]")
        return None
    except Exception as e:
        console.print(f"[red][ERROR][/red] Error processing PDF data: {e}")
        return None
    finally:
        # Clean up downloaded file
        try:
            if local_pdf.exists():
                local_pdf.unlink()
        except:
            pass


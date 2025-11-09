"""AI integration for sodacan."""

import os
from typing import Any, Dict, Optional

from rich.console import Console

try:
    import google.generativeai as genai
except ImportError:  # pragma: no cover - optional dependency
    genai = None  # type: ignore[assignment]

try:
    import pdfplumber
except ImportError:  # pragma: no cover - optional dependency
    pdfplumber = None  # type: ignore[assignment]

console = Console()


def configure_gemini() -> bool:
    """Configure Gemini API, checking for API key."""
    if genai is None:
        console.print("[red][ERROR][/red] google-generativeai not installed. Run 'pip install google-generativeai'.")
        return False

    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        console.print("[red][ERROR][/red] GEMINI_API_KEY not found in environment. Set it with: export GEMINI_API_KEY=your_key")
        console.print("[dim]Get your API key from: https://makersuite.google.com/app/apikey[/dim]")
        return False
    genai.configure(api_key=api_key)
    return True


def extract_pdf_to_dataframe(pdf_path: str, model_name: str = "gemini-2.5-flash") -> Optional[str]:
    """Extract structured data from a PDF using AI."""
    if pdfplumber is None:
        console.print("[red][ERROR][/red] pdfplumber not installed. Run 'pip install pdfplumber'.")
        return None

    if not configure_gemini():
        return None
    
    # Extract text from PDF
    text_content = ""
    try:
        with pdfplumber.open(pdf_path) as pdf:
            for page in pdf.pages:
                text_content += page.extract_text() or ""
    except Exception as e:
        console.print(f"[red][ERROR][/red] Error reading PDF: {e}")
        return None
    
    # Use AI to structure the data
    full_prompt = """You are an expert financial analyst specializing in SEC filings.

Your task:
1. **Find the revenue breakdown table:** Scan the entire 10-Q report to find the table showing "Revenues" broken down by business segment or product category.
2. **Extract ONLY that table:** Ignore all other tables (like securities listings, balance sheets, cash flows).
3. **Look for:** Tables with columns like "Segment Name", "Revenue", "Product Category", "Geographic Region", or similar financial breakdowns.
4. **Format as CSV:** Convert the revenue breakdown table into a clean CSV format.
5. **Include headers:** Use clear column names like "Segment", "Revenue_Millions", "Period", etc.
6. **Strict Output:** Return ONLY the CSV-formatted string. No explanations or markdown.

**What to look for:**
- Tables titled "Revenues by Segment", "Segment Results", "Product Revenue", or similar
- Usually found in "Results of Operations" or "Management's Discussion" sections
- Contains actual revenue numbers (in millions or billions)

**Fallback:**
If no revenue breakdown table exists, return:
"status"
"No revenue data found."

---
Text content:
""" + text_content[:15000]  # Increased limit for more content
    
    try:
        model = genai.GenerativeModel(model_name)
        response = model.generate_content(
            full_prompt,
            generation_config=genai.types.GenerationConfig(
                temperature=0.1,
            )
        )
        
        csv_data = response.text.strip()
        # Remove markdown code blocks if present
        if csv_data.startswith("```"):
            csv_data = csv_data.split("\n", 1)[1].rsplit("\n", 1)[0]
        
        return csv_data

    except Exception as e:  # pragma: no cover - runtime safety
        console.print(f"[red][ERROR][/red] Error calling Gemini: {e}")
        return None


def translate_natural_language_to_pandas(natural_language: str, df_preview: str, config: dict) -> Optional[str]:
    """Translate natural language command to pandas code."""
    if not configure_gemini():
        return None
    
    default_prompt = config.get("ai", {}).get("default_prompt", "You are an expert data engineer.")
    model_name = config.get("ai", {}).get("model", "gemini-2.5-flash")
    
    full_prompt = f"""{default_prompt}

You translate natural language data cleaning requests into pandas DataFrame operations.

Rules:
1. Return ONLY valid Python pandas code that operates on a DataFrame called 'df'
2. Do NOT include print statements, comments, or explanations
3. The code should be a single line or multiple lines that can be executed directly
4. Assume 'df' already exists in the namespace
5. Return ONLY the pandas code, nothing else

Example:
User: "rename 'SALE_AMT' to 'sale_amount' and fill missing values with 0"
You: df['sale_amount'] = df['SALE_AMT'].fillna(0)\ndf = df.drop(columns=['SALE_AMT'])

Current DataFrame preview:
{df_preview}

User request: {natural_language}

Return the pandas code to execute:"""
    
    try:
        model = genai.GenerativeModel(model_name)
        response = model.generate_content(
            full_prompt,
            generation_config=genai.types.GenerationConfig(
                temperature=0.1,
            )
        )
        
        code = response.text.strip()
        # Remove markdown code blocks if present
        if code.startswith("```python"):
            code = code.split("\n", 1)[1].rsplit("\n", 1)[0]
        elif code.startswith("```"):
            code = code.split("\n", 1)[1].rsplit("\n", 1)[0]
        
        return code.strip()
    except Exception as e:
        console.print(f"[red][ERROR][/red] Error calling Gemini: {e}")
        return None


class _SafeDict(dict):
    """A dict that returns an empty string for missing keys when formatting."""

    def __missing__(self, key: str) -> str:  # pragma: no cover - formatting safeguard
        return ""


def run_task_prompt(task_config: Dict[str, Any], payload: Dict[str, Any], config: Dict[str, Any]) -> Optional[str]:
    """Execute an AI task using the provided payload."""
    prompt_template = task_config.get("prompt_template")
    if not prompt_template:
        console.print("[red][ERROR][/red] Task configuration missing 'prompt_template'.")
        return None

    context = _SafeDict({**payload})
    context.setdefault(
        "row",
        "\n".join(f"{key}: {value}" for key, value in payload.items()),
    )

    try:
        prompt = prompt_template.format_map(context)
    except Exception as exc:  # pragma: no cover - formatting safeguard
        console.print(f"[red][ERROR][/red] Error formatting prompt: {exc}")
        return None

    if not configure_gemini():
        return None

    model_name = task_config.get("model") or config.get("ai", {}).get("model", "gemini-2.5-flash")

    try:
        model = genai.GenerativeModel(model_name)
        response = model.generate_content(
            prompt,
            generation_config=genai.types.GenerationConfig(
                temperature=task_config.get("temperature", 0.2),
            ),
        )
        text = (response.text or "").strip()
        if text.startswith("```"):
            text = text.split("\n", 1)[1].rsplit("\n", 1)[0]
        return text.strip()
    except Exception as exc:  # pragma: no cover - runtime safety
        console.print(f"[red][ERROR][/red] Error calling Gemini: {exc}")
        return None


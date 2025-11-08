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
        console.print("[red]✗[/red] google-generativeai not installed. Run 'pip install google-generativeai'.")
        return False

    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        console.print("[red]✗[/red] GEMINI_API_KEY not found in environment. Set it with: export GEMINI_API_KEY=your_key")
        console.print("[dim]Get your API key from: https://makersuite.google.com/app/apikey[/dim]")
        return False
    genai.configure(api_key=api_key)
    return True


def extract_pdf_to_dataframe(pdf_path: str, model_name: str = "gemini-2.5-flash") -> Optional[str]:
    """Extract structured data from a PDF using AI."""
    if pdfplumber is None:
        console.print("[red]✗[/red] pdfplumber not installed. Run 'pip install pdfplumber'.")
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
        console.print(f"[red]✗[/red] Error reading PDF: {e}")
        return None
    
    # Use AI to structure the data
    full_prompt = """You are an expert data engineer. Extract structured tabular data from the following text content of a PDF report.

Return ONLY a CSV-formatted string with headers. If you cannot find tabular data, return a simple CSV with one column called "content" containing the extracted text.

Text content:
""" + text_content[:8000]  # Limit to avoid token limits
    
    try:
        model = genai.GenerativeModel(model_name)
        response = model.generate_content(
            full_prompt,
            generation_config=genai.types.GenerationConfig(
                temperature=0.3,
            )
        )
        
        csv_data = response.text.strip()
        # Remove markdown code blocks if present
        if csv_data.startswith("```"):
            csv_data = csv_data.split("\n", 1)[1].rsplit("\n", 1)[0]
        
        return csv_data
    except Exception as e:  # pragma: no cover - runtime safety
        console.print(f"[red]✗[/red] Error calling Gemini: {e}")
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
                temperature=0.2,
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
        console.print(f"[red]✗[/red] Error calling Gemini: {e}")
        return None


class _SafeDict(dict):
    """A dict that returns an empty string for missing keys when formatting."""

    def __missing__(self, key: str) -> str:  # pragma: no cover - formatting safeguard
        return ""


def run_task_prompt(task_config: Dict[str, Any], payload: Dict[str, Any], config: Dict[str, Any]) -> Optional[str]:
    """Execute an AI task using the provided payload."""
    prompt_template = task_config.get("prompt_template")
    if not prompt_template:
        console.print("[red]✗[/red] Task configuration missing 'prompt_template'.")
        return None

    context = _SafeDict({**payload})
    context.setdefault(
        "row",
        "\n".join(f"{key}: {value}" for key, value in payload.items()),
    )

    try:
        prompt = prompt_template.format_map(context)
    except Exception as exc:  # pragma: no cover - formatting safeguard
        console.print(f"[red]✗[/red] Error formatting prompt: {exc}")
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
        console.print(f"[red]✗[/red] Error calling Gemini: {exc}")
        return None


import os
from dotenv import load_dotenv   
import google.generativeai as genai
from google.generativeai.types import GenerationConfig
import json

load_dotenv()
API_KEY = os.getenv("GEMINI_API_KEY_EXECUTOR") or os.getenv("GEMINI_API_KEY")

EXECUTOR_SYSTEM_PROMPT = """
You are a specialized "Code Executor" AI. You receive JSON instructions from an upstream
"Analyzer" AI and generate executable database code.

## Input Format
You will receive a JSON object with:
- `intent`: The classification (pandas_transform, pandas_analyze, sink_export, error)
- `one_shot_prompt`: A specific prompt describing what code to generate

## Output Rules
1. For `pandas_transform` or `pandas_analyze`: Generate ONLY valid Python pandas code
   - Operate on a DataFrame called 'df'
   - For transforms: Must reassign 'df' variable
   - For analysis: Use print() statements
   - NO markdown, NO explanations, NO comments

2. For `sink_export`: Return the word "SINK_COMMAND"

3. For `error`: Return the word "ERROR"

## Examples
---
**Input JSON:**
{
  "intent": "pandas_transform",
  "one_shot_prompt": "Generate pandas code to rename column 'col_a' to 'id'"
}

**Output:**
df = df.rename(columns={'col_a': 'id'})

---
**Input JSON:**
{
  "intent": "pandas_analyze",
  "one_shot_prompt": "Calculate and print the mean of 'sales' column"
}

**Output:**
print(df['sales'].mean())

---
**Input JSON:**
{
  "intent": "sink_export",
  "one_shot_prompt": "SINK_COMMAND"
}

**Output:**
SINK_COMMAND
"""

CODE_GENERATION_SAFETY_SETTINGS = [
    {"category": "HARM_CATEGORY_HARASSMENT", "threshold": "BLOCK_NONE"},
    {"category": "HARM_CATEGORY_HATE_SPEECH", "threshold": "BLOCK_NONE"},
    {"category": "HARM_CATEGORY_SEXUALLY_EXPLICIT", "threshold": "BLOCK_NONE"},
    {"category": "HARM_CATEGORY_DANGEROUS_CONTENT", "threshold": "BLOCK_NONE"},
]

GENERATION_CONFIG = GenerationConfig(
    temperature=0.1,  
    top_p=1.0,
    top_k=1
)

def start_executor_session(): 
    """Start the executor chat session that generates database code from JSON instructions."""
    if not API_KEY: 
        raise ValueError(
            "Error: GEMINI_API_KEY_EXECUTOR or GEMINI_API_KEY environment variable not set.\n"
            "Please set the key (e.g., 'export GEMINI_API_KEY_EXECUTOR=your_key_here')")
    
    genai.configure(api_key=API_KEY)

    model = genai.GenerativeModel(
        model_name="gemini-2.5-flash",
        safety_settings=CODE_GENERATION_SAFETY_SETTINGS,
        generation_config=GENERATION_CONFIG,
        system_instruction=EXECUTOR_SYSTEM_PROMPT
    )

    chat_session = model.start_chat()
    print("Executor model (Code Generator) is ready.")

    return chat_session


def execute_instructions(chat_session, instructions: dict, df_preview: str = "") -> str:
    """
    Execute JSON instructions and generate database code.
    
    Args:
        chat_session: The executor chat session
        instructions: dict with 'intent' and 'one_shot_prompt' keys
        df_preview: Optional DataFrame preview for context
    
    Returns:
        Generated code string or special tokens (SINK_COMMAND, ERROR)
    """
    intent = instructions.get("intent", "error")
    one_shot_prompt = instructions.get("one_shot_prompt", "")
    
    if intent == "error":
        return "ERROR"
    
    if intent == "sink_export" or one_shot_prompt == "SINK_COMMAND":
        return "SINK_COMMAND"
    
    prompt = f"""
**Instructions from Analyzer:**
Intent: {intent}
Prompt: {one_shot_prompt}

**Current DataFrame Preview:**
{df_preview}

Generate the executable code based on these instructions. Return ONLY the code (no markdown, no explanations).
"""
    
    try:
        response = chat_session.send_message(prompt)
        code = response.text.strip()
        
        # Remove markdown code blocks if present
        if code.startswith("```python"):
            code = code.split("\n", 1)[1].rsplit("\n", 1)[0]
        elif code.startswith("```"):
            code = code.split("\n", 1)[1].rsplit("\n", 1)[0]
        
        return code.strip()
        
    except Exception as e:
        print(f"Error in executor: {e}")
        return "ERROR"


if __name__ == "__main__":
    executor = start_executor_session()
    test_instructions = {
        "intent": "pandas_transform",
        "one_shot_prompt": "Generate pandas code to rename column 'sales' to 'revenue'"
    }
    result = execute_instructions(executor, test_instructions)
    print(f"Generated code: {result}")

import os
from dotenv import load_dotenv   
import google.generativeai as genai
from google.generativeai.types import GenerationConfig
import json

load_dotenv()
API_KEY = os.getenv("GEMINI_API_KEY")

# Analyzer System Prompt - Converts natural language to JSON instructions
ANALYZER_SYSTEM_PROMPT = """
You are an AI "Task Analyzer" for a data transformation pipeline. Your sole
purpose is to analyze a raw user instruction and the current data schema,
then generate a single, valid JSON object.

This JSON object will classify the user's intent and provide a new,
highly-specific, one-shot prompt for a downstream "Executor" AI.

## Task Classification
You must classify the user's intent into one of these four categories:
1.  `pandas_transform`: The user wants to modify the DataFrame.
2.  `pandas_analyze`: The user is asking a question about the data.
3.  `sink_export`: The user wants to save or export the data.
4.  `error`: The user's request is ambiguous or nonsensical.

## JSON Output Format
Your output MUST be ONLY the raw JSON object, with no other text, no markdown, no explanations.
{
  "intent": "<intent_name>",
  "one_shot_prompt": "<The new, specific prompt for the downstream model OR an action token>"
}

## Examples
---
**Example 1: A Transformation**
* **Input Schema:** `{'col_a': 'int', 'col_b': 'string'}`
* **User Input:** `rename col_a to id`
* **Output JSON:**
{
  "intent": "pandas_transform",
  "one_shot_prompt": "Generate a single line of pandas code for a DataFrame 'df' to rename the column 'col_a' to 'id'. The code must reassign the 'df' variable."
}

**Example 2: An Analysis**
* **User Input:** `show me the mean of sales`
* **Output JSON:**
{
  "intent": "pandas_analyze",
  "one_shot_prompt": "Generate a print statement that calculates and displays the mean of the 'sales' column in DataFrame 'df'."
}

**Example 3: Export Command**
* **User Input:** `save to snowflake`
* **Output JSON:**
{
  "intent": "sink_export",
  "one_shot_prompt": "SINK_COMMAND"
}
"""

CODE_GENERATION_SAFETY_SETTINGS = [
    {"category": "HARM_CATEGORY_HARASSMENT", "threshold": "BLOCK_NONE"},
    {"category": "HARM_CATEGORY_HATE_SPEECH", "threshold": "BLOCK_NONE"},
    {"category": "HARM_CATEGORY_SEXUALLY_EXPLICIT", "threshold": "BLOCK_NONE"},
    {"category": "HARM_CATEGORY_DANGEROUS_CONTENT", "threshold": "BLOCK_NONE"},
]

GENERATION_CONFIG = GenerationConfig(
    temperature=0.1,  # Keep it low and predictable
    top_p=1.0,
    top_k=1
)

def start_analyzer_session(): 
    """Start the analyzer chat session that converts natural language to JSON instructions."""
    if not API_KEY: 
        raise ValueError(
            "Error: GEMINI_API_KEY environment variable not set.\n"
            "Please set the key (e.g., 'export GEMINI_API_KEY=your_key_here')")
    
    genai.configure(api_key=API_KEY)

    model = genai.GenerativeModel(
        model_name="gemini-2.5-flash",
        safety_settings=CODE_GENERATION_SAFETY_SETTINGS,
        generation_config=GENERATION_CONFIG,
        system_instruction=ANALYZER_SYSTEM_PROMPT
    )

    chat_session = model.start_chat()
    # Send a "kick-off" message to prime the model for its task
    chat_session.send_message("You are ready to analyze user requests. I will provide the schema and user input.")

    print("Analyzer model (Task Planner) is ready.")
    return chat_session


def analyze_user_input(chat_session, user_input: str, schema_info: str) -> dict:
    """
    Analyze user input and return JSON instructions.
    
    Args:
        chat_session: The analyzer chat session
        user_input: Natural language command from user
        schema_info: DataFrame schema information
    
    Returns:
        dict with 'intent' and 'one_shot_prompt' keys
    """
    prompt = f"""
**Current DataFrame Schema:**
```
{schema_info}
```

**User Instruction:**
"{user_input}"

Analyze this request and return ONLY the JSON object (no markdown, no explanations).
"""
    
    try:
        response = chat_session.send_message(prompt)
        json_text = response.text.strip()
        
        # Remove markdown code blocks if present
        if json_text.startswith("```json"):
            json_text = json_text.split("\n", 1)[1].rsplit("\n", 1)[0]
        elif json_text.startswith("```"):
            json_text = json_text.split("\n", 1)[1].rsplit("\n", 1)[0]
        
        # Parse JSON
        instructions = json.loads(json_text)
        return instructions
        
    except json.JSONDecodeError as e:
        print(f"Error parsing JSON: {e}")
        print(f"Raw response: {json_text}")
        return {"intent": "error", "one_shot_prompt": "ERROR"}
    except Exception as e:
        print(f"Error in analyzer: {e}")
        return {"intent": "error", "one_shot_prompt": "ERROR"}


if __name__ == "__main__":
    session = start_analyzer_session()
    # Test
    test_schema = "Column: 'sales' (float64), 'region' (object)"
    test_input = "rename sales to revenue"
    result = analyze_user_input(session, test_input, test_schema)
    print(f"Result: {result}")

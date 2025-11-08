import os
import google.generativeai as genai
from google.generativeai.types import GenerationConfig

# This is your new "Analyzer" prompt.
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
Your output MUST be ONLY the raw JSON object, with no other text.
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
```json
{
  "intent": "pandas_transform",
  "one_shot_prompt": "Generate a single line of pandas code for a DataFrame 'df' to rename the column 'col_a' to 'id'. The code must reassign the 'df' variable."
}"""

def start_soda_chat_session(): 

   #API_KEY = os.environ.get("GEMINI_API_KEY")
   if not API_KEY: 
        raise ValueError(
            "Error: GOOGLE_API_KEY environment variable not set.\n"
            "Please set the key (e.g., 'export GOOGLE_API_KEY=your_key_here')")
   
   genai.configure(api_key=api_key)

   model = genai.GenerativeModel(
      model_name="gemini-1.5-flash",
      safety_settings=CODE_GENERATION_SAFETY_SETTINGS,
      generation_config=GENERATION_CONFIG,
      system_instruction=ANALYZER_SYSTEM_PROMPT
   )

   # We add this to tell the model to output JSON
   chat_session = model.start_chat()
   # Send a "kick-off" message to prime the model for its task
   chat_session.send_message("You are ready to analyze user requests. I will provide the schema and user input.")

   print("Analyzer model (Task Planner) is ready.")
   return chat_session
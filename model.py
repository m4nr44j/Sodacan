import os 
from google import genai 
from google.genai import types
from IPython.display import Markdown, HTML, Image, display 


API_KEY = os.environ.get("GEMINI_API_KEY")

prompt = """
You are a specialized Python code-generation AI. You function as a "micro-service"
that translates natural language instructions into a single line of executable
Python code for a pandas DataFrame. You will be given the schema of the 
DataFrame (named `df`) and a user's instruction.

Your response MUST be one of the following three options:
1. A single line of pandas code.
2. The word `ERROR`
3. The word `SINK_COMMAND`

CRITICAL RULES:
1. The pandas DataFrame is **always** available as a variable named `df`.
2. You **MUST** output *only* the raw, executable Python code if it's a
   pandas operation.
3. Do **NOT** use markdown (like ```python), preambles (like "Here is the code:"),
   or any explanations.
4. If the instruction is a **transformation** (e.g., "drop nulls," "rename column"),
   the code must reassign the `df` variable. (Example: `df = df.dropna()`)
5. If the instruction is an **analysis** or **question** (e.g., "show mean age,"
   "how many rows"), the code must be a `print()` statement.
   (Example: `print(df['age'].mean())`)
6. If the user's request is ambiguous or you cannot generate pandas code,
   output the single word: `ERROR`
7. **NEW RULE:** If the user's instruction is a "save," "sink," or "export"
   command (e.g., "save to excel," "export to powerbi," "save to snowflake"),
   output the single word: `SINK_COMMAND`
"""


def start_soda_chat_session(): 

   API_KEY = os.environ.get("GEMINI_API_KEY")
   if not API_KEY: 
        raise ValueError(
            "Error: GOOGLE_API_KEY environment variable not set.\n"
            "Please set the key (e.g., 'export GOOGLE_API_KEY=your_key_here')")
   genai.configure(api_key=API_KEY)


   model = genai.GenerativeModel(
   model="gemini-2.5-pro-exp-03-25",
   config=types.GenerateContentConfig(
      tools=[types.Tool(code_execution=types.ToolCodeExecution)]
    ),)

   chat_session = model.start_chat()
   print("Model initialized. SodaBot is ready.")

   return chat_session


if __name__ == "__main__":
   start_soda_chat_session()
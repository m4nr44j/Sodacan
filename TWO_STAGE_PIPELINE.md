# Two-Stage AI Pipeline Architecture

## Overview

Sodacan now uses a **two-stage AI pipeline** for natural language processing:

1. **Analyzer (model.py)**: Natural language → JSON instructions
2. **Executor (executor.py)**: JSON instructions → Database code

## Architecture

```
User Input (Natural Language)
        ↓
┌─────────────────────────────┐
│  Stage 1: Analyzer (model.py)│
│  - Classifies intent          │
│  - Generates JSON instructions│
└──────────────┬──────────────┘
               ↓
      JSON Instructions
      {
        "intent": "pandas_transform",
        "one_shot_prompt": "..."
      }
               ↓
┌─────────────────────────────┐
│ Stage 2: Executor (executor.py)│
│  - Takes JSON instructions    │
│  - Generates pandas code      │
└──────────────┬──────────────┘
               ↓
      Executable Code
      (pandas operations)
```

## Stage 1: Analyzer (`model.py`)

**Purpose**: Convert natural language to structured JSON instructions

**Input**:
- User's natural language command
- DataFrame schema information

**Output**: JSON object
```json
{
  "intent": "pandas_transform" | "pandas_analyze" | "sink_export" | "error",
  "one_shot_prompt": "Specific prompt for executor"
}
```

**Intent Classifications**:
- `pandas_transform`: Modify DataFrame (rename, filter, etc.)
- `pandas_analyze`: Question/analysis (mean, count, etc.)
- `sink_export`: Save/export command
- `error`: Ambiguous or invalid request

**Model**: `gemini-2.5-flash` (fast, efficient for classification)

## Stage 2: Executor (`executor.py`)

**Purpose**: Generate executable code from JSON instructions

**Input**:
- JSON instructions from Analyzer
- DataFrame preview (optional context)

**Output**: 
- Pandas code string (for transforms/analysis)
- `"SINK_COMMAND"` (for export commands)
- `"ERROR"` (for errors)

**Model**: `gemini-2.5-flash` (optimized for code generation)

## Integration in `build.py`

The interactive build command now uses the two-stage pipeline:

```python
# Initialize both stages
analyzer_session = start_analyzer_session()
executor_session = start_executor_session()

# Process user command
instructions = analyze_user_input(analyzer_session, command, schema)
pandas_code = execute_instructions(executor_session, instructions, preview)
```

## Benefits

1. **Separation of Concerns**: 
   - Analyzer focuses on understanding intent
   - Executor focuses on code generation

2. **Better Accuracy**: 
   - Two specialized models instead of one general model
   - Each model optimized for its specific task

3. **Easier Debugging**: 
   - Can inspect JSON instructions between stages
   - Clear separation of intent vs. execution

4. **Flexibility**: 
   - Can swap executor models independently
   - Can add more intent types easily

5. **Fallback**: 
   - If two-stage fails, falls back to single-stage
   - System remains functional

## Example Flow

### User Input: "rename sales to revenue"

**Stage 1 (Analyzer)**:
```json
{
  "intent": "pandas_transform",
  "one_shot_prompt": "Generate pandas code to rename column 'sales' to 'revenue'"
}
```

**Stage 2 (Executor)**:
```python
df = df.rename(columns={'sales': 'revenue'})
```

**Result**: Code executed on DataFrame

## Configuration

Both models use environment variables:
- `GEMINI_API_KEY` - For analyzer (model.py)
- `GEMINI_API_KEY_EXECUTOR` - For executor (executor.py), falls back to `GEMINI_API_KEY`

## Error Handling

- If analyzer fails → Returns `{"intent": "error"}`
- If executor fails → Returns `"ERROR"`
- If both fail → Falls back to single-stage translation
- System always has a fallback path

## Future Enhancements

- Add more intent types (e.g., `data_validation`, `statistical_test`)
- Support for SQL generation (not just pandas)
- Caching of common transformations
- Multi-step instruction sequences


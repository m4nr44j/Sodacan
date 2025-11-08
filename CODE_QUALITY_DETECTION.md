# Code Quality Detection Logic

This document explains how each code quality metric is detected and quantified.

## Overview

The analyzer scans **all Function and APIRoute nodes** in the codebase, extracting their `codeSnippet` and applying pattern matching heuristics. Some metrics also analyze the **code graph structure** (edges between nodes).

---

## 1. DB Queries in Loops (93 critical issues)

### Detection Method
- **Scans**: All Function/APIRoute nodes
- **Pattern Matching**: Regex on code snippets

### Loop Detection
Looks for actual loops (not functional methods):
```regex
/\bfor\s*\([^)]*\)\s*\{/g      // for loops
/\bwhile\s*\([^)]*\)\s*\{/g     // while loops  
/\bforeach\s*\(/g               // foreach loops (C#/PHP)
```

### Database Query Detection
Within each loop body, searches for:
```regex
/\b(?:SELECT|INSERT|UPDATE|DELETE)\s+.*?\bFROM\b/i
/\b(?:db|DB|database|Database|_context|_db)\.(?:query|execute|ExecuteSql|FromSql|SaveChanges|SaveChangesAsync)/i
/\b(?:prisma|sequelize|typeorm)\.(?:findMany|findUnique|create|update|delete)/i
/\b(?:User|Model|Entity|DbSet)\.(?:Find|Where|First|FirstOrDefault|Single|SingleOrDefault)/i
/\b(?:DB::|Cache::)table|select|insert|update|delete/i
/\.(?:SaveChanges|SaveChangesAsync|ExecuteSql|FromSql)/i
/\b(?:session\.query|orm\.query|db\.query|_context\.)/i
```

### Quantification
- Finds matching brace for loop body
- Checks if loop body contains any DB query pattern
- **Counts once per unique loop** (deduplicates by `filePath:functionName:loopStart`)

---

## 2. N+1 Query Patterns (40 issues)

### Detection Method
- **Scans**: All Function/APIRoute nodes
- **Heuristic**: Query in loop WITHOUT eager loading

### Loop Detection
```regex
/\bfor\s*\([^)]*\)\s*\{/g
/\bwhile\s*\([^)]*\)\s*\{/g
/\bforeach\s*\(/g
/\.forEach\s*\(/g
```

### Query Detection (in loop body)
```regex
/\.(?:Find|FindAsync|First|FirstOrDefault|Single|SingleOrDefault|Where)\s*\(/i
/\.(?:Include|ThenInclude|Load|LoadAsync)\s*\(/i
/\b(?:SELECT|query|execute).*?\bFROM/i
/_context\.(?:Set|Find|FindAsync)/i
```

### Eager Loading Check
If loop body contains:
```regex
/(?:\.Include|\.ThenInclude|\.With|\.Join|eager|preload|\.Load)/i
```
→ **NOT counted** as N+1 (has eager loading)

### Quantification
- **Counts**: Loop with query BUT no eager loading
- **Deduplicates**: One count per unique loop location

---

## 3. Dead Code (2,208 items)

### Controllers (388)
**Detection**: Graph analysis
- Finds nodes where `type === 'APIRoute'` OR filename/label contains "Controller"
- Checks for incoming edges: `e.type === 'API_CALL' || e.type === 'CALLS'`
- **Counts**: Controllers with zero incoming edges

### Methods (1,809)
**Detection**: Graph analysis + filename filtering
- **Only analyzes**: Files/functions containing "Service" or "Controller"
- Checks for incoming `CALLS` edges
- **Excludes**: Methods named `main`, `index`, `entry`, `constructor`, `init`, `startup`
- **Counts**: Methods with zero incoming calls

### Commented Code Blocks (4)
**Detection**: Pattern matching
- Searches for multi-line comments: `/\*[\s\S]{100,}?\*\//g`
- **Counts**: Blocks with > 5 lines

### Backup Files (7)
**Detection**: Filename patterns
```regex
/\.bak$|\.backup$|\.old$|\.orig$|~$|\.tmp$/i
/backup|old|temp|tmp/i
```

---

## 4. Technical Debt (36 items)

### Scope
**Only analyzes**: Files/functions containing "Service" (not Controllers)

### TODO Comments (34)
**Pattern**: 
```regex
/\/\/.*TODO|\/\*.*TODO|#.*TODO/i
```
- Must be actual comment (not in string literal)
- Checks if comment appears before any quotes in the line

### FIXME Comments
**Pattern**:
```regex
/\/\/.*FIXME|\/\*.*FIXME|#.*FIXME/i
```

### Hacky Comments (2)
**Pattern**:
```regex
/\/\/.*(?:hacky|hack|kludge|workaround)|\/\*.*(?:hacky|hack|kludge|workaround)|#.*(?:hacky|hack|kludge|workaround)/i
```

### Temporarily Removed
**Pattern**:
```regex
/\/\/.*(?:temporarily\s+removed|temp\s+removed|temporary\s+removal)|\/\*.*(?:temporarily\s+removed|temp\s+removed|temporary\s+removal)|#.*(?:temporarily\s+removed|temp\s+removed|temporary\s+removal)/i
```

### Quantification
- **Counts**: Each matching line once
- **Stores**: Line number and full comment text

---

## 5. Code Smells (121 issues)

### Scope
**Only analyzes**: Files/functions containing "Service" or "Controller"

### Inconsistent Error Handling
**Heuristic**: Try block without catch
```regex
hasTry = /try\s*\{/.test(code)
hasCatch = /catch\s*\(/.test(code)
```
**Counts**: If `hasTry && !hasCatch`

### Magic Numbers/Strings
**Patterns**:
```regex
/\b(?:[4-9]\d{2,}|\d{4,})\b/g        // 400+ or 4+ digits
/['"](?:[a-zA-Z]{15,}|[A-Z_]{8,})['"]/g  // Long strings or constants
```
**Filtering**:
- Excludes: HTTP codes (200, 201, 400, 404, 500)
- Excludes: Years (1900-2100)
- Excludes: Common strings (http, https, application, json, text, html)
**Threshold**: > 5 magic numbers OR > 5 magic strings

### Long Method
**Heuristic**: Line count
**Threshold**: > 80 lines
```javascript
const lineCount = code.split('\n').length
if (lineCount > 80) { /* count */ }
```

### Type Mismatch
**Patterns**:
```regex
/\([A-Z][a-zA-Z0-9_<>]*\)\s*\w+/g  // (Type)variable
/\bas\s+[A-Z][a-zA-Z0-9_<>]+/g      // as Type
```
**Threshold**: > 10 type casts

---

## 6. Repeated Code (3 areas)

### Duplicate Validation Logic
**Pattern**: 
```regex
/(?:validate|check|verify|required|max|min)\s*\([^)]+\)/gi
```
- Normalizes patterns (lowercase, whitespace collapse)
- **Counts**: Patterns appearing > 1 time across codebase

### Duplicate Address Collection
**Pattern**:
```regex
/(?:address|street|city|zip|postal)[\s\S]{0,200}/gi
```
**Threshold**: > 3 occurrences

### Duplicate SQL Migrations
**Pattern**:
```regex
/(?:CREATE|ALTER)\s+TABLE\s+(\w+)/gi
```
- Groups by table name
- **Counts**: Tables modified > 1 time

### Repeated Include Patterns
**Pattern**:
```regex
/\.(?:include|with|join)\s*\([^)]+\)/gi
```
- Normalizes patterns
- **Counts**: Patterns appearing > 1 time

---

## 7. Anomalies (7 issues)

### Scope
**Only analyzes**: Files/functions containing "Service" or "Controller"

### SaveChangesAsync Usage
**Pattern**: `SaveChangesAsync` without `await`
```regex
/SaveChangesAsync|saveChangesAsync/i.test(code) 
&& !/\bawait\s+.*?SaveChangesAsync/i.test(code)
```

### Async/Await Pattern
**Pattern**: Mixing async/await with blocking calls
```regex
/\basync\s+[^{]*\{[^}]*\bawait\s+[^}]*\b\.Result\b/g
```

### Commented Includes
**Pattern**: Commented eager loading with active query
```regex
/\/\/\s*\.(?:Include|With|ThenInclude)/i  // Commented include
&& /\.(?:Find|Where|First|ToList|ToArray)/i  // Active query
```

### Database Timeout
**Pattern**: Low timeout value
```regex
/timeout\s*[=:]\s*\d+\s*[<,=]\s*30/i  // timeout <= 30
&& /database|db|query|connection|command/i
```

### Fire-and-forget
**Pattern**: Task.Run without await
```regex
/Task\.Run\s*\([^)]*\)(?!\s*\.|await)/i
```

### Quantification
- **Deduplicates**: One count per issue type per function

---

## 8. Blocking Async Calls (18 instances)

### Scope
**Only analyzes**: Files/functions containing "Service" or "Controller"
**Excludes**: Test files (filename contains "test", "spec", "mock", "stub")

### Patterns
```regex
/\.Result\b(?!\s*==|\s*!=|\s*===|\s*!==)/g  // .Result (not comparisons)
/\.Wait\s*\(\s*\)/g                          // .Wait()
/\.GetAwaiter\s*\(\s*\)\s*\.GetResult\s*\(/g  // .GetAwaiter().GetResult()
```

### Quantification
- **Deduplicates**: One count per unique method call per function
- **Key**: `filePath:functionName:method`

---

## Key Limitations

1. **Pattern-based**: Uses regex, not full AST parsing
2. **Heuristic thresholds**: Arbitrary (80 lines, 10 casts, etc.)
3. **Scope filtering**: Only Services/Controllers for some metrics
4. **Graph analysis**: Dead code detection depends on CALLS/API_CALL edges being accurate
5. **False positives**: May flag legitimate patterns (e.g., intentional loops with queries)
6. **Language-specific**: Patterns optimized for C#/.NET (SaveChangesAsync, Entity Framework)

---

## Data Sources

- **Code snippets**: From `node.codeSnippet` (extracted by language strategies)
- **Graph edges**: From `codeMap.edges` (CALLS, API_CALL relationships)
- **File paths**: From `node.filePath` (for filtering by Service/Controller)
- **Node types**: Function, APIRoute, File (from `node.type`)


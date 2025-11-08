# Docufy – Polyglot Code-Base Intelligence

Docufy turns any repository into a machine-readable **code map**: every file, class, function, API route and infrastructure resource is extracted and linked so that architects, tech-writers and automation tools can understand the project instantly.

---
## 1  Quick start
```bash
# install deps & build TypeScript
npm ci && npm run build

# generate a summary of the test workspace
npx docufy analyze testing --format summary

# full JSON map
npx docufy analyze testing --output full-map.json
```
Configuration lives in `docufy.config.json` (glob patterns for include / exclude, analysis flags, output filename …). Use `docufy init` to create one.

---
## 2  What Docufy extracts
| Entity                | Example                                           |
|-----------------------|---------------------------------------------------|
| **File**              | `main.go`, `app.py`, `deployment.yaml`            |
| **Class / Struct**    | `User`, `InMemoryUserRepository`                  |
| **Function / Method** | `createUser`, `hash_password`                     |
| **Component**         | React component, Laravel controller, K8s resource |
| **API Route**         | `GET /api/users`, `POST /users`                   |
| **Database Ops**      | `DB::table(...)`, `Cache::remember(...)`          |

Relationships (`edges`) currently emitted:
* `IMPORTS` – source/target language-agnostic
* `REFERENCES` – HTML → CSS / JS, C++ include etc.

---
## 3  Language & framework coverage

| Language family | Status | Framework patterns |
|-----------------|--------|--------------------|
| TypeScript / JS | ✔ (AST) | React components & hooks |
| HTML / CSS      | ✔ (AST) | Web Components, selectors |
| Python          | ✔ (AST) | Flask routes (`@app.route`) |
| Java            | ✔ (AST) | Spring Boot controllers |
| Go              | ✔ (AST) | Gorilla Mux / net-http handlers |
| C++ / C# / Rust | ✔ (AST) | Classes, templates, impl blocks |
| PHP             | ✔ (AST) | Laravel controllers + DB / Cache ops |
| Bash            | ⚡ (regex) | Functions, `kubectl`/`docker` calls |
| Ruby            | ⚡ (regex) | Rails controllers, CRUD routes |
| YAML (K8s)      | ⚡ (regex) | Every `kind:` becomes a Component |
| Dart / Flutter  | ⚡ (regex) | Widgets & route maps |
| SQL             | ⚡ (disabled) | Grammar ABI mismatch |

✔ = full Tree-sitter queries    ⚡ = regex fallback (still useful, never crashes)

---
## 4  Architecture
```
ParserFactory   ─┐   one Tree-sitter parser per file-type
                 │
Orchestrator ──▶ Strategy per language ──▶ partial CodeMap
                              │
InteractionAnalyzer           │  merges → IMPORT/REFERENCE edges
```
Strategies live in `packages/core/src/analysis/` and implement a simple interface:
```ts
analyze(ast: Tree, file: string, language: Language | undefined): { nodes; edges }
```
If no parser is available (e.g. Dart ABI mismatch) the orchestrator passes a
*dummy* AST whose `rootNode.text` is the raw file so regex-based strategies can still work.

---
## 5  Extending Docufy (3-step pattern)
1. **Add grammar** – `npm i tree-sitter-<lang>` and register in `ParserFactory`.
2. **Write `<Lang>Strategy.ts`** – Tree-sitter queries or regexes.
3. **Wire it** – export in `core/index.ts` and add to the CLI strategy map.

A minimal strategy is often <150 LOC.

---
## 6  Current limitations / roadmap
* Dart & SQL grammars need rebuilds for ABI 15 (regex fallback works meanwhile)
* No call-graph (`CALLS` edges) – planned via post-pass symbol resolver
* YAML strategy recognises resource kinds only, not spec details
* Duplicate CSS selectors are emitted twice (dedup pass forthcoming)

---
## 7  Repository layout
```
packages/
  core/      # engine + strategies
  cli/       # yargs-based CLI (bin docufy)

testing/     # multi-language sample project used in CI
```

---
## 8  Contributing
Pull requests welcome!  Typical contributions:
* New Tree-sitter strategy for a language/framework
* Grammar rebuild scripts for ABI compatibility
* Visualisation / docs site that consumes `full-map.json`

Please run `npm run build` and `docufy analyze testing` before opening a PR. 
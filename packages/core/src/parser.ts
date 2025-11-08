import path from 'path'
import Parser from 'tree-sitter'

// Correctly import the language grammars
const JavaScript = require('tree-sitter-javascript')
const Python = require('tree-sitter-python')
const TypeScript = require('tree-sitter-typescript').typescript
const Java = require('tree-sitter-java')
const Go = require('tree-sitter-go')
const HTML = require('tree-sitter-html')
const CSS = require('tree-sitter-css')
const CPP = require('tree-sitter-cpp')
const CSharp = require('tree-sitter-c-sharp')
const Rust = require('tree-sitter-rust')
const Dart = require('tree-sitter-dart')
const PHP = require('tree-sitter-php')
const Ruby = require('tree-sitter-ruby')
const Kotlin = require('tree-sitter-kotlin')
const Swift = require('tree-sitter-swift')
const Scala = require('tree-sitter-scala')
const Lua = require('tree-sitter-lua')
const Bash = require('tree-sitter-bash')
const YAML = require('tree-sitter-yaml')
const SQL = require('tree-sitter-sql')
// const Dockerfile = require('tree-sitter-dockerfile') // Temporarily disabled - no working parser available

// Helper function to extract language object from various export formats
function getLanguage(grammar: any): any {
  if (!grammar) return undefined;

  // Case 1: Language object exported directly
  if (grammar.nodeTypeInfo) return grammar;

  // Case 2: Exported as { language: <Language> }
  if (grammar.language && grammar.language.nodeTypeInfo) return grammar.language;

  // Case 3: Common named properties (typescript, php, etc.)
  const candidates = ['typescript', 'php', 'php_only', 'swift', 'kotlin', 'scala'];
  for (const key of candidates) {
    if (grammar[key] && grammar[key].nodeTypeInfo) return grammar[key];
  }

  // Case 4: Search for first property that looks like a Language object
  for (const key of Object.keys(grammar)) {
    const val = grammar[key];
    if (val && val.nodeTypeInfo) return val;
  }

  return undefined; // Unsupported grammar format
}

export class ParserFactory {
  private readonly grammarCache = new Map<string, Parser.Language>()

  public getParserForFile(filePath: string): Parser | undefined {
    const extension = path.extname(filePath)
    const filename = path.basename(filePath)
    let language = this.grammarCache.get(extension)

    // Special case for Dockerfile without extension - temporarily disabled
    // if (filename === 'Dockerfile' || filename.startsWith('Dockerfile.')) {
    //   language = getLanguage(Dockerfile)
    // }

    if (!language) {
      switch (extension) {
        case '.js':
        case '.jsx':
          language = getLanguage(JavaScript)
          break
        case '.ts':
        case '.tsx':
          language = getLanguage(TypeScript)
          break
        case '.py':
          language = getLanguage(Python)
          break
        case '.java':
          language = getLanguage(Java)
          break
        case '.go':
          language = getLanguage(Go)
          break
        case '.html':
        case '.htm':
          language = getLanguage(HTML)
          break
        case '.css':
          language = getLanguage(CSS)
          break
        case '.cpp':
        case '.cc':
        case '.cxx':
        case '.h':
        case '.hpp':
          language = getLanguage(CPP)
          break
        case '.cs':
          language = getLanguage(CSharp)
          break
        case '.rs':
          language = getLanguage(Rust)
          break
        case '.dart':
          language = getLanguage(Dart)
          break
        case '.php':
          language = getLanguage(PHP)
          break
        case '.rb':
          language = getLanguage(Ruby)
          break
        case '.kt':
        case '.kts':
          language = getLanguage(Kotlin)
          break
        case '.swift':
          language = getLanguage(Swift)
          break
        case '.scala':
        case '.sc':
          language = getLanguage(Scala)
          break
        case '.lua':
          language = getLanguage(Lua)
          break
        case '.sh':
        case '.bash':
        case '.zsh':
          language = getLanguage(Bash)
          break
        case '.yml':
        case '.yaml':
          language = getLanguage(YAML)
          break
        case '.sql':
          language = getLanguage(SQL)
          break
        case 'Dockerfile':
        case '.dockerfile':
          // language = getLanguage(Dockerfile) // Temporarily disabled
          return undefined
      }
    }

    // If a language was found and cached, or loaded for the first time
    if (language) {
      // Add to cache if it wasn't there before
      if (!this.grammarCache.has(extension)) {
        this.grammarCache.set(extension, language)
      }

      const parser = new Parser()
      try {
        parser.setLanguage(language)
      } catch (err) {
        // Language object is incompatible with current Tree-sitter runtime
        // Fallback: skip this file silently
        return undefined
      }
      return parser
    }

    // If no language was found for the extension, return undefined
    return undefined
  }
}
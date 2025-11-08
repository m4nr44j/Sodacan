import { readFileSync, statSync } from 'fs'
import { glob } from 'glob'
import path from 'path'
import { Language } from 'tree-sitter'
import { IAnalysisStrategy } from './analysis/IAnalysisStrategy'
import { InteractionAnalyzer } from './InteractionAnalyzer'
import { CodeQualityAnalyzer } from './CodeQualityAnalyzer'
import { ParserFactory } from './parser'
import { CodeMap } from './types'

// Defines the structure of the docufy.config.json file
interface DocufyConfig {
  include?: string[]
  exclude: string[]
  maxFiles?: number
  maxFileSizeKB?: number
  concurrency?: number
  onlyFiles?: string[]
  interactionRules?: {
    type: 'API_CALL'
    frontend: { path: string; urlPrefix?: string }
    backend: { path: string }
  }[]
}

export class Orchestrator {
  private parserFactory: ParserFactory
  private strategies: Map<string, IAnalysisStrategy>
  private config: DocufyConfig

  constructor(
    parserFactory: ParserFactory,
    strategies: Map<string, IAnalysisStrategy>,
    config: DocufyConfig
  ) {
    this.parserFactory = parserFactory
    this.strategies = strategies
    this.config = config
  }

  public async analyzeProject(projectPath: string): Promise<CodeMap> {
    // If onlyFiles provided, use them directly
    let filePaths: string[] = []
    if (this.config.onlyFiles && this.config.onlyFiles.length > 0) {
      filePaths = this.config.onlyFiles
        .map(p => path.resolve(projectPath, p))
    } else {
      // Resolve include patterns or default to project path
      const includePatterns = (this.config.include && this.config.include.length > 0)
        ? this.config.include.map((p) => path.resolve(projectPath, p))
        : [path.resolve(projectPath, '**/*')]

      // Supported extensions
      const extensions = '{ts,js,py,java,go,html,htm,css,cpp,cc,cxx,h,hpp,cs,rs,dart,php,rb,kt,kts,swift,scala,sc,lua,sh,bash,zsh,yml,yaml,sql,dockerfile,json,graphql,gql,tf}'

      // Collect files using include patterns and excludes
      const discovered = new Set<string>()
      for (const pattern of includePatterns) {
        const matches = glob.sync(`${pattern}.${extensions}`, { ignore: this.config.exclude })
        for (const m of matches) discovered.add(m)

        // Dockerfiles without extension
        const dockerMatches = glob.sync(path.join(pattern, 'Dockerfile*'), { ignore: this.config.exclude })
        for (const dm of dockerMatches) discovered.add(dm)
      }

      // Apply max files and size limits
      const maxFiles = this.config.maxFiles ?? Infinity
      const maxSizeKB = this.config.maxFileSizeKB ?? Infinity

      filePaths = Array.from(discovered)
        .filter((filePath) => {
          try {
            const st = statSync(filePath)
            return st.isFile() && (st.size / 1024) <= maxSizeKB
          } catch {
            return false
          }
        })
        .slice(0, isFinite(maxFiles) ? Math.max(0, Math.floor(maxFiles)) : undefined)
    }

    let masterCodeMap: CodeMap = { nodes: [], edges: [] }
    const symbolTable: Record<string,string> = {}
    const callSites: any[] = []

    // Concurrency control
    const concurrency = Math.max(1, Math.min(this.config.concurrency ?? 4, 32))
    let index = 0
    const results: any[] = []

    const worker = async () => {
      while (true) {
        const i = index++
        if (i >= filePaths.length) break
        const filePath = filePaths[i]
        const result = this.analyzeFile(filePath)
        if (result) results.push({ result, filePath })
      }
    }

    const workers = Array.from({ length: concurrency }, () => worker())
    // eslint-disable-next-line @typescript-eslint/await-thenable
    await Promise.all(workers)

    for (const { result, filePath } of results) {
      masterCodeMap.nodes.push(...result.nodes)
      masterCodeMap.edges.push(...result.edges)
      if (result.exports) {
        Object.assign(symbolTable, result.exports)
      }
      if (result.calls) {
        callSites.push(...result.calls.map((cs: any)=>({...cs, callerFile:filePath})))
      }
    }

    const interactionAnalyzer = new InteractionAnalyzer()
    masterCodeMap = interactionAnalyzer.resolveImportEdges(masterCodeMap)

    if (this.config.interactionRules) {
      masterCodeMap = interactionAnalyzer.analyzeAPICalls(
        masterCodeMap,
        this.config.interactionRules
      )
    }

    masterCodeMap = interactionAnalyzer.analyzeDBLineage(masterCodeMap)
    masterCodeMap = interactionAnalyzer.analyzeORM(masterCodeMap)
    masterCodeMap = interactionAnalyzer.analyzeKubernetes(masterCodeMap)
    masterCodeMap = interactionAnalyzer.analyzeHelm(masterCodeMap)
    masterCodeMap = interactionAnalyzer.analyzeTerraform(masterCodeMap)
    masterCodeMap = interactionAnalyzer.analyzeGraphQLSDL(masterCodeMap)

    // Run code quality analysis
    const codeQualityAnalyzer = new CodeQualityAnalyzer()
    masterCodeMap.statistics = codeQualityAnalyzer.analyze(masterCodeMap)

    // Dedupe APIRoute nodes per (filePath,label)
    const routeKey = (n: any) => `${n.filePath}::${n.label}`
    const firstByKey = new Map<string, string>() // key -> canonical node id
    const toRemove = new Set<string>()
    for (const n of masterCodeMap.nodes) {
      if (n.type !== 'APIRoute') continue
      const key = routeKey(n)
      if (!firstByKey.has(key)) {
        firstByKey.set(key, n.id)
      } else {
        toRemove.add(n.id)
      }
    }
    if (toRemove.size > 0) {
      // Rewrite edges pointing to duplicates
      for (const e of masterCodeMap.edges) {
        if (toRemove.has(e.targetId)) {
          const dupNode = masterCodeMap.nodes.find(nn => nn.id === e.targetId)
          const key = dupNode ? routeKey(dupNode) : undefined
          const canonical = key ? firstByKey.get(key!) : undefined
          if (canonical) e.targetId = canonical
        }
      }
      // Filter out duplicate nodes
      masterCodeMap.nodes = masterCodeMap.nodes.filter(n => !toRemove.has(n.id))
    }

    // Deterministic sorting for stable output
    masterCodeMap.nodes.sort((a, b) =>
      a.type === b.type ? (a.filePath === b.filePath ? a.label.localeCompare(b.label) : a.filePath.localeCompare(b.filePath)) : a.type.localeCompare(b.type)
    )
    masterCodeMap.edges.sort((a, b) =>
      a.type === b.type ? (a.sourceId === b.sourceId ? a.targetId.localeCompare(b.targetId) : a.sourceId.localeCompare(b.sourceId)) : a.type.localeCompare(b.type)
    )

    // Populate metadata
    masterCodeMap.version = '1.0.0'
    masterCodeMap.generatedAt = new Date().toISOString()
    masterCodeMap.generator = '@docufy/core'
    try {
      const commit = require('child_process').execSync('git rev-parse HEAD', { cwd: projectPath }).toString().trim()
      ;(masterCodeMap as any).commit = commit
    } catch {}

    return masterCodeMap
  }

  public analyzeFile(filePath: string): CodeMap | undefined {
    const parser = this.parserFactory.getParserForFile(filePath)
    const fileContent = readFileSync(filePath, 'utf8')

    // If no parser, fall back to a dummy tree whose rootNode.text is the raw file
    let ast: any
    let languageObj: any = undefined

    if (parser) {
      try {
        ast = parser.parse(fileContent)
        languageObj = parser.getLanguage()
      } catch {
        ast = { rootNode: { text: fileContent } }
      }
    } else {
      ast = { rootNode: { text: fileContent } }
    }

    const languageName = this.getLanguageFromExtension(filePath)
    if (!languageName) return undefined

    const strategy = this.strategies.get(languageName)
    if (!strategy) return undefined

    return strategy.analyze(ast as any, filePath, languageObj)
  }

  private getLanguageFromExtension(filePath: string): string | undefined {
    const extension = path.extname(filePath)
    const filename = path.basename(filePath)
    
    // Special case for Dockerfile
    if (filename === 'Dockerfile' || filename.startsWith('Dockerfile.')) {
      return 'Dockerfile'
    }
    
    switch (extension) {
      case '.js':
      case '.jsx':
        return 'JavaScript'
      case '.ts':
      case '.tsx':
        return 'TypeScript'
      case '.py':
        return 'Python'
      case '.java':
        return 'Java'
      case '.go':
        return 'Go'
      case '.html':
      case '.htm':
        return 'HTML'
      case '.css':
        return 'CSS'
      case '.cpp':
      case '.cc':
      case '.cxx':
      case '.h':
      case '.hpp':
        return 'CPP'
      case '.cs':
        return 'CSharp'
      case '.rs':
        return 'Rust'
      case '.dart':
        return 'Dart'
      case '.php':
        return 'PHP'
      case '.rb':
        return 'Ruby'
      case '.kt':
      case '.kts':
        return 'Kotlin'
      case '.swift':
        return 'Swift'
      case '.scala':
      case '.sc':
        return 'Scala'
      case '.lua':
        return 'Lua'
      case '.sh':
      case '.bash':
      case '.zsh':
        return 'Bash'
      case '.yml':
      case '.yaml':
        return 'YAML'
      case '.sql':
        return 'SQL'
      case '.tf':
        return 'Terraform'
      case '.proto':
        return 'Proto'
      case '.graphql':
      case '.gql':
        return 'GraphQL'
      case '.json':
        return 'JSON'
      case '.dockerfile':
        return 'Dockerfile'
      default:
        return undefined
    }
  }
}
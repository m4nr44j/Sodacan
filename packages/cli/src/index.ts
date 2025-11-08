#!/usr/bin/env node

import fs from 'fs'
import path from 'path'
import yargs from 'yargs'
import { hideBin } from 'yargs/helpers'
import { 
  Orchestrator, 
  ParserFactory, 
  TypeScriptStrategy, 
  PythonStrategy, 
  JavaScriptStrategy, 
  JavaStrategy, 
  GoStrategy,
  HTMLStrategy,
  CSSStrategy,
  CPPStrategy,
  CSharpStrategy,
  RustStrategy,
  DartStrategy,
  PHPStrategy,
  SQLStrategy,
  BashStrategy,
  YAMLStrategy,
  RubyStrategy,
  DartRegexStrategy
} from '@docufy/core'

const DEFAULT_CONFIG = {
  "include": ["**/*"],
  "exclude": [
    "**/node_modules/**",
    "**/dist/**", 
    "**/build/**",
    "**/.git/**",
    "**/target/**",
    "**/bin/**",
    "**/obj/**"
  ],
  "maxFiles": undefined as number | undefined,
  "maxFileSizeKB": undefined as number | undefined,
  "output": {
    "format": "json",
    "file": "docufy-analysis.json"
  },
  "analysis": {
    "crossLanguageAPICalls": true,
    "frameworkDetection": true
  }
}

interface AnalyzeArgs {
  path: string
  output?: string
  config?: string
  verbose?: boolean
  format?: 'json' | 'summary'
  include?: string[]
  exclude?: string[]
  maxFiles?: number
  maxFileSizeKb?: number
  concurrency?: number
  onlyFiles?: string[]
  strict?: boolean
  diagnostics?: boolean
  since?: string
}

interface InitArgs {
  force?: boolean
}

function createStrategies() {
  const parserFactory = new ParserFactory()
  
  // Instantiate all language strategies
  const tsStrategy = new TypeScriptStrategy()
  const pyStrategy = new PythonStrategy()
  const jsStrategy = new JavaScriptStrategy()
  const javaStrategy = new JavaStrategy()
  const goStrategy = new GoStrategy()
  const htmlStrategy = new HTMLStrategy()
  const cssStrategy = new CSSStrategy()
  const cppStrategy = new CPPStrategy()
  const csharpStrategy = new CSharpStrategy()
  const rustStrategy = new RustStrategy()
  const dartStrategy = new DartStrategy()
  const phpStrategy = new PHPStrategy()
  const sqlStrategy = new SQLStrategy()
  const bashStrategy = new BashStrategy()
  const yamlStrategy = new YAMLStrategy()
  const rubyStrategy = new RubyStrategy()
  const dartRegexStrategy = new DartRegexStrategy()
  // Terraform
  const { TerraformStrategy } = require('@docufy/core')
  const tfStrategy = new TerraformStrategy()
  const { JSONStrategy } = require('@docufy/core')
  const jsonStrategy = new JSONStrategy()

  // Add all strategies to the map - Supporting 17+ languages + frameworks + databases!
  const strategies = new Map([
    ['TypeScript', tsStrategy],
    ['Python', pyStrategy],
    ['JavaScript', jsStrategy],
    ['Java', javaStrategy],
    ['Go', goStrategy],
    ['HTML', htmlStrategy],
    ['CSS', cssStrategy],
    ['CPP', cppStrategy],
    ['CSharp', csharpStrategy],
    ['Rust', rustStrategy],
    ['Dart', dartStrategy],
    ['PHP', phpStrategy],
    ['SQL', sqlStrategy],
    ['Bash', bashStrategy],
    ['YAML', yamlStrategy],
    ['Ruby', rubyStrategy],
    ['Dart', dartRegexStrategy],
    ['Terraform', tfStrategy],
    ['JSON', jsonStrategy]
  ])

  return { parserFactory, strategies }
}

function loadConfig(configPath: string) {
  try {
    const configContent = fs.readFileSync(configPath, 'utf8')
    return JSON.parse(configContent)
  } catch (error) {
    console.error(`❌ Failed to load config file: ${configPath}`)
    console.error(`   ${(error as Error).message}`)
    process.exit(1)
  }
}

function initCommand(args: InitArgs) {
  const configPath = path.resolve(process.cwd(), 'docufy.config.json')
  
  if (fs.existsSync(configPath) && !args.force) {
    console.error('Configuration file already exists. Use --force to overwrite.')
    process.exit(1)
  }

  try {
    fs.writeFileSync(configPath, JSON.stringify(DEFAULT_CONFIG, null, 2))
    console.log('Created docufy.config.json')
    console.log('You can now customize the configuration and run:')
    console.log('   docufy analyze .')
  } catch (error) {
    console.error('Failed to create configuration file')
    console.error(`   ${(error as Error).message}`)
    process.exit(1)
  }
}

async function analyzeCommand(args: AnalyzeArgs) {
  const projectPath = path.resolve(args.path)
  const configPath = args.config ? path.resolve(args.config) : path.resolve(process.cwd(), 'docufy.config.json')
  
  if (!fs.existsSync(projectPath)) {
    console.error(`Path does not exist: ${projectPath}`)
    process.exit(1)
  }

  if (!fs.existsSync(configPath)) {
    console.error('Configuration file not found. Run `docufy init` first.')
    process.exit(1)
  }

  const config = loadConfig(configPath)
  const { parserFactory, strategies } = createStrategies()

  // CLI overrides
  if (args.include && args.include.length) config.include = args.include
  if (args.exclude && args.exclude.length) config.exclude = args.exclude
  if (typeof args.maxFiles === 'number') config.maxFiles = args.maxFiles
  if (typeof args.maxFileSizeKb === 'number') config.maxFileSizeKB = args.maxFileSizeKb
  if (typeof args.concurrency === 'number') config.concurrency = args.concurrency
  if (args.onlyFiles && args.onlyFiles.length) config.onlyFiles = args.onlyFiles
  if (typeof args.strict === 'boolean') config.strict = args.strict
  if (typeof args.diagnostics === 'boolean') config.diagnostics = args.diagnostics
  if (args.since) {
    try {
      const base = args.since
      const cp = require('child_process')
      const diff = cp.execSync(`git diff --name-only ${base} --`, { cwd: projectPath }).toString().trim()
      const files = diff.split(/\r?\n/).filter(Boolean)
      if (files.length > 0) config.onlyFiles = files
      if (args.verbose) console.log(`Incremental: ${files.length} changed files since ${base}`)
    } catch (e) {
      console.error('Failed to compute changed files for --since')
    }
  }
  
  if (args.verbose) {
    console.log('Starting analysis...')
    console.log(`Project path: ${projectPath}`)
    console.log(`Config file: ${configPath}`)
    console.log(`Supported languages: ${Array.from(strategies.keys()).join(', ')}`)
  }

  try {
    const orchestrator = new Orchestrator(parserFactory, strategies, config)
    const codeMap = await orchestrator.analyzeProject(projectPath)
    
    const stats = {
      totalFiles: codeMap.nodes.filter(n => n.type === 'File').length,
      totalFunctions: codeMap.nodes.filter(n => n.type === 'Function').length,
      totalClasses: codeMap.nodes.filter(n => n.type === 'Class').length,
      totalComponents: codeMap.nodes.filter(n => n.type === 'Component').length,
      totalApiRoutes: codeMap.nodes.filter(n => n.type === 'APIRoute').length,
      totalEdges: codeMap.edges.length,
      languageBreakdown: {} as Record<string, number>
    }

    // Calculate language breakdown
    codeMap.nodes.filter(n => n.type === 'File').forEach(file => {
      const lang = file.language
      stats.languageBreakdown[lang] = (stats.languageBreakdown[lang] || 0) + 1
    })

    // Framework detection
    const frameworks = new Set<string>()
    codeMap.nodes.forEach(node => {
      if (node.metadata?.framework) {
        frameworks.add(node.metadata.framework)
      }
    })

    if (args.format === 'summary' || args.verbose) {
      console.log('\nAnalysis Results:')
      console.log(`   Files analyzed: ${stats.totalFiles}`)
      console.log(`   Functions found: ${stats.totalFunctions}`)
      console.log(`   Classes found: ${stats.totalClasses}`)
      console.log(`   Components found: ${stats.totalComponents}`)
      console.log(`   API routes found: ${stats.totalApiRoutes}`)
      console.log(`   Cross-references: ${stats.totalEdges}`)
      if (frameworks.size > 0) {
        console.log(`   Frameworks detected: ${Array.from(frameworks).join(', ')}`)
      }
      console.log('\nLanguage Breakdown:')
      Object.entries(stats.languageBreakdown).forEach(([lang, count]) => {
        console.log(`   ${lang}: ${count} files`)
      })

      // Code Quality Statistics
      if (codeMap.statistics) {
        console.log('\nCode Quality Statistics:')
        const s = codeMap.statistics
        
        if (s.dbQueriesInLoops.count > 0) {
          console.log(`   - DB Queries in Loops: ${s.dbQueriesInLoops.count} critical issue${s.dbQueriesInLoops.count !== 1 ? 's' : ''}`)
        }
        
        if (s.nPlusOneQueries.count > 0) {
          console.log(`   - N+1 Query Patterns: ${s.nPlusOneQueries.count} issue${s.nPlusOneQueries.count !== 1 ? 's' : ''} identified`)
        }
        
        if (s.deadCode.count > 0) {
          const deadCodeDetails = []
          if (s.deadCode.controllers > 0) deadCodeDetails.push(`${s.deadCode.controllers} controller${s.deadCode.controllers !== 1 ? 's' : ''}`)
          if (s.deadCode.methods > 0) deadCodeDetails.push(`${s.deadCode.methods} method${s.deadCode.methods !== 1 ? 's' : ''}`)
          if (s.deadCode.commentedBlocks > 0) deadCodeDetails.push(`${s.deadCode.commentedBlocks} commented code block${s.deadCode.commentedBlocks !== 1 ? 's' : ''}`)
          if (s.deadCode.backupFiles > 0) deadCodeDetails.push(`${s.deadCode.backupFiles} backup file${s.deadCode.backupFiles !== 1 ? 's' : ''}`)
          console.log(`   - Dead Code: ${s.deadCode.count} item${s.deadCode.count !== 1 ? 's' : ''} (${deadCodeDetails.join(', ')})`)
        }
        
        if (s.technicalDebt.count > 0) {
          const debtDetails = []
          if (s.technicalDebt.todos > 0) debtDetails.push(`${s.technicalDebt.todos} TODO${s.technicalDebt.todos !== 1 ? 's' : ''}`)
          if (s.technicalDebt.fixmes > 0) debtDetails.push(`${s.technicalDebt.fixmes} FIXME${s.technicalDebt.fixmes !== 1 ? 's' : ''}`)
          if (s.technicalDebt.hackyComments > 0) debtDetails.push(`${s.technicalDebt.hackyComments} "hacky" comment${s.technicalDebt.hackyComments !== 1 ? 's' : ''}`)
          if (s.technicalDebt.temporarilyRemoved > 0) debtDetails.push(`${s.technicalDebt.temporarilyRemoved} "temporarily removed" comment${s.technicalDebt.temporarilyRemoved !== 1 ? 's' : ''}`)
          console.log(`   - Technical Debt (TODO/FIXME): ${s.technicalDebt.count} item${s.technicalDebt.count !== 1 ? 's' : ''} (${debtDetails.join(' + ')})`)
        }
        
        if (s.codeSmells.count > 0) {
          const smellTypes = new Set(s.codeSmells.issues.map((i: { type: string }) => i.type))
          console.log(`   - Code Smells: ${s.codeSmells.count} issue${s.codeSmells.count !== 1 ? 's' : ''} (${Array.from(smellTypes).join(', ')})`)
        }
        
        if (s.repeatedCode.count > 0) {
          const repeatTypes = new Set(s.repeatedCode.issues.map((i: { type: string }) => i.type))
          console.log(`   - Repeated Code: ${s.repeatedCode.count} area${s.repeatedCode.count !== 1 ? 's' : ''} (${Array.from(repeatTypes).join(', ')})`)
        }
        
        if (s.anomalies.count > 0) {
          const anomalyTypes = new Set(s.anomalies.issues.map((i: { type: string }) => i.type))
          console.log(`   - Anomalies: ${s.anomalies.count} issue${s.anomalies.count !== 1 ? 's' : ''} (${Array.from(anomalyTypes).join(', ')})`)
        }
        
        if (s.blockingAsyncCalls.count > 0) {
          console.log(`   - Blocking Async Calls (.Result): ${s.blockingAsyncCalls.count} instance${s.blockingAsyncCalls.count !== 1 ? 's' : ''} found`)
        }
      }

      if (args.diagnostics) {
        console.log('\nDiagnostics:')
        console.log(`   Concurrency: ${config.concurrency ?? 4}`)
        console.log(`   Max files: ${config.maxFiles ?? '∞'}`)
        console.log(`   Max file size KB: ${config.maxFileSizeKB ?? '∞'}`)
      }
    }

    if (args.format !== 'summary') {
      const outputPath = args.output || config.output?.file || 'docufy-analysis.json'
      const resolvedOutputPath = path.resolve(outputPath)
      
      fs.writeFileSync(resolvedOutputPath, JSON.stringify(codeMap, null, 2))
      
      if (args.verbose) {
        console.log(`\nFull analysis saved to: ${resolvedOutputPath}`)
      }
    }

    console.log('\nAnalysis complete!')
    
  } catch (error) {
    console.error('Analysis failed')
    console.error(`   ${(error as Error).message}`)
    if (args.verbose) {
      console.error(error)
    }
    process.exit(1)
  }
}

function showSupportedLanguages() {
  console.log('Supported Languages & Frameworks:')
  console.log('')
  
  const languages = [
    { name: 'TypeScript', extensions: ['.ts', '.tsx'], frameworks: ['React'] },
    { name: 'JavaScript', extensions: ['.js', '.jsx'], frameworks: ['React'] },
    { name: 'Python', extensions: ['.py'], frameworks: ['Django', 'Flask'] },
    { name: 'Java', extensions: ['.java'], frameworks: ['Spring Boot'] },
    { name: 'Go', extensions: ['.go'], frameworks: ['Gin', 'Gorilla Mux'] },
    { name: 'Rust', extensions: ['.rs'], frameworks: ['Axum', 'Actix'] },
    { name: 'C++', extensions: ['.cpp', '.cc', '.cxx', '.h', '.hpp'], frameworks: [] },
    { name: 'C#', extensions: ['.cs'], frameworks: ['ASP.NET Core'] },
    { name: 'PHP', extensions: ['.php'], frameworks: ['Laravel', 'Symfony'] },
    { name: 'Ruby', extensions: ['.rb'], frameworks: ['Rails', 'Sinatra'] },
    { name: 'Kotlin', extensions: ['.kt', '.kts'], frameworks: ['Spring Boot', 'Android'] },
    { name: 'Swift', extensions: ['.swift'], frameworks: ['SwiftUI', 'iOS'] },
    { name: 'Scala', extensions: ['.scala', '.sc'], frameworks: ['Akka', 'Play'] },
    { name: 'Lua', extensions: ['.lua'], frameworks: ['OpenResty', 'Love2D'] },
    { name: 'Shell', extensions: ['.sh', '.bash', '.zsh'], frameworks: [] },
    { name: 'SQL', extensions: ['.sql'], frameworks: ['PostgreSQL', 'MySQL', 'SQLite'] },
    { name: 'YAML', extensions: ['.yml', '.yaml'], frameworks: ['Kubernetes', 'Docker Compose'] },
    { name: 'Dockerfile', extensions: ['Dockerfile'], frameworks: ['Docker'] },
    { name: 'HTML', extensions: ['.html', '.htm'], frameworks: ['Web Components'] },
    { name: 'CSS', extensions: ['.css'], frameworks: [] }
  ]

  languages.forEach(lang => {
    const extStr = lang.extensions.join(', ')
    const frameworkStr = lang.frameworks.length > 0 ? ` (${lang.frameworks.join(', ')})` : ''
    console.log(`   ${lang.name}${frameworkStr}: ${extStr}`)
  })
  
  console.log('')
  console.log('Detection capabilities:')
  console.log('   - Functions, classes, interfaces, structs')
  console.log('   - API routes and endpoints')
  console.log('   - Framework-specific patterns (Components, Models, etc.)')
  console.log('   - Database interactions and queries')
  console.log('   - Infrastructure and deployment configurations')
  console.log('   - Cross-language API calls')
  console.log('   - Import/dependency relationships')
}

// Configure CLI
const cli = yargs(hideBin(process.argv))
  .scriptName('docufy')
  .version('1.0.0')
  .usage('Universal code analysis tool supporting 15+ languages and frameworks')
  .help()
  .alias('h', 'help')
  .alias('v', 'version')
  .demandCommand(1, 'You need to specify a command')
  .recommendCommands()
  .strict()

cli.command(
  'analyze <path>',
  'Analyze a codebase and generate insights',
  {
    path: {
      describe: 'Path to the project or file to analyze',
      type: 'string' as const,
      demandOption: true
    },
    output: {
      alias: 'o',
      describe: 'Output file path for analysis results',
      type: 'string' as const
    },
    config: {
      alias: 'c',
      describe: 'Path to configuration file',
      type: 'string' as const
    },
    include: {
      alias: 'I',
      describe: 'Glob patterns to include',
      type: 'string' as const,
      array: true
    },
    exclude: {
      alias: 'E',
      describe: 'Glob patterns to exclude',
      type: 'string' as const,
      array: true
    },
    maxFiles: {
      describe: 'Maximum number of files to analyze',
      type: 'number' as const
    },
    maxFileSizeKb: {
      describe: 'Maximum file size in KB',
      type: 'number' as const
    },
    concurrency: {
      describe: 'Number of concurrent parser workers',
      type: 'number' as const
    },
    onlyFiles: {
      describe: 'Analyze only these files (relative to path)',
      type: 'string' as const,
      array: true
    },
    strict: {
      describe: 'Fail on parse errors (non-zero exit)',
      type: 'boolean' as const
    },
    diagnostics: {
      describe: 'Print diagnostics (limits, concurrency)',
      type: 'boolean' as const
    },
    since: {
      describe: 'Analyze only files changed since this git ref (e.g., origin/main)',
      type: 'string' as const
    },
    format: {
      alias: 'f',
      describe: 'Output format',
      choices: ['json', 'summary'] as const,
      default: 'json' as const
    },
    verbose: {
      describe: 'Enable verbose output',
      type: 'boolean' as const,
      default: false
    }
  },
  analyzeCommand
)

cli.command(
  'init',
  'Initialize a new docufy configuration file',
  {
    force: {
      describe: 'Overwrite existing configuration file',
      type: 'boolean' as const,
      default: false
    }
  },
  initCommand
)

cli.command(
  'languages',
  'Show supported languages and frameworks',
  () => {},
  showSupportedLanguages
)

cli.epilogue('For more information, visit: https://github.com/your-org/docufy')

// Parse and execute
cli.parse()
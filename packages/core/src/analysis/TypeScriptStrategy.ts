import { createHash } from 'crypto'
import { Language, Query, QueryMatch, Tree } from 'tree-sitter'
import { Node, Edge } from '../types'
import { IAnalysisStrategy } from './IAnalysisStrategy'

export class TypeScriptStrategy implements IAnalysisStrategy {
  analyze(ast: any, filePath: string, language?: Language) {
    const nodes: Node[] = []
    const edges: Edge[] = []
    const exports: Record<string,string> = {}
    const calls: import('../types').CallSite[] = []

    if (!language) {
      return { nodes, edges, exports, calls }
    }

    const fileContent = (ast as any).rootNode?.text || ''

    // Check if this is a React file by looking for React imports or JSX
    const isReactFile = this.detectReactImports(ast, language) || filePath.includes('.tsx')

    // Helper function to process a query match and create a node
    const processFunctionMatch = (match: QueryMatch) => {
      const nameNode = match.captures.find((c) => c.name === 'name')?.node
      if (!nameNode) return

      // Find the top-level declaration for the code snippet
      let codeSnippetNode = nameNode.parent
      while (codeSnippetNode?.parent && codeSnippetNode.parent !== ast.rootNode) {
        codeSnippetNode = codeSnippetNode.parent
      }

      // Detect if this is a React component or hook
      const isReactComponent = isReactFile && this.isReactComponent(nameNode, codeSnippetNode)
      const isReactHook = isReactFile && this.isReactHook(nameNode.text)
      
      let nodeType: 'Function' | 'Component' = 'Function'
      let metadata: any = undefined

      if (isReactComponent) {
        nodeType = 'Component'
        metadata = { framework: 'React', componentType: 'functional' }
      } else if (isReactHook) {
        metadata = { framework: 'React', hookType: 'custom' }
      }

      const id = createHash('sha1').update(`function:${nameNode.text}:${filePath}`).digest('hex')
      nodes.push({
        id,
        label: nameNode.text,
        type: nodeType,
        filePath: filePath,
        language: 'TypeScript',
        codeSnippet: codeSnippetNode?.text,
        metadata
      })
      exports[nameNode.text] = id
    }

    // TypeScript queries
    const functionQuery = new Query(language, '(function_declaration name: (identifier) @name)')
    functionQuery.matches(ast.rootNode).forEach(processFunctionMatch)

    const arrowFunctionQuery = new Query(
      language,
      '(lexical_declaration (variable_declarator name: (identifier) @name value: (arrow_function)))'
    )
    arrowFunctionQuery.matches(ast.rootNode).forEach(processFunctionMatch)

    const classQuery = new Query(language, '(class_declaration name: (type_identifier) @name)')
    const classMatches = classQuery.matches(ast.rootNode)
    for (const match of classMatches) {
      const nameNode = match.captures.find(c => c.name === 'name')?.node
      if (nameNode) {
        nodes.push({
          id: createHash('sha1').update(`class:${nameNode.text}:${filePath}`).digest('hex'),
          label: nameNode.text,
          type: 'Class',
          filePath: filePath,
          language: 'TypeScript',
          codeSnippet: nameNode.parent?.text,
        })
      }
    }

    // Create a file node for this TypeScript file
    const fileId = createHash('sha1').update(`file:${filePath}`).digest('hex')
    nodes.push({
      id: fileId,
      type: 'File',
      label: filePath.split('/').pop() || filePath,
      filePath: filePath,
      language: 'TypeScript',
    })

    // Find import statements and create IMPORTS edges
    const importQuery = new Query(language, '(import_statement source: (string) @path)')
    const importMatches = importQuery.matches(ast.rootNode)
    for (const match of importMatches) {
      const pathNode = match.captures.find(c => c.name === 'path')?.node
      if (pathNode) {
        const importPath = pathNode.text.replace(/["\']/g, '')
        edges.push({ sourceId: fileId, targetId: importPath, type: 'IMPORTS' })
      }
    }

    // Express route detection (heuristic regex)
    const expressRouteRegex = /\b(app|router)\.(get|post|put|patch|delete)\s*\(\s*['"`]([^'"`]+)['"`]/g
    let r: RegExpExecArray | null
    while ((r = expressRouteRegex.exec(fileContent)) !== null) {
      const method = r[2].toUpperCase()
      const routePath = r[3]
      nodes.push({
        id: createHash('sha1').update(`api-route:${method}:${routePath}:${filePath}`).digest('hex'),
        label: routePath,
        type: 'APIRoute',
        filePath,
        language: 'TypeScript',
        metadata: { framework: 'Express', httpMethod: method }
      })
    }

    // NestJS decorator detection: @Controller('base') + @Get('path')
    const controllerMatch = /@Controller\(\s*['"`]([^'"`]*)['"`]??\s*\)/.exec(fileContent)
    if (controllerMatch) {
      const base = controllerMatch[1] || ''
      const methodDecoRegex = /@(Get|Post|Put|Patch|Delete)\(\s*['"`]([^'"`]*)['"`]??\s*\)/g
      let mm: RegExpExecArray | null
      while ((mm = methodDecoRegex.exec(fileContent)) !== null) {
        const method = mm[1].toUpperCase()
        const sub = mm[2] || ''
        const route = this.joinNestPath(base, sub)
        nodes.push({
          id: createHash('sha1').update(`api-route:${method}:${route}:${filePath}`).digest('hex'),
          label: route,
          type: 'APIRoute',
          filePath,
          language: 'TypeScript',
          metadata: { framework: 'NestJS', httpMethod: method }
        })
      }
    }

    // Next.js API routes: pages/api/* or app/api/*/route.ts
    if (/\bpages\/api\//.test(filePath)) {
      const route = this.normalizeApiPath(filePath, 'pages/api')
      nodes.push({
        id: createHash('sha1').update(`api-route:ANY:${route}:${filePath}`).digest('hex'),
        label: route,
        type: 'APIRoute',
        filePath,
        language: 'TypeScript',
        metadata: { framework: 'Next.js' }
      })
    }
    if (/\bapp\/api\//.test(filePath) && /\/route\.(ts|tsx|js|jsx)$/.test(filePath)) {
      const route = this.normalizeApiPath(filePath, 'app/api')
      // Detect exported HTTP method handlers
      const methods: string[] = []
      const exportMethodRegex = /export\s+(async\s+)?function\s+(GET|POST|PUT|PATCH|DELETE)\b/g
      let em: RegExpExecArray | null
      while ((em = exportMethodRegex.exec(fileContent)) !== null) {
        methods.push(em[2])
      }
      const uniq = methods.length ? Array.from(new Set(methods)) : ['ANY']
      for (const mth of uniq) {
        nodes.push({
          id: createHash('sha1').update(`api-route:${mth}:${route}:${filePath}`).digest('hex'),
          label: route,
          type: 'APIRoute',
          filePath,
          language: 'TypeScript',
          metadata: { framework: 'Next.js', httpMethod: mth }
        })
      }
    }

    // regex for calls
    const callRegex=/\b([a-zA-Z_][a-zA-Z0-9_]*)\s*\(/g
    let m:RegExpExecArray|null
    while((m=callRegex.exec(fileContent))!==null){
      const callee=m[1]
      calls.push({callerId:'',raw:callee}) // attach later in orchestrator
    }

    return { nodes, edges, exports, calls }
  }

  private detectReactImports(ast: Tree, language: Language): boolean {
    const importQuery = new Query(language, '(import_statement source: (string) @path)')
    const importMatches = importQuery.matches(ast.rootNode)

    for (const match of importMatches) {
      const pathNode = match.captures.find(c => c.name === 'path')?.node
      if (pathNode) {
        const importPath = pathNode.text.replace(/["\']/g, '')
        if (importPath === 'react' || importPath.startsWith('react/') || 
            importPath.startsWith('@react') || importPath.includes('react-')) {
          return true
        }
      }
    }
    return false
  }

  private isReactComponent(nameNode: any, codeSnippetNode: any): boolean {
    if (!/^[A-Z]/.test(nameNode.text)) return false
    const code = codeSnippetNode?.text || ''
    return code.includes('return <') || code.includes('jsx') || code.includes('createElement')
  }

  private isReactHook(functionName: string): boolean {
    return /^use[A-Z]/.test(functionName)
  }

  private joinNestPath(base: string, sub: string): string {
    const b = (base || '').replace(/\/$/, '')
    const s = (sub || '').replace(/^\//, '')
    const joined = [b, s].filter(Boolean).join('/')
    return '/' + joined.replace(/^\//, '')
  }

  private normalizeApiPath(filePath: string, baseDir: string): string {
    const idx = filePath.indexOf(baseDir + '/')
    if (idx === -1) return '/api'
    let rest = filePath.slice(idx + baseDir.length + 1)
    rest = rest.replace(/\/route\.(ts|tsx|js|jsx)$/, '')
    rest = rest.replace(/\.(ts|tsx|js|jsx)$/, '')
    if (!rest.startsWith('/')) rest = '/' + rest
    return rest
  }
}
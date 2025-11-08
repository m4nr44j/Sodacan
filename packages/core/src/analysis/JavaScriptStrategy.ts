import { Tree, Query, Language } from 'tree-sitter'
import { IAnalysisStrategy } from './IAnalysisStrategy'
import { Node, Edge } from '../types'
import { createHash } from 'crypto'

export class JavaScriptStrategy implements IAnalysisStrategy {
  analyze(ast: Tree, filePath: string, language: Language): { nodes: Node[]; edges: Edge[] } {
    const nodes: Node[] = []
    const edges: Edge[] = []

    // Find function declarations
    const functionQuery = new Query(
      language,
      '(function_declaration name: (identifier) @name)'
    )
    const functionMatches = functionQuery.matches(ast.rootNode)

    for (const match of functionMatches) {
      const nameNode = match.captures.find(c => c.name === 'name')?.node
      if (nameNode) {
        nodes.push({
          id: createHash('sha1')
            .update(`function:${nameNode.text}:${filePath}`)
            .digest('hex'),
          label: nameNode.text,
          type: 'Function',
          filePath: filePath,
          language: 'JavaScript',
          codeSnippet: nameNode.parent?.text,
        })
      }
    }

    // Find arrow functions
    const arrowFunctionQuery = new Query(
      language,
      '(variable_declarator name: (identifier) @name value: (arrow_function))'
    )
    const arrowMatches = arrowFunctionQuery.matches(ast.rootNode)

    for (const match of arrowMatches) {
      const nameNode = match.captures.find(c => c.name === 'name')?.node
      if (nameNode) {
        nodes.push({
          id: createHash('sha1')
            .update(`arrow-function:${nameNode.text}:${filePath}`)
            .digest('hex'),
          label: nameNode.text,
          type: 'Function',
          filePath: filePath,
          language: 'JavaScript',
          codeSnippet: nameNode.parent?.text,
        })
      }
    }

    // Find ES6 class definitions
    const classQuery = new Query(
      language,
      '(class_declaration name: (identifier) @name)'
    )
    const classMatches = classQuery.matches(ast.rootNode)

    for (const match of classMatches) {
      const nameNode = match.captures.find(c => c.name === 'name')?.node
      if (nameNode) {
        nodes.push({
          id: createHash('sha1')
            .update(`class:${nameNode.text}:${filePath}`)
            .digest('hex'),
          label: nameNode.text,
          type: 'Class',
          filePath: filePath,
          language: 'JavaScript',
          codeSnippet: nameNode.parent?.text,
        })
      }
    }

    // Create a file node for this JavaScript file
    const fileId = createHash('sha1').update(`file:${filePath}`).digest('hex')
    nodes.push({
      id: fileId,
      type: 'File',
      label: filePath.split('/').pop() || filePath,
      filePath: filePath,
      language: 'JavaScript',
    })

    // Find import statements for edge detection
    const importQuery = new Query(
      language,
      '(import_statement source: (string) @source)'
    )
    const importMatches = importQuery.matches(ast.rootNode)

    // Create import edges
    for (const match of importMatches) {
      const sourceNode = match.captures.find(c => c.name === 'source')?.node
      if (sourceNode) {
        const importPath = sourceNode.text.replace(/['"]/g, '')
        edges.push({
          sourceId: fileId,
          targetId: importPath, // Will be resolved later by InteractionAnalyzer
          type: 'IMPORTS',
        })
      }
    }

    // Express route detection (heuristic regex)
    const fileText = ast.rootNode.text
    const expressRouteRegex = /\b(app|router)\.(get|post|put|patch|delete)\s*\(\s*['"`]([^'"`]+)['"`]/g
    let r: RegExpExecArray | null
    while ((r = expressRouteRegex.exec(fileText)) !== null) {
      const method = r[2].toUpperCase()
      const routePath = r[3]
      nodes.push({
        id: createHash('sha1').update(`api-route:${method}:${routePath}:${filePath}`).digest('hex'),
        label: routePath,
        type: 'APIRoute',
        filePath,
        language: 'JavaScript',
        metadata: { framework: 'Express', httpMethod: method }
      })
    }

    // Next.js API routes: pages/api/* or app/api/*/route.js
    if (/\bpages\/api\//.test(filePath)) {
      const route = normalizeApiPath(filePath, 'pages/api')
      nodes.push({
        id: createHash('sha1').update(`api-route:ANY:${route}:${filePath}`).digest('hex'),
        label: route,
        type: 'APIRoute',
        filePath,
        language: 'JavaScript',
        metadata: { framework: 'Next.js' }
      })
    }
    if (/\bapp\/api\//.test(filePath) && /\/route\.(js|jsx)$/.test(filePath)) {
      const route = normalizeApiPath(filePath, 'app/api')
      // Detect exported HTTP method handlers
      const methods: string[] = []
      const exportMethodRegex = /export\s+(async\s+)?function\s+(GET|POST|PUT|PATCH|DELETE)\b/g
      let em: RegExpExecArray | null
      while ((em = exportMethodRegex.exec(fileText)) !== null) {
        methods.push(em[2])
      }
      const uniq = methods.length ? Array.from(new Set(methods)) : ['ANY']
      for (const mth of uniq) {
        nodes.push({
          id: createHash('sha1').update(`api-route:${mth}:${route}:${filePath}`).digest('hex'),
          label: route,
          type: 'APIRoute',
          filePath,
          language: 'JavaScript',
          metadata: { framework: 'Next.js', httpMethod: mth }
        })
      }
    }

    return { nodes, edges }
  }
}

function normalizeApiPath(filePath: string, baseDir: string): string {
  const idx = filePath.indexOf(baseDir + '/')
  if (idx === -1) return '/api'
  let rest = filePath.slice(idx + baseDir.length + 1)
  rest = rest.replace(/\/route\.(ts|tsx|js|jsx)$/, '')
  rest = rest.replace(/\.(ts|tsx|js|jsx)$/, '')
  if (!rest.startsWith('/')) rest = '/' + rest
  return rest
} 
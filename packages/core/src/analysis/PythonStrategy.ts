import { Tree, Query, Language } from 'tree-sitter'
import { IAnalysisStrategy } from './IAnalysisStrategy'
import { Node, Edge } from '../types'
import { createHash } from 'crypto'

export class PythonStrategy implements IAnalysisStrategy {
  analyze(ast: Tree, filePath: string, language: Language): { nodes: Node[]; edges: Edge[] } {
    const nodes: Node[] = []
    const edges: Edge[] = []

    const fileText = ast.rootNode.text

    // Create a file node for this Python file
    const fileId = createHash('sha1').update(`file:${filePath}`).digest('hex')
    nodes.push({ id: fileId, type: 'File', label: filePath.split('/').pop() || filePath, filePath, language: 'Python' })

    // IMPORT edges from import statements
    try {
      const importQuery = new Query(language, '(import_statement name: (dotted_name) @module)')
      const fromImportQuery = new Query(language, '(import_from_statement module_name: (dotted_name) @module)')
      for (const m of [...importQuery.matches(ast.rootNode), ...fromImportQuery.matches(ast.rootNode)]) {
        const mod = m.captures.find(c => c.name === 'module')?.node?.text
        if (mod) edges.push({ sourceId: fileId, targetId: mod, type: 'IMPORTS' })
      }
    } catch {}

    // Standard functions
    const functionQuery = new Query(language, `(function_definition name: (identifier) @name)`)
    const functionMatches = functionQuery.matches(ast.rootNode)
    for (const match of functionMatches) {
      const nameNode = match.captures.find(c => c.name === 'name')?.node
      if (nameNode) {
        nodes.push({
          id: createHash('sha1').update(`function:${nameNode.text}:${filePath}`).digest('hex'),
          label: nameNode.text,
          type: 'Function',
          filePath: filePath,
          language: 'Python',
        })
      }
    }

    // Flask routes (decorators)
    const apiRouteQuery = new Query(language, `
      (decorated_definition
        (decorator (call
          (argument_list (string) @route)
        ))
        (function_definition name: (identifier) @handler)
      )
    `)
    const apiRouteMatches = apiRouteQuery.matches(ast.rootNode)
    for (const match of apiRouteMatches) {
      const handlerNode = match.captures.find(c => c.name === 'handler')?.node
      const routeNode = match.captures.find(c => c.name === 'route')?.node
      if (handlerNode && routeNode) {
        nodes.push({
          id: createHash('sha1').update(`api-route:${handlerNode.text}:${filePath}`).digest('hex'),
          label: routeNode.text.replace(/['"]/g, ''),
          type: 'APIRoute',
          filePath: filePath,
          language: 'Python',
          metadata: { handlerFunction: handlerNode.text }
        })
      }
    }

    // FastAPI routes
    const fastApiRegex = /\b(app|router)\.(get|post|put|patch|delete)\s*\(\s*['"`]([^'"`]+)['"`]/g
    let m: RegExpExecArray | null
    while ((m = fastApiRegex.exec(fileText)) !== null) {
      const method = m[2].toUpperCase()
      const route = m[3]
      nodes.push({
        id: createHash('sha1').update(`api-route:${method}:${route}:${filePath}`).digest('hex'),
        label: route,
        type: 'APIRoute',
        filePath,
        language: 'Python',
        metadata: { framework: 'FastAPI', httpMethod: method }
      })
    }

    // Django urls.py
    if (filePath.endsWith('urls.py') || /from\s+django\.urls\s+import\s+path/.test(fileText)) {
      const djangoPathRegex = /path\(\s*['"`]([^'"`]+)['"`]/g
      while ((m = djangoPathRegex.exec(fileText)) !== null) {
        const route = m[1].startsWith('/') ? m[1] : `/${m[1]}`
        nodes.push({
          id: createHash('sha1').update(`api-route:GET:${route}:${filePath}`).digest('hex'),
          label: route,
          type: 'APIRoute',
          filePath,
          language: 'Python',
          metadata: { framework: 'Django' }
        })
      }
    }

    // Django REST Framework: router.register('users', UserViewSet)
    const drfRouterRegex = /router\.register\(\s*['"`]([^'"`]+)['"`]\s*,\s*([A-Za-z_][A-Za-z0-9_]*)/g
    while ((m = drfRouterRegex.exec(fileText)) !== null) {
      const base = m[1]
      const route = base.startsWith('/') ? base : `/${base}`
      nodes.push({
        id: createHash('sha1').update(`api-route:ANY:${route}:${filePath}`).digest('hex'),
        label: route,
        type: 'APIRoute',
        filePath,
        language: 'Python',
        metadata: { framework: 'Django REST Framework' }
      })
    }

    // DRF ViewSet classes
    const viewsetRegex = /class\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(([^)]*ViewSet[^)]*)\)\s*:/g
    while ((m = viewsetRegex.exec(fileText)) !== null) {
      const cls = m[1]
      nodes.push({
        id: createHash('sha1').update(`drf-viewset:${cls}:${filePath}`).digest('hex'),
        label: cls,
        type: 'Component',
        filePath,
        language: 'Python',
        metadata: { framework: 'Django REST Framework', componentType: 'ViewSet' }
      })
    }

    return { nodes, edges }
  }

  private detectDjangoImports(ast: Tree, language: Language): boolean {
    const importQuery = new Query(language, '(import_statement name: (dotted_name) @module)')
    const fromImportQuery = new Query(language, '(import_from_statement module_name: (dotted_name) @module)')
    
    const allMatches = [
      ...importQuery.matches(ast.rootNode),
      ...fromImportQuery.matches(ast.rootNode)
    ]

    for (const match of allMatches) {
      const moduleNode = match.captures.find(c => c.name === 'module')?.node
      if (moduleNode) {
        const moduleName = moduleNode.text
        if (moduleName.startsWith('django') || moduleName === 'rest_framework') {
          return true
        }
      }
    }
    return false
  }
}
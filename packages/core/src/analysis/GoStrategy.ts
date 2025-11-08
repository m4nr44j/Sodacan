import { Tree, Query, Language } from 'tree-sitter'
import { IAnalysisStrategy } from './IAnalysisStrategy'
import { Node, Edge } from '../types'
import { createHash } from 'crypto'

export class GoStrategy implements IAnalysisStrategy {
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
          language: 'Go',
          codeSnippet: nameNode.parent?.text,
        })
      }
    }

    // Find method declarations (functions with receivers)
    const methodQuery = new Query(
      language,
      '(method_declaration name: (field_identifier) @name)'
    )
    const methodMatches = methodQuery.matches(ast.rootNode)

    for (const match of methodMatches) {
      const nameNode = match.captures.find(c => c.name === 'name')?.node
      if (nameNode) {
        nodes.push({
          id: createHash('sha1')
            .update(`method:${nameNode.text}:${filePath}`)
            .digest('hex'),
          label: nameNode.text,
          type: 'Function',
          filePath: filePath,
          language: 'Go',
          codeSnippet: nameNode.parent?.text,
          metadata: { type: 'method' }
        })
      }
    }

    // Find struct declarations
    const structQuery = new Query(
      language,
      '(type_declaration (type_spec name: (type_identifier) @name type: (struct_type)))'
    )
    const structMatches = structQuery.matches(ast.rootNode)

    for (const match of structMatches) {
      const nameNode = match.captures.find(c => c.name === 'name')?.node
      if (nameNode) {
        nodes.push({
          id: createHash('sha1')
            .update(`struct:${nameNode.text}:${filePath}`)
            .digest('hex'),
          label: nameNode.text,
          type: 'Class',
          filePath: filePath,
          language: 'Go',
          codeSnippet: nameNode.parent?.parent?.text,
          metadata: { type: 'struct' }
        })
      }
    }

    // Find interface declarations
    const interfaceQuery = new Query(
      language,
      '(type_declaration (type_spec name: (type_identifier) @name type: (interface_type)))'
    )
    const interfaceMatches = interfaceQuery.matches(ast.rootNode)

    for (const match of interfaceMatches) {
      const nameNode = match.captures.find(c => c.name === 'name')?.node
      if (nameNode) {
        nodes.push({
          id: createHash('sha1')
            .update(`interface:${nameNode.text}:${filePath}`)
            .digest('hex'),
          label: nameNode.text,
          type: 'Class',
          filePath: filePath,
          language: 'Go',
          codeSnippet: nameNode.parent?.parent?.text,
          metadata: { type: 'interface' }
        })
      }
    }

    // Heuristic framework route detection via regex on source text
    const fileText = ast.rootNode.text

    // Gin: router.GET("/path"), router.POST(...)
    const ginRegex = /\b([a-zA-Z_][a-zA-Z0-9_]*)\.(GET|POST|PUT|PATCH|DELETE)\s*\(\s*\"([^\"]+)\"/g
    let mr: RegExpExecArray | null
    while ((mr = ginRegex.exec(fileText)) !== null) {
      const method = mr[2]
      const route = mr[3]
      nodes.push({
        id: createHash('sha1').update(`api-route:${method}:${route}:${filePath}`).digest('hex'),
        label: route,
        type: 'APIRoute',
        filePath,
        language: 'Go',
        metadata: { framework: 'Gin', httpMethod: method }
      })
    }

    // Echo: e.GET("/path", handler)
    const echoRegex = /\b([a-zA-Z_][a-zA-Z0-9_]*)\.(GET|POST|PUT|PATCH|DELETE)\s*\(\s*\"([^\"]+)\"/g
    while ((mr = echoRegex.exec(fileText)) !== null) {
      const method = mr[2]
      const route = mr[3]
      nodes.push({
        id: createHash('sha1').update(`api-route:${method}:${route}:${filePath}`).digest('hex'),
        label: route,
        type: 'APIRoute',
        filePath,
        language: 'Go',
        metadata: { framework: 'Echo', httpMethod: method }
      })
    }

    // Fiber: app.Get("/path", ...)
    const fiberRegex = /\b([a-zA-Z_][a-zA-Z0-9_]*)\.(Get|Post|Put|Patch|Delete)\s*\(\s*\"([^\"]+)\"/g
    while ((mr = fiberRegex.exec(fileText)) !== null) {
      const method = mr[2].toUpperCase()
      const route = mr[3]
      nodes.push({
        id: createHash('sha1').update(`api-route:${method}:${route}:${filePath}`).digest('hex'),
        label: route,
        type: 'APIRoute',
        filePath,
        language: 'Go',
        metadata: { framework: 'Fiber', httpMethod: method }
      })
    }

    // Chi: r.Get("/path", ...)
    const chiRegex = /\b([a-zA-Z_][a-zA-Z0-9_]*)\.(Get|Post|Put|Patch|Delete)\s*\(\s*\"([^\"]+)\"/g
    while ((mr = chiRegex.exec(fileText)) !== null) {
      const method = mr[2].toUpperCase()
      const route = mr[3]
      nodes.push({
        id: createHash('sha1').update(`api-route:${method}:${route}:${filePath}`).digest('hex'),
        label: route,
        type: 'APIRoute',
        filePath,
        language: 'Go',
        metadata: { framework: 'Chi', httpMethod: method }
      })
    }

    // Find HTTP handlers (common Go web pattern)
    const httpHandlerQuery = new Query(
      language,
      `(function_declaration 
         name: (identifier) @name
         parameters: (parameter_list
           (parameter_declaration
             type: (qualified_type
               package: (package_identifier) @pkg
               name: (type_identifier) @type
             )
           )
         )
       )`
    )
    const httpMatches = httpHandlerQuery.matches(ast.rootNode)

    for (const match of httpMatches) {
      const nameNode = match.captures.find(c => c.name === 'name')?.node
      const pkgNode = match.captures.find(c => c.name === 'pkg')?.node
      const typeNode = match.captures.find(c => c.name === 'type')?.node

      if (nameNode && pkgNode && typeNode) {
        if (pkgNode.text === 'http' && typeNode.text === 'ResponseWriter') {
          nodes.push({
            id: createHash('sha1')
              .update(`http-handler:${nameNode.text}:${filePath}`)
              .digest('hex'),
            label: nameNode.text,
            type: 'APIRoute',
            filePath: filePath,
            language: 'Go',
            metadata: { 
              handlerFunction: nameNode.text,
              type: 'http-handler'
            }
          })
        }
      }
    }

    // Find import statements
    const importQuery = new Query(
      language,
      '(import_spec path: (interpreted_string_literal) @path)'
    )
    const importMatches = importQuery.matches(ast.rootNode)

    // Create a file node for this Go file
    const fileId = createHash('sha1').update(`file:${filePath}`).digest('hex')
    nodes.push({
      id: fileId,
      type: 'File',
      label: filePath.split('/').pop() || filePath,
      filePath: filePath,
      language: 'Go',
    })

    // Create import edges
    for (const match of importMatches) {
      const pathNode = match.captures.find(c => c.name === 'path')?.node
      if (pathNode) {
        const importPath = pathNode.text.replace(/"/g, '')
        edges.push({
          sourceId: fileId,
          targetId: importPath, // Will be resolved later by InteractionAnalyzer
          type: 'IMPORTS',
        })
      }
    }

    return { nodes, edges }
  }
} 
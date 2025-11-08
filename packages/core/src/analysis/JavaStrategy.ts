import { Tree, Query, Language } from 'tree-sitter'
import { IAnalysisStrategy } from './IAnalysisStrategy'
import { Node, Edge } from '../types'
import { createHash } from 'crypto'

export class JavaStrategy implements IAnalysisStrategy {
  analyze(ast: Tree, filePath: string, language: Language): { nodes: Node[]; edges: Edge[] } {
    const nodes: Node[] = []
    const edges: Edge[] = []

    // Find method declarations
    const methodQuery = new Query(
      language,
      '(method_declaration name: (identifier) @name)'
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
          language: 'Java',
          codeSnippet: nameNode.parent?.text,
        })
      }
    }

    // Find class declarations
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
          language: 'Java',
          codeSnippet: nameNode.parent?.text,
        })
      }
    }

    // Find interface declarations
    const interfaceQuery = new Query(
      language,
      '(interface_declaration name: (identifier) @name)'
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
          type: 'Class', // Using 'Class' type for interfaces as well
          filePath: filePath,
          language: 'Java',
          codeSnippet: nameNode.parent?.text,
          metadata: { type: 'interface' }
        })
      }
    }

    // Find Spring Boot REST endpoints (common Java web pattern)
    const restEndpointQuery = new Query(
      language,
      `(method_declaration
         (modifiers
           (annotation
             name: (identifier) @annotation
             arguments: (annotation_argument_list
               (string_literal) @path
             )
           )
         )
         name: (identifier) @handler
       )`
    )
    const restMatches = restEndpointQuery.matches(ast.rootNode)

    for (const match of restMatches) {
      const annotationNode = match.captures.find(c => c.name === 'annotation')?.node
      const pathNode = match.captures.find(c => c.name === 'path')?.node
      const handlerNode = match.captures.find(c => c.name === 'handler')?.node

      if (annotationNode && pathNode && handlerNode) {
        const annotation = annotationNode.text
        // Check if it's a REST mapping annotation
        if (['RequestMapping', 'GetMapping', 'PostMapping', 'PutMapping', 'DeleteMapping'].includes(annotation)) {
          nodes.push({
            id: createHash('sha1')
              .update(`api-route:${handlerNode.text}:${filePath}`)
              .digest('hex'),
            label: pathNode.text.replace(/"/g, ''),
            type: 'APIRoute',
            filePath: filePath,
            language: 'Java',
            metadata: {
              handlerMethod: handlerNode.text,
              httpMethod: annotation.replace('Mapping', '').toUpperCase()
            }
          })
        }
      }
    }

    // Find import statements
    const importQuery = new Query(
      language,
      '(import_declaration (scoped_identifier) @import)'
    )
    const importMatches = importQuery.matches(ast.rootNode)

    // Create a file node for this Java file
    const fileId = createHash('sha1').update(`file:${filePath}`).digest('hex')
    nodes.push({
      id: fileId,
      type: 'File',
      label: filePath.split('/').pop() || filePath,
      filePath: filePath,
      language: 'Java',
    })

    // Create import edges
    for (const match of importMatches) {
      const importNode = match.captures.find(c => c.name === 'import')?.node
      if (importNode) {
        edges.push({
          sourceId: fileId,
          targetId: importNode.text, // Will be resolved later by InteractionAnalyzer
          type: 'IMPORTS',
        })
      }
    }

    return { nodes, edges }
  }
} 
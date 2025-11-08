import { Tree, Query, Language } from 'tree-sitter'
import { IAnalysisStrategy } from './IAnalysisStrategy'
import { Node, Edge } from '../types'
import { createHash } from 'crypto'

export class CSharpStrategy implements IAnalysisStrategy {
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
          language: 'CSharp',
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
          language: 'CSharp',
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
          type: 'Class',
          filePath: filePath,
          language: 'CSharp',
          codeSnippet: nameNode.parent?.text,
          metadata: { type: 'interface' }
        })
      }
    }

    // Find property declarations
    const propertyQuery = new Query(
      language,
      '(property_declaration name: (identifier) @name)'
    )
    const propertyMatches = propertyQuery.matches(ast.rootNode)

    for (const match of propertyMatches) {
      const nameNode = match.captures.find(c => c.name === 'name')?.node
      if (nameNode) {
        nodes.push({
          id: createHash('sha1')
            .update(`property:${nameNode.text}:${filePath}`)
            .digest('hex'),
          label: nameNode.text,
          type: 'Function',
          filePath: filePath,
          language: 'CSharp',
          codeSnippet: nameNode.parent?.text,
          metadata: { type: 'property' }
        })
      }
    }

    // ASP.NET Core attributes and minimal APIs (regex heuristics)
    const fileText = ast.rootNode.text
    const attrRegex = /\[(HttpGet|HttpPost|HttpPut|HttpPatch|HttpDelete)(?:\(\s*"([^"]+)"\s*\))?\]/g
    let am: RegExpExecArray | null
    while ((am = attrRegex.exec(fileText)) !== null) {
      const method = am[1].replace('Http','').toUpperCase()
      const route = am[2] || ''
      nodes.push({
        id: createHash('sha1').update(`api-route:${method}:${route}:${filePath}`).digest('hex'),
        label: route || '/',
        type: 'APIRoute',
        filePath,
        language: 'CSharp',
        metadata: { framework: 'ASP.NET Core', httpMethod: method }
      })
    }

    const minimalRegex = /\b(MapGet|MapPost|MapPut|MapPatch|MapDelete)\s*\(\s*"([^"]+)"/g
    while ((am = minimalRegex.exec(fileText)) !== null) {
      const method = am[1].replace('Map','').toUpperCase()
      const route = am[2]
      nodes.push({
        id: createHash('sha1').update(`api-route:${method}:${route}:${filePath}`).digest('hex'),
        label: route,
        type: 'APIRoute',
        filePath,
        language: 'CSharp',
        metadata: { framework: 'ASP.NET Core', httpMethod: method }
      })
    }

    // Find namespace declarations
    const namespaceQuery = new Query(
      language,
      '(namespace_declaration name: (qualified_name) @name)'
    )
    const namespaceMatches = namespaceQuery.matches(ast.rootNode)

    for (const match of namespaceMatches) {
      const nameNode = match.captures.find(c => c.name === 'name')?.node
      if (nameNode) {
        nodes.push({
          id: createHash('sha1')
            .update(`namespace:${nameNode.text}:${filePath}`)
            .digest('hex'),
          label: nameNode.text,
          type: 'Component',
          filePath: filePath,
          language: 'CSharp',
          codeSnippet: nameNode.parent?.text,
          metadata: { type: 'namespace' }
        })
      }
    }

    // Find using statements
    const usingQuery = new Query(
      language,
      '(using_directive (qualified_name) @namespace)'
    )
    const usingMatches = usingQuery.matches(ast.rootNode)

    // Create a file node for this C# file
    const fileId = createHash('sha1').update(`file:${filePath}`).digest('hex')
    nodes.push({
      id: fileId,
      type: 'File',
      label: filePath.split('/').pop() || filePath,
      filePath: filePath,
      language: 'CSharp',
    })

    // Create using edges
    for (const match of usingMatches) {
      const namespaceNode = match.captures.find(c => c.name === 'namespace')?.node
      if (namespaceNode) {
        edges.push({
          sourceId: fileId,
          targetId: namespaceNode.text,
          type: 'IMPORTS',
        })
      }
    }

    return { nodes, edges }
  }
} 
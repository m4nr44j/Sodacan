import { Tree, Query, Language } from 'tree-sitter'
import { IAnalysisStrategy } from './IAnalysisStrategy'
import { Node, Edge } from '../types'
import { createHash } from 'crypto'

export class CPPStrategy implements IAnalysisStrategy {
  analyze(ast: Tree, filePath: string, language: Language): { nodes: Node[]; edges: Edge[] } {
    const nodes: Node[] = []
    const edges: Edge[] = []

    // Find function definitions
    const functionQuery = new Query(
      language,
      '(function_definition declarator: (function_declarator declarator: (identifier) @name))'
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
          language: 'CPP',
          codeSnippet: nameNode.parent?.parent?.parent?.text,
        })
      }
    }

    // Find class declarations
    const classQuery = new Query(
      language,
      '(class_specifier name: (type_identifier) @name)'
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
          language: 'CPP',
          codeSnippet: nameNode.parent?.text,
        })
      }
    }

    // Find struct declarations
    const structQuery = new Query(
      language,
      '(struct_specifier name: (type_identifier) @name)'
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
          language: 'CPP',
          codeSnippet: nameNode.parent?.text,
          metadata: { type: 'struct' }
        })
      }
    }

    // Find namespace declarations - simplified query
    const namespaceQuery = new Query(
      language,
      '(namespace_definition) @namespace'
    )
    const namespaceMatches = namespaceQuery.matches(ast.rootNode)

    for (const match of namespaceMatches) {
      const namespaceNode = match.captures.find(c => c.name === 'namespace')?.node
      if (namespaceNode) {
        // Extract namespace name from the text
        const nameMatch = namespaceNode.text.match(/namespace\s+([a-zA-Z_][a-zA-Z0-9_]*)/);
        const nameText = nameMatch ? nameMatch[1] : 'unnamed-namespace'
        
        nodes.push({
          id: createHash('sha1')
            .update(`namespace:${nameText}:${filePath}`)
            .digest('hex'),
          label: nameText,
          type: 'Component',
          filePath: filePath,
          language: 'CPP',
          codeSnippet: namespaceNode.text,
          metadata: { type: 'namespace' }
        })
      }
    }

    // Find template declarations - simplified query
    const templateQuery = new Query(
      language,
      '(template_declaration) @template'
    )
    const templateMatches = templateQuery.matches(ast.rootNode)

    for (const match of templateMatches) {
      const templateNode = match.captures.find(c => c.name === 'template')?.node
      if (templateNode) {
        // Extract template name from the text
        const nameMatch = templateNode.text.match(/(?:class|struct)\s+([a-zA-Z_][a-zA-Z0-9_]*)/);
        const nameText = nameMatch ? nameMatch[1] : 'unnamed-template'
        
        nodes.push({
          id: createHash('sha1')
            .update(`template:${nameText}:${filePath}`)
            .digest('hex'),
          label: nameText,
          type: 'Class',
          filePath: filePath,
          language: 'CPP',
          codeSnippet: templateNode.text,
          metadata: { type: 'template' }
        })
      }
    }

    // Find #include statements
    const includeQuery = new Query(
      language,
      '(preproc_include path: (string_literal) @include_path)'
    )
    const includeMatches = includeQuery.matches(ast.rootNode)

    // Also find #include with system headers
    const systemIncludeQuery = new Query(
      language,
      '(preproc_include path: (system_lib_string) @include_path)'
    )
    const systemIncludeMatches = systemIncludeQuery.matches(ast.rootNode)

    // Create a file node for this C++ file
    const fileId = createHash('sha1').update(`file:${filePath}`).digest('hex')
    nodes.push({
      id: fileId,
      type: 'File',
      label: filePath.split('/').pop() || filePath,
      filePath: filePath,
      language: 'CPP',
    })

    // Create include edges
    for (const match of [...includeMatches, ...systemIncludeMatches]) {
      const includeNode = match.captures.find(c => c.name === 'include_path')?.node
      if (includeNode) {
        const includePath = includeNode.text.replace(/['"<>]/g, '')
        edges.push({
          sourceId: fileId,
          targetId: includePath,
          type: 'IMPORTS',
        })
      }
    }

    return { nodes, edges }
  }
} 
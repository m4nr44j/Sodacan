import { Tree, Query, Language } from 'tree-sitter'
import { IAnalysisStrategy } from './IAnalysisStrategy'
import { Node, Edge } from '../types'
import { createHash } from 'crypto'

export class RustStrategy implements IAnalysisStrategy {
  analyze(ast: Tree, filePath: string, language: Language): { nodes: Node[]; edges: Edge[] } {
    const nodes: Node[] = []
    const edges: Edge[] = []

    // Find function definitions
    const functionQuery = new Query(
      language,
      '(function_item name: (identifier) @name)'
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
          language: 'Rust',
          codeSnippet: nameNode.parent?.text,
        })
      }
    }

    // Find struct definitions
    const structQuery = new Query(
      language,
      '(struct_item name: (type_identifier) @name)'
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
          language: 'Rust',
          codeSnippet: nameNode.parent?.text,
          metadata: { type: 'struct' }
        })
      }
    }

    // Find enum definitions
    const enumQuery = new Query(
      language,
      '(enum_item name: (type_identifier) @name)'
    )
    const enumMatches = enumQuery.matches(ast.rootNode)

    for (const match of enumMatches) {
      const nameNode = match.captures.find(c => c.name === 'name')?.node
      if (nameNode) {
        nodes.push({
          id: createHash('sha1')
            .update(`enum:${nameNode.text}:${filePath}`)
            .digest('hex'),
          label: nameNode.text,
          type: 'Class',
          filePath: filePath,
          language: 'Rust',
          codeSnippet: nameNode.parent?.text,
          metadata: { type: 'enum' }
        })
      }
    }

    // Find trait definitions
    const traitQuery = new Query(
      language,
      '(trait_item name: (type_identifier) @name)'
    )
    const traitMatches = traitQuery.matches(ast.rootNode)

    for (const match of traitMatches) {
      const nameNode = match.captures.find(c => c.name === 'name')?.node
      if (nameNode) {
        nodes.push({
          id: createHash('sha1')
            .update(`trait:${nameNode.text}:${filePath}`)
            .digest('hex'),
          label: nameNode.text,
          type: 'Class',
          filePath: filePath,
          language: 'Rust',
          codeSnippet: nameNode.parent?.text,
          metadata: { type: 'trait' }
        })
      }
    }

    // Find impl blocks
    const implQuery = new Query(
      language,
      '(impl_item type: (type_identifier) @type_name)'
    )
    const implMatches = implQuery.matches(ast.rootNode)

    for (const match of implMatches) {
      const typeNode = match.captures.find(c => c.name === 'type_name')?.node
      if (typeNode) {
        nodes.push({
          id: createHash('sha1')
            .update(`impl:${typeNode.text}:${filePath}`)
            .digest('hex'),
          label: `impl ${typeNode.text}`,
          type: 'Component',
          filePath: filePath,
          language: 'Rust',
          codeSnippet: typeNode.parent?.text,
          metadata: { type: 'impl-block' }
        })
      }
    }

    // Find module declarations
    const moduleQuery = new Query(
      language,
      '(mod_item name: (identifier) @name)'
    )
    const moduleMatches = moduleQuery.matches(ast.rootNode)

    for (const match of moduleMatches) {
      const nameNode = match.captures.find(c => c.name === 'name')?.node
      if (nameNode) {
        nodes.push({
          id: createHash('sha1')
            .update(`module:${nameNode.text}:${filePath}`)
            .digest('hex'),
          label: nameNode.text,
          type: 'Component',
          filePath: filePath,
          language: 'Rust',
          codeSnippet: nameNode.parent?.text,
          metadata: { type: 'module' }
        })
      }
    }

    // Find macro definitions
    const macroQuery = new Query(
      language,
      '(macro_definition name: (identifier) @name)'
    )
    const macroMatches = macroQuery.matches(ast.rootNode)

    for (const match of macroMatches) {
      const nameNode = match.captures.find(c => c.name === 'name')?.node
      if (nameNode) {
        nodes.push({
          id: createHash('sha1')
            .update(`macro:${nameNode.text}:${filePath}`)
            .digest('hex'),
          label: `${nameNode.text}!`,
          type: 'Function',
          filePath: filePath,
          language: 'Rust',
          codeSnippet: nameNode.parent?.text,
          metadata: { type: 'macro' }
        })
      }
    }

    // Find use statements
    const useQuery = new Query(
      language,
      '(use_declaration argument: (scoped_identifier) @module)'
    )
    const useMatches = useQuery.matches(ast.rootNode)

    // Also find simple use statements
    const simpleUseQuery = new Query(
      language,
      '(use_declaration argument: (identifier) @module)'
    )
    const simpleUseMatches = simpleUseQuery.matches(ast.rootNode)

    // Create a file node for this Rust file
    const fileId = createHash('sha1').update(`file:${filePath}`).digest('hex')
    nodes.push({
      id: fileId,
      type: 'File',
      label: filePath.split('/').pop() || filePath,
      filePath: filePath,
      language: 'Rust',
    })

    // Create use edges
    for (const match of [...useMatches, ...simpleUseMatches]) {
      const moduleNode = match.captures.find(c => c.name === 'module')?.node
      if (moduleNode) {
        edges.push({
          sourceId: fileId,
          targetId: moduleNode.text,
          type: 'IMPORTS',
        })
      }
    }

    return { nodes, edges }
  }
} 
import { Tree, Query, Language } from 'tree-sitter'
import { IAnalysisStrategy } from './IAnalysisStrategy'
import { Node, Edge } from '../types'
import { createHash } from 'crypto'

export class CSSStrategy implements IAnalysisStrategy {
  analyze(ast: Tree, filePath: string, language: Language): { nodes: Node[]; edges: Edge[] } {
    const nodes: Node[] = []
    const edges: Edge[] = []

    // Find class selectors
    const classQuery = new Query(
      language,
      '(class_selector (class_name) @class)'
    )
    const classMatches = classQuery.matches(ast.rootNode)

    for (const match of classMatches) {
      const classNode = match.captures.find(c => c.name === 'class')?.node
      if (classNode) {
        nodes.push({
          id: createHash('sha1')
            .update(`css-class:${classNode.text}:${filePath}`)
            .digest('hex'),
          label: `.${classNode.text}`,
          type: 'Class',
          filePath: filePath,
          language: 'CSS',
          codeSnippet: classNode.parent?.parent?.text, // Include the full rule
          metadata: { type: 'css-class' }
        })
      }
    }

    // Find ID selectors
    const idQuery = new Query(
      language,
      '(id_selector (id_name) @id)'
    )
    const idMatches = idQuery.matches(ast.rootNode)

    for (const match of idMatches) {
      const idNode = match.captures.find(c => c.name === 'id')?.node
      if (idNode) {
        nodes.push({
          id: createHash('sha1')
            .update(`css-id:${idNode.text}:${filePath}`)
            .digest('hex'),
          label: `#${idNode.text}`,
          type: 'Component',
          filePath: filePath,
          language: 'CSS',
          codeSnippet: idNode.parent?.parent?.text,
          metadata: { type: 'css-id' }
        })
      }
    }

    // Find CSS custom properties (variables)
    const customPropertyQuery = new Query(
      language,
      '(declaration (property_name) @prop (#match? @prop "--.*"))'
    )
    const customPropertyMatches = customPropertyQuery.matches(ast.rootNode)

    for (const match of customPropertyMatches) {
      const propNode = match.captures.find(c => c.name === 'prop')?.node
      if (propNode) {
        nodes.push({
          id: createHash('sha1')
            .update(`css-var:${propNode.text}:${filePath}`)
            .digest('hex'),
          label: propNode.text,
          type: 'Function', // Using 'Function' type for CSS variables
          filePath: filePath,
          language: 'CSS',
          codeSnippet: propNode.parent?.text,
          metadata: { type: 'css-variable' }
        })
      }
    }

    // Find @import statements
    const importQuery = new Query(
      language,
      '(import_statement (string_value) @import_path)'
    )
    const importMatches = importQuery.matches(ast.rootNode)

    // Find @media rules - simplified query
    const mediaQuery = new Query(
      language,
      '(at_rule) @media_rule'
    )
    const mediaMatches = mediaQuery.matches(ast.rootNode)

    for (const match of mediaMatches) {
      const mediaNode = match.captures.find(c => c.name === 'media_rule')?.node
      if (mediaNode && mediaNode.text.startsWith('@media')) {
        nodes.push({
          id: createHash('sha1')
            .update(`media-query:${mediaNode.text}:${filePath}`)
            .digest('hex'),
          label: mediaNode.text.split('{')[0].trim(),
          type: 'Component',
          filePath: filePath,
          language: 'CSS',
          codeSnippet: mediaNode.text,
          metadata: { type: 'media-query' }
        })
      }
    }

    // Find keyframe animations - simplified query
    const keyframesQuery = new Query(
      language,
      '(at_rule) @keyframes_rule'
    )
    const keyframesMatches = keyframesQuery.matches(ast.rootNode)

    for (const match of keyframesMatches) {
      const keyframesNode = match.captures.find(c => c.name === 'keyframes_rule')?.node
      if (keyframesNode && keyframesNode.text.includes('@keyframes')) {
        // Extract animation name from @keyframes rule
        const match_name = keyframesNode.text.match(/@keyframes\s+([a-zA-Z0-9_-]+)/)
        const animationName = match_name ? match_name[1] : 'unnamed-animation'
        
        nodes.push({
          id: createHash('sha1')
            .update(`keyframes:${animationName}:${filePath}`)
            .digest('hex'),
          label: animationName,
          type: 'Function',
          filePath: filePath,
          language: 'CSS',
          codeSnippet: keyframesNode.text,
          metadata: { type: 'keyframes' }
        })
      }
    }

    // Create a file node for this CSS file
    const fileId = createHash('sha1').update(`file:${filePath}`).digest('hex')
    nodes.push({
      id: fileId,
      type: 'File',
      label: filePath.split('/').pop() || filePath,
      filePath: filePath,
      language: 'CSS',
    })

    // Create import edges
    for (const match of importMatches) {
      const importNode = match.captures.find(c => c.name === 'import_path')?.node
      if (importNode) {
        const importPath = importNode.text.replace(/['"]/g, '')
        edges.push({
          sourceId: fileId,
          targetId: importPath,
          type: 'IMPORTS',
        })
      }
    }

    return { nodes, edges }
  }
} 
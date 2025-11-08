import { Tree, Query, Language } from 'tree-sitter'
import { IAnalysisStrategy } from './IAnalysisStrategy'
import { Node, Edge } from '../types'
import { createHash } from 'crypto'

export class HTMLStrategy implements IAnalysisStrategy {
	analyze(ast: Tree, filePath: string, language: Language): { nodes: Node[]; edges: Edge[] } {
		const nodes: Node[] = []
		const edges: Edge[] = []

		// Existing HTML detection for components/tags is out of scope; retain simple file node
		const fileId = createHash('sha1').update(`file:${filePath}`).digest('hex')
		nodes.push({ id: fileId, type: 'File', label: filePath.split('/').pop() || filePath, filePath, language: 'HTML' })
		return { nodes, edges }
	}
} 
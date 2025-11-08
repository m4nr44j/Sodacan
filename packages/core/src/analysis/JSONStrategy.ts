import { IAnalysisStrategy } from './IAnalysisStrategy'
import { Node, Edge } from '../types'
import { createHash } from 'crypto'

export class JSONStrategy implements IAnalysisStrategy {
	analyze(ast: any, filePath: string): { nodes: Node[]; edges: Edge[] } {
		const nodes: Node[] = []
		const edges: Edge[] = []
		const text: string = ast?.rootNode?.text || ''
		try {
			const obj = JSON.parse(text)
			// OpenAPI detection
			if (obj && (obj.openapi || obj.swagger) && obj.paths && typeof obj.paths === 'object') {
				for (const [route, methods] of Object.entries<any>(obj.paths)) {
					for (const method of Object.keys(methods)) {
						const httpMethod = method.toUpperCase()
						if (['GET','POST','PUT','PATCH','DELETE'].includes(httpMethod)) {
							nodes.push({
								id: createHash('sha1').update(`api-route:${httpMethod}:${route}:${filePath}`).digest('hex'),
								label: route,
								type: 'APIRoute',
								filePath,
								language: 'JSON',
								metadata: { framework: 'OpenAPI', httpMethod }
							})
						}
					}
				}
			}
		} catch {
			// ignore parse errors
		}
		const fileId = createHash('sha1').update(`file:${filePath}`).digest('hex')
		nodes.push({ id: fileId, type: 'File', label: filePath.split('/').pop() || filePath, filePath, language: 'JSON' })
		return { nodes, edges }
	}
} 
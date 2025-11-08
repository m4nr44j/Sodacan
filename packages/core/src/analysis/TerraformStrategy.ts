import { IAnalysisStrategy } from './IAnalysisStrategy'
import { Node, Edge } from '../types'
import { createHash } from 'crypto'

export class TerraformStrategy implements IAnalysisStrategy {
	analyze(ast: any, filePath: string): { nodes: Node[]; edges: Edge[] } {
		const nodes: Node[] = []
		const edges: Edge[] = []
		const text: string = ast?.rootNode?.text || ''

		// Provider blocks: provider "aws" {}
		const providerRegex = /provider\s+"([^"]+)"/g
		let m: RegExpExecArray | null
		while ((m = providerRegex.exec(text)) !== null) {
			const provider = m[1]
			nodes.push({
				id: createHash('sha1').update(`tf-provider:${provider}:${filePath}:${m.index}`).digest('hex'),
				label: `provider:${provider}`,
				type: 'Component',
				filePath,
				language: 'Terraform',
				metadata: { kind: 'provider', provider }
			})
		}

		// Resource blocks: resource "aws_s3_bucket" "name" { ... }
		const resourceRegex = /resource\s+"([^"]+)"\s+"([^"]+)"/g
		while ((m = resourceRegex.exec(text)) !== null) {
			const resourceType = m[1]
			const resourceName = m[2]
			nodes.push({
				id: createHash('sha1').update(`tf-resource:${resourceType}:${resourceName}:${filePath}:${m.index}`).digest('hex'),
				label: `${resourceType}.${resourceName}`,
				type: 'Component',
				filePath,
				language: 'Terraform',
				metadata: { kind: 'resource', resourceType, resourceName }
			})
		}

		// Module blocks: module "name" { source = "..." }
		const moduleRegex = /module\s+"([^"]+)"\s*\{[\s\S]*?source\s*=\s*"([^"]+)"[\s\S]*?\}/g
		while ((m = moduleRegex.exec(text)) !== null) {
			const moduleName = m[1]
			const source = m[2]
			const id = createHash('sha1').update(`tf-module:${moduleName}:${filePath}:${m.index}`).digest('hex')
			nodes.push({
				id,
				label: `module:${moduleName}`,
				type: 'Component',
				filePath,
				language: 'Terraform',
				metadata: { kind: 'module', source }
			})
			if (source.startsWith('.') || source.startsWith('/')) {
				edges.push({ sourceId: id, targetId: source, type: 'REFERENCES' })
			}
		}

		// File node
		const fileId = createHash('sha1').update(`file:${filePath}`).digest('hex')
		nodes.push({ id: fileId, type: 'File', label: filePath.split('/').pop() || filePath, filePath, language: 'Terraform' })

		return { nodes, edges }
	}
} 
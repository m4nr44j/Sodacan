import { Tree, Language } from 'tree-sitter'
import { IAnalysisStrategy } from './IAnalysisStrategy'
import { Node, Edge } from '../types'
import { createHash } from 'crypto'

export class YAMLStrategy implements IAnalysisStrategy {
  analyze(ast: Tree, filePath: string, language: Language): { nodes: Node[]; edges: Edge[] } {
    const nodes: Node[] = []
    const edges: Edge[] = []

    const text = ast.rootNode.text

    // Detect if this is a Kubernetes manifest by presence of apiVersion/kind
    const isK8s = /\bapiVersion:\s*[^\n]+\b[\s\S]*?\bkind:\s*\w+/i.test(text)

    // Detect OpenAPI by 'openapi:' root key
    const isOpenAPI = /^\s*openapi:\s*\d/m.test(text)

    // Detect Helm chart files
    const isHelmChart = /\bname:\s*.+/i.test(text) && filePath.endsWith('Chart.yaml')
    const isHelmTemplate = /templates\//.test(filePath)

    // Detect Kustomize kustomization
    const isKustomize = /\bkustomization\s*:/i.test(text) || filePath.toLowerCase().endsWith('kustomization.yaml')

    // Extract documents if multiple (--- separators)
    const docs = text.split(/\n---\s*/)

    if (isOpenAPI) {
      // Simple path extraction: look for lines under 'paths:' with method keys
      const pathBlocks = text.split(/\npaths:\s*/i)[1] || ''
      const pathRegex = /\n\s*\/(\S+):[\s\S]*?\n\s*(get|post|put|patch|delete):/gi
      let pm: RegExpExecArray | null
      while ((pm = pathRegex.exec(pathBlocks)) !== null) {
        const route = '/' + pm[1].replace(/:.*/, '')
        const method = pm[2].toUpperCase()
        nodes.push({
          id: createHash('sha1').update(`api-route:${method}:${route}:${filePath}`).digest('hex'),
          label: route,
          type: 'APIRoute',
          filePath,
          language: 'YAML',
          metadata: { framework: 'OpenAPI', httpMethod: method }
        })
      }
    }

    for (const doc of docs) {
      const kindMatch = /\bkind:\s*(\w+)/i.exec(doc)
      const nameMatch = /\bmetadata:\s*[\s\S]*?\bname:\s*['"]?([^\s'"\n]+)['"]?/i.exec(doc)
      const kind = kindMatch?.[1]

      // Helm chart doc
      if (isHelmChart) {
        nodes.push({
          id: createHash('sha1').update(`helm-chart:${filePath}`).digest('hex'),
          label: 'Helm Chart',
          type: 'Component',
          filePath,
          language: 'YAML',
          metadata: { platform: 'Helm' },
          codeSnippet: doc
        })
      }

      // Kustomize: capture resources list
      let resources: string[] | undefined = undefined
      if (isKustomize) {
        resources = []
        // Capture block under `resources:`
        const blockMatch = /resources:\s*([\s\S]*?)(?:\n\w|$)/i.exec(doc)
        if (blockMatch) {
          const block = blockMatch[1]
          const lineRegex = /^\s*-\s*([^\s#]+)\s*$/gim
          let lm: RegExpExecArray | null
          while ((lm = lineRegex.exec(block)) !== null) {
            resources.push(lm[1])
          }
        }
        // Fallback: any top-level `- path` under kustomization
        if (resources.length === 0) {
          const all = doc.match(/^\s*-\s*([^\s#]+)\s*$/gim) || []
          for (const ln of all) {
            const m = /-\s*([^\s#]+)/.exec(ln)
            if (m) resources.push(m[1])
          }
        }
        if (resources.length === 0) resources = undefined
      }

      if (!kind) continue

      const id = createHash('sha1').update(`kind:${kind}:${filePath}:${doc.length}`).digest('hex')
      const labels: Record<string,string> = {}
      const selectors: Record<string,string> = {}
      const images: string[] = []

      // Extract labels: metadata.labels and spec.template.metadata.labels
      const labelBlocks = doc.match(/labels:\s*[\s\S]*?(?=\n\w|$)/gi) || []
      for (const block of labelBlocks) {
        const kvRegex = /\n\s*([A-Za-z0-9_.-]+):\s*['"]?([^'"\n]+)['"]?/g
        let m: RegExpExecArray | null
        while ((m = kvRegex.exec(block)) !== null) {
          const k = m[1]
          const v = m[2]
          labels[k] = v
        }
      }

      // Extract selectors from spec.selector or spec.selector.matchLabels
      const selectorBlocks = doc.match(/selector:\s*[\s\S]*?(?=\n\w|$)/gi) || []
      for (const block of selectorBlocks) {
        const kvRegex = /\n\s*([A-Za-z0-9_.-]+):\s*['"]?([^'"\n]+)['"]?/g
        let m: RegExpExecArray | null
        while ((m = kvRegex.exec(block)) !== null) {
          const k = m[1]
          const v = m[2]
          selectors[k] = v
        }
      }

      // Extract container images
      const imageRegex = /\n\s*image:\s*['"]?([^'"\n]+)['"]?/gi
      let im: RegExpExecArray | null
      while ((im = imageRegex.exec(doc)) !== null) {
        images.push(im[1])
      }

      let platform: 'Kubernetes' | 'OpenAPI' | 'YAML' | 'Helm' | 'Kustomize' = 'YAML'
      if (isK8s) platform = 'Kubernetes'
      if (isOpenAPI) platform = 'OpenAPI'
      if (isHelmChart || isHelmTemplate) platform = 'Helm'
      if (isKustomize) platform = 'Kustomize'

      const metadata: Record<string, any> = { resourceKind: kind, platform }
      if (nameMatch?.[1]) metadata.resourceName = nameMatch[1]
      if (Object.keys(labels).length) metadata.labels = labels
      if (Object.keys(selectors).length) metadata.selectors = selectors
      if (images.length) metadata.images = images
      if (resources && resources.length) metadata.resources = resources

      nodes.push({
        id,
        label: kind,
        type: 'Component',
        filePath,
        language: 'YAML',
        metadata,
        codeSnippet: doc
      })
    }

    nodes.push({id:createHash('sha1').update(`file:${filePath}`).digest('hex'),type:'File',label:filePath.split('/').pop()||filePath,filePath,language:'YAML'})
    return {nodes,edges}
  }
} 
import path from 'path'
import fs from 'fs'
import { CodeMap, Edge, Node } from './types'

// Define a type for our interaction rules from the config
interface InteractionRule {
  type: 'API_CALL'
  frontend: { path: string; urlPrefix?: string }
  backend: { path: string }
}

export class InteractionAnalyzer {
  public resolveImportEdges(codeMap: CodeMap): CodeMap {
    // Create a lookup map for O(1) access
    const fileNodeByPath = new Map<string, Node>()
    for (const node of codeMap.nodes) {
      if (node.type === 'File') {
        fileNodeByPath.set(node.filePath, node)
      }
    }

    const importEdges = codeMap.edges.filter((edge) => edge.type === 'IMPORTS')

    // Load TS path aliases if present
    const tsPaths = this.loadTsPathAliases()

    // Precompute Java src roots
    const javaSrcRoots = this.findJavaSrcRoots(process.cwd())

    // Precompute Go module mappings (module->local path)
    const goModuleMap = this.loadGoModuleReplacements(process.cwd())

    // Process each import edge using the fast lookup map.
    for (const edge of importEdges) {
      const sourceNode = codeMap.nodes.find((n) => n.id === edge.sourceId)
      if (!sourceNode) continue

      const sourceDir = path.dirname(sourceNode.filePath)
      let targetPath: string | undefined
      let specifier = edge.targetId

      // Language-aware resolution
      const sourceFileNode = codeMap.nodes.find(n => n.type === 'File' && n.id === edge.sourceId)
      const sourceLang = sourceNode.language

      try {
        if (sourceLang === 'JavaScript' || sourceLang === 'TypeScript') {
          // TS/JS resolution (with tsconfig paths)
          const aliasResolved = this.applyTsPathAliases(specifier, tsPaths)
          if (aliasResolved) specifier = aliasResolved
          targetPath = require.resolve(path.resolve(sourceDir, specifier))
        } else if (sourceLang === 'Python') {
          targetPath = this.resolvePythonImport(specifier, sourceDir)
        } else if (sourceLang === 'Java') {
          targetPath = this.resolveJavaImport(specifier, javaSrcRoots)
        } else if (sourceLang === 'Go') {
          targetPath = this.resolveGoImport(specifier, goModuleMap)
        }
      } catch {
        // ignore
      }

      if (!targetPath) continue

      const targetNode = fileNodeByPath.get(targetPath)
      if (targetNode) {
        edge.targetId = targetNode.id
      }
    }

    return codeMap
  }

  private resolvePythonImport(moduleName: string, sourceDir: string): string | undefined {
    // Convert dotted module to path
    const rel = moduleName.replace(/\./g, '/')
    const candidates = [
      path.resolve(process.cwd(), rel + '.py'),
      path.resolve(process.cwd(), rel, '__init__.py'),
      path.resolve(sourceDir, rel + '.py'),
      path.resolve(sourceDir, rel, '__init__.py'),
    ]
    for (const c of candidates) if (fs.existsSync(c)) return c

    // venv detection
    const venvRoots = this.findVenvRoots(process.cwd())
    for (const root of venvRoots) {
      const site = this.findSitePackages(root)
      if (!site) continue
      const c1 = path.join(site, rel + '.py')
      const c2 = path.join(site, rel, '__init__.py')
      if (fs.existsSync(c1)) return c1
      if (fs.existsSync(c2)) return c2
    }
    return undefined
  }

  private findVenvRoots(root: string): string[] {
    const names = ['.venv', 'venv', 'env']
    const found: string[] = []
    for (const n of names) {
      const p = path.resolve(root, n)
      if (fs.existsSync(p)) found.push(p)
    }
    if (process.env.VIRTUAL_ENV) found.push(process.env.VIRTUAL_ENV)
    return found
  }

  private findSitePackages(venvRoot: string): string | undefined {
    const libDir = path.join(venvRoot, 'lib')
    if (!fs.existsSync(libDir)) return undefined
    const entries = fs.readdirSync(libDir)
    for (const e of entries) {
      if (e.startsWith('python')) {
        const sp = path.join(libDir, e, 'site-packages')
        if (fs.existsSync(sp)) return sp
      }
    }
    return undefined
  }

  private findJavaSrcRoots(projectRoot: string): string[] {
    const roots: string[] = []
    const common = [
      'src/main/java',
      'src/test/java'
    ]
    for (const c of common) {
      const p = path.resolve(projectRoot, c)
      if (fs.existsSync(p)) roots.push(p)
    }
    // Fallback: scan top-level src dirs
    const src = path.resolve(projectRoot, 'src')
    if (fs.existsSync(src)) {
      try {
        const walk = (d: string) => {
          for (const e of fs.readdirSync(d)) {
            const p = path.join(d, e)
            try {
              const st = fs.statSync(p)
              if (st.isDirectory()) {
                if (e === 'java') roots.push(p)
                else walk(p)
              }
            } catch {}
          }
        }
        walk(src)
      } catch {}
    }
    return Array.from(new Set(roots))
  }

  private resolveJavaImport(importName: string, srcRoots: string[]): string | undefined {
    const rel = importName.replace(/\./g, '/') + '.java'
    for (const root of srcRoots) {
      const p = path.resolve(root, rel)
      if (fs.existsSync(p)) return p
    }
    return undefined
  }

  private loadGoModuleReplacements(projectRoot: string): Record<string, string> {
    const map: Record<string, string> = {}
    const goMod = path.resolve(projectRoot, 'go.mod')
    if (!fs.existsSync(goMod)) return map
    const text = fs.readFileSync(goMod, 'utf8')
    // replace example.com/mod => ../local
    const regex = /replace\s+([^\s]+)\s+=>\s+([^\s]+)/g
    let m: RegExpExecArray | null
    while ((m = regex.exec(text)) !== null) {
      const mod = m[1]
      const to = m[2]
      map[mod] = path.resolve(projectRoot, to)
    }
    // module path root
    const modDecl = /module\s+([^\s]+)/.exec(text)
    if (modDecl) map['__module__'] = modDecl[1]
    return map
  }

  private resolveGoImport(importPath: string, moduleMap: Record<string,string>): string | undefined {
    // If import starts with replaced module
    for (const [mod, local] of Object.entries(moduleMap)) {
      if (mod === '__module__') continue
      if (importPath.startsWith(mod)) {
        const rel = importPath.slice(mod.length)
        const dir = path.join(local, rel)
        if (fs.existsSync(dir)) {
          // pick first .go file
          const files = (fs.readdirSync(dir).filter(f => f.endsWith('.go')))
          if (files.length > 0) return path.join(dir, files[0])
        }
      }
    }
    // If under current module
    if (moduleMap['__module__'] && importPath.startsWith(moduleMap['__module__'])) {
      const rel = importPath.slice(moduleMap['__module__'].length)
      const dir = path.join(process.cwd(), rel)
      if (fs.existsSync(dir)) {
        const files = (fs.readdirSync(dir).filter(f => f.endsWith('.go')))
        if (files.length > 0) return path.join(dir, files[0])
      }
    }
    return undefined
  }

  public analyzeAPICalls(codeMap: CodeMap, rules: InteractionRule[]): CodeMap {
    for (const rule of rules) {
      if (rule.type !== 'API_CALL') continue

      // Get the absolute paths for matching
      const frontendPath = path.resolve(process.cwd(), rule.frontend.path)
      const backendPath = path.resolve(process.cwd(), rule.backend.path)
      const urlPrefix = rule.frontend.urlPrefix || ''

      // Load env vars from .env if present
      const envMap = this.loadDotEnv()

      // Filter nodes based on the paths from the config, not language
      const frontendNodes = codeMap.nodes.filter(
        (n) => n.type === 'Function' && n.filePath.startsWith(frontendPath)
      )
      const backendRoutes = codeMap.nodes.filter(
        (n) => n.type === 'APIRoute' && n.filePath.startsWith(backendPath)
      )

      const backendPatterns = backendRoutes.map((r) => ({ node: r, regex: this.routeToRegex(r.label) }))

      const pushEdge = (sourceId: string, url: string) => {
        const resolvedUrl = this.resolveEnvInUrl(url, envMap)
        const pathOnly = this.normalizePath(urlPrefix ? this.joinUrl(urlPrefix, resolvedUrl) : resolvedUrl)
        const matched = backendPatterns.find((p) => p.regex.test(pathOnly))
        if (matched) {
          codeMap.edges.push({ sourceId, targetId: matched.node.id, type: 'API_CALL' })
        }
      }

      for (const feNode of frontendNodes) {
        if (!feNode.codeSnippet) continue

        const code = feNode.codeSnippet

        // fetch("/api/...") and fetch(base + '/...')
        const fetchRegex = /fetch\(([^)]+)\)/g
        let match: RegExpExecArray | null
        while ((match = fetchRegex.exec(code)) !== null) {
          const arg = match[1].trim()
          const url = this.extractStringFromArg(arg, code)
          if (url) pushEdge(feNode.id, url)
        }

        // axios.get("/api/...") and axios.post/put/delete and axios.get(base + '/...')
        const axiosCallRegex = /axios\.(get|post|put|patch|delete)\s*\(\s*([^,)]+)/g
        while ((match = axiosCallRegex.exec(code)) !== null) {
          const arg = match[2].trim()
          const url = this.extractStringFromArg(arg, code)
          if (url) pushEdge(feNode.id, url)
        }

        // axios.create({ baseURL }) instance.get("/path") — naive baseURL handling
        const baseURLMatch = /axios\.create\s*\(\s*\{[^}]*baseURL\s*:\s*([^,}]+)[^}]*\}\s*\)/.exec(code)
        if (baseURLMatch) {
          const baseURL = this.extractStringFromArg(baseURLMatch[1], code) || ''
          const instanceCallRegex = /\b([a-zA-Z_][a-zA-Z0-9_]*)\.(get|post|put|patch|delete)\s*\(\s*([^,)]+)/g
          while ((match = instanceCallRegex.exec(code)) !== null) {
            const arg = match[3].trim()
            const u = this.extractStringFromArg(arg, code)
            if (u) pushEdge(feNode.id, this.joinUrl(baseURL, u))
          }
        }

        // const baseURL = '...'; usage: baseURL + '/path'
        const baseDecl = /(const|let|var)\s+(apiUrl|baseURL|BASE_URL)\s*=\s*([^;]+)/.exec(code)
        if (baseDecl) {
          const base = this.extractStringFromArg(baseDecl[3], code) || ''
          const concatRegex = /(fetch|axios\.(get|post|put|patch|delete))\s*\(\s*(apiUrl|baseURL|BASE_URL)\s*\+\s*([^,)]+)/g
          while ((match = concatRegex.exec(code)) !== null) {
            const tail = this.extractStringFromArg(match[4].trim(), code)
            if (tail) pushEdge(feNode.id, this.joinUrl(base, tail))
          }
        }
      }
    }
    return codeMap
  }

  // Kubernetes linkage: Service selector → Deployment/Pod labels; Deployment → Image components
  public analyzeKubernetes(codeMap: CodeMap): CodeMap {
    const k8sNodes = codeMap.nodes.filter(n => n.language === 'YAML' && n.metadata?.platform === 'Kubernetes')

    const services = k8sNodes.filter(n => n.metadata?.resourceKind === 'Service')
    const deployments = k8sNodes.filter(n => n.metadata?.resourceKind === 'Deployment')
    const pods = k8sNodes.filter(n => n.metadata?.resourceKind === 'Pod')

    // Match Service selectors to Deployment/Pod labels
    for (const svc of services) {
      const selectors = svc.metadata?.selectors || {}
      if (!selectors || Object.keys(selectors).length === 0) continue
      const matches = [...deployments, ...pods].filter(t => {
        const labels = t.metadata?.labels || {}
        return Object.entries(selectors).every(([k,v]) => labels[k] === v)
      })
      for (const target of matches) {
        codeMap.edges.push({ sourceId: svc.id, targetId: target.id, type: 'REFERENCES' })
      }
    }

    // Link Deployments to container images
    for (const d of deployments) {
      const images: string[] = d.metadata?.images || []
      for (const image of images) {
        const imageId = `image:${image}`
        if (!codeMap.nodes.find(n => n.id === imageId)) {
          codeMap.nodes.push({ id: imageId, type: 'Component', label: image, filePath: '', language: 'N/A', metadata: { kind: 'container-image' } })
        }
        codeMap.edges.push({ sourceId: d.id, targetId: imageId, type: 'REFERENCES' })
      }
    }

    return codeMap
  }

  // Heuristic DB lineage: detect SQL in function snippets
  public analyzeDBLineage(codeMap: CodeMap): CodeMap {
    const sqlRegex = /(SELECT|INSERT\s+INTO|UPDATE\s+\w+\s+SET|DELETE\s+FROM)\b/i
    for (const node of codeMap.nodes) {
      if (node.type === 'Function' && node.codeSnippet && sqlRegex.test(node.codeSnippet)) {
        const dbNodeId = 'db:generic'
        if (!codeMap.nodes.find(n => n.id === dbNodeId)) {
          codeMap.nodes.push({ id: dbNodeId, type: 'Component', label: 'Database', filePath: '', language: 'N/A', metadata: { kind: 'database' } })
        }
        codeMap.edges.push({ sourceId: node.id, targetId: dbNodeId, type: 'DB_QUERY' })
      }
    }
    return codeMap
  }

  // ORM lineage heuristics (Sequelize/TypeORM/Prisma/SQLAlchemy/Django ORM)
  public analyzeORM(codeMap: CodeMap): CodeMap {
    const ensureTable = (name: string) => {
      const id = `table:${name}`
      if (!codeMap.nodes.find(n => n.id === id)) {
        codeMap.nodes.push({ id, type: 'Component', label: name, filePath: '', language: 'N/A', metadata: { kind: 'table' } })
      }
      return id
    }

    for (const node of codeMap.nodes) {
      const code = node.codeSnippet || ''
      // Prisma: prisma.user.findMany()
      let m: RegExpExecArray | null
      const prismaRegex = /prisma\.([a-zA-Z_][a-zA-Z0-9_]*)\.(findMany|findUnique|findFirst|create|update|delete)/g
      while ((m = prismaRegex.exec(code)) !== null) {
        const table = m[1]
        const op = m[2]
        const tableId = ensureTable(table)
        const edgeType = /find|select/i.test(op) ? 'READS_FROM' : /create|update|delete/i.test(op) ? 'WRITES_TO' : 'REFERENCES'
        codeMap.edges.push({ sourceId: node.id, targetId: tableId, type: edgeType as any })
      }

      // Sequelize: sequelize.define('users'...) or Model.findAll
      const seqDefine = /define\(\s*['"`]([^'"`]+)['"`]/g
      while ((m = seqDefine.exec(code)) !== null) {
        ensureTable(m[1])
      }
      const seqOps = /\b([A-Za-z_][A-Za-z0-9_]*)\.(findAll|findOne|create|update|destroy)\b/g
      while ((m = seqOps.exec(code)) !== null) {
        const op = m[2]
        // Can't get table name reliably; skip if unknown
      }

      // SQLAlchemy: __tablename__ = 'users'
      const saTable = /__tablename__\s*=\s*['"]([^'"]+)['"]/g
      while ((m = saTable.exec(code)) !== null) {
        ensureTable(m[1])
      }
      const saOps = /session\.query\(([^)]+)\)|\.add\(|\.commit\(/g
      while ((m = saOps.exec(code)) !== null) {
        // Best-effort, no table mapping
      }
    }
    return codeMap
  }

  // Helm overlays: link Chart -> templates and values.yaml
  public analyzeHelm(codeMap: CodeMap): CodeMap {
    const helmNodes = codeMap.nodes.filter(n => n.language === 'YAML' && n.metadata?.platform === 'Helm')
    const charts = helmNodes.filter(n => n.label === 'Helm Chart')
    const templates = helmNodes.filter(n => n.metadata?.resourceKind)
    const values = codeMap.nodes.filter(n => n.language === 'YAML' && n.filePath.toLowerCase().endsWith('values.yaml'))
    for (const chart of charts) {
      for (const t of templates) {
        codeMap.edges.push({ sourceId: chart.id, targetId: t.id, type: 'REFERENCES' })
      }
      for (const v of values) {
        codeMap.edges.push({ sourceId: chart.id, targetId: v.id, type: 'REFERENCES' })
      }
    }

    // Kustomize: link kustomization.yaml -> referenced resources
    const kustomNodes = codeMap.nodes.filter(n => n.language === 'YAML' && n.metadata?.platform === 'Kustomize')
    for (const k of kustomNodes) {
      const baseDir = path.dirname(k.filePath)
      let resources: string[] = (k.metadata?.resources || [])
      if ((!resources || resources.length === 0) && k.codeSnippet) {
        resources = []
        const blockMatch = /resources:\s*([\s\S]*?)(?:\n\w|$)/i.exec(k.codeSnippet)
        if (blockMatch) {
          const block = blockMatch[1]
          const lineRegex = /^\s*-\s*([^\s#]+)\s*$/gim
          let lm: RegExpExecArray | null
          while ((lm = lineRegex.exec(block)) !== null) {
            resources.push(lm[1])
          }
        }
        if (resources.length === 0) {
          const all = k.codeSnippet.match(/^\s*-\s*([^\s#]+)\s*$/gim) || []
          for (const ln of all) {
            const m = /-\s*([^\s#]+)/.exec(ln)
            if (m) resources.push(m[1])
          }
        }
      }
      for (let r of resources) {
        // Normalize path and try common extensions
        let candidates = [r]
        if (!/[.](ya?ml)$/i.test(r)) candidates = [r + '.yaml', r + '.yml', r]
        let found: Node | undefined
        for (const c of candidates) {
          const p = path.resolve(baseDir, c)
          // Prefer Component nodes in that file (e.g., Deployment/Service) over File nodes
          const comps = codeMap.nodes.filter(n => n.filePath === p && n.type === 'Component')
          if (comps.length > 0) { found = comps.find(n => (n.metadata && n.metadata.resourceKind) === 'Deployment') || comps[0]; break }
          found = codeMap.nodes.find(n => n.filePath === p)
          if (found) break
        }
        if (!found) {
          // Fallback: match by basename against YAML nodes
          const bn = path.basename(r)
          found = codeMap.nodes.find(n => n.language === 'YAML' && path.basename(n.filePath) === bn)
        }
        if (found) codeMap.edges.push({ sourceId: k.id, targetId: found.id, type: 'REFERENCES' })
      }
    }
    return codeMap
  }

  // Terraform inter-resource references via depends_on and identifier usage
  public analyzeTerraform(codeMap: CodeMap): CodeMap {
    const resources = codeMap.nodes.filter(n => n.language === 'Terraform' && n.metadata?.kind === 'resource')
    const byLabel = new Map<string, Node>()
    for (const r of resources) {
      const rt = (r.metadata && (r as any).metadata.resourceType) ? (r as any).metadata.resourceType : ''
      const rn = (r.metadata && (r as any).metadata.resourceName) ? (r as any).metadata.resourceName : ''
      if (rt && rn) byLabel.set(`${rt}.${rn}`, r)
    }
    for (const r of resources) {
      const code = r.codeSnippet || ''
      // depends_on = [aws_s3_bucket.b]
      const depRegex = /depends_on\s*=\s*\[([^\]]+)\]/g
      let m: RegExpExecArray | null
      while ((m = depRegex.exec(code)) !== null) {
        const list = m[1]
        const ids = list.match(/[A-Za-z0-9_]+\.[A-Za-z0-9_]+/g) || []
        for (const id of ids) {
          const target = byLabel.get(id)
          if (target) codeMap.edges.push({ sourceId: r.id, targetId: target.id, type: 'REFERENCES' })
        }
      }
      // Inline references: aws_s3_bucket.b
      const refRegex = /\b([A-Za-z0-9_]+\.[A-Za-z0-9_]+)\b/g
      while ((m = refRegex.exec(code)) !== null) {
        const id = m[1]
        const target = byLabel.get(id)
        if (target) codeMap.edges.push({ sourceId: r.id, targetId: target.id, type: 'REFERENCES' })
      }
    }
    return codeMap
  }

  // Heuristic GraphQL SDL link to schema
  public analyzeGraphQLSDL(codeMap: CodeMap): CodeMap {
    const sdlFiles = codeMap.nodes.filter(n => (n.filePath.endsWith('.graphql') || n.filePath.endsWith('.gql')))
    if (sdlFiles.length === 0) return codeMap
    if (!codeMap.nodes.find(n => n.id === 'graphql:schema')) {
      codeMap.nodes.push({ id: 'graphql:schema', type: 'Component', label: 'GraphQL Schema', filePath: '', language: 'N/A', metadata: { kind: 'graphql' } })
    }
    for (const f of sdlFiles) {
      codeMap.edges.push({ sourceId: f.id, targetId: 'graphql:schema', type: 'REFERENCES' })
    }
    return codeMap
  }

  private normalizePath(p: string): string {
    try {
      const url = new URL(p, 'http://placeholder')
      return url.pathname.replace(/\/$/, '')
    } catch {
      return (p || '').replace(/\/$/, '')
    }
  }

  private joinUrl(base: string, pathPart: string): string {
    if (!base) return pathPart
    if (!pathPart) return base
    return `${base.replace(/\/$/, '')}/${pathPart.replace(/^\//, '')}`
  }

  private routeToRegex(route: string): RegExp {
    const normalized = this.normalizePath(route)
      .replace(/:[^/]+/g, '[^/]+')
      .replace(/\{[^/]+\}/g, '[^/]+')
    const pattern = `^${normalized}$`
    return new RegExp(pattern)
  }

  private loadDotEnv(): Record<string,string> {
    const envPath = path.resolve(process.cwd(), '.env')
    const map: Record<string,string> = {}
    if (fs.existsSync(envPath)) {
      const content = fs.readFileSync(envPath, 'utf8')
      for (const line of content.split(/\r?\n/)) {
        const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim())
        if (m) map[m[1]] = m[2]
      }
    }
    return map
  }

  private resolveEnvInUrl(url: string, env: Record<string,string>): string {
    let out = url
    out = out.replace(/\$\{\s*process\.env\.([A-Z0-9_]+)\s*\}/gi, (_, k) => env[k] || '')
    out = out.replace(/process\.env\.([A-Z0-9_]+)/gi, (_, k) => env[k] || '')
    return out
  }

  private extractStringFromArg(arg: string, context: string): string | undefined {
    // String literal
    const str = /^['"`]([^'"`]+)['"`]$/.exec(arg)
    if (str) return str[1]
    // Template literal without nested expressions (backticks)
    const tmpl = /^`([^$`]+)`$/.exec(arg)
    if (tmpl) return tmpl[1]
    // Concatenation: base + '/path'
    const concat = /^([a-zA-Z_][a-zA-Z0-9_\.]*)\s*\+\s*['"`]([^'"`]+)['"`]$/.exec(arg)
    if (concat) return `${concat[1]}${concat[2]}`
    return undefined
  }

  private loadTsPathAliases(): { baseUrl: string; paths: Record<string,string[]> } {
    const roots = [path.resolve(process.cwd(), 'tsconfig.json'), path.resolve(process.cwd(), 'tsconfig.base.json')]
    for (const cfg of roots) {
      if (fs.existsSync(cfg)) {
        try {
          const data = JSON.parse(fs.readFileSync(cfg, 'utf8'))
          const co = data.compilerOptions || {}
          return { baseUrl: path.resolve(path.dirname(cfg), co.baseUrl || '.'), paths: co.paths || {} }
        } catch {}
      }
    }
    return { baseUrl: process.cwd(), paths: {} }
  }

  private applyTsPathAliases(specifier: string, ts: { baseUrl: string; paths: Record<string,string[]> }): string | undefined {
    for (const [alias, targets] of Object.entries(ts.paths)) {
      const prefix = alias.replace(/\*$/, '')
      if (specifier.startsWith(prefix)) {
        const rest = specifier.slice(prefix.length)
        const candidate = (targets[0] || '').replace(/\*$/, rest)
        return path.resolve(ts.baseUrl, candidate)
      }
    }
    return undefined
  }
}
import { Tree, Query, Language } from 'tree-sitter'
import { IAnalysisStrategy } from './IAnalysisStrategy'
import { Node, Edge } from '../types'
import { createHash } from 'crypto'

export class PHPStrategy implements IAnalysisStrategy {
  analyze(ast: Tree, filePath: string, language: Language): { nodes: Node[]; edges: Edge[] } {
    const nodes: Node[] = []
    const edges: Edge[] = []

    // Check if this is a Laravel file
    const isLaravelFile = this.detectLaravelPatterns(ast, language)

    // If this looks like a Laravel routes file, extract explicit routes
    if (/\broutes\/(api|web)\.php$/.test(filePath)) {
      const text = ast.rootNode.text
      const routeRegex = /Route::(get|post|put|patch|delete)\s*\(\s*['"`]([^'"`]+)['"`]/gi
      let m: RegExpExecArray | null
      while ((m = routeRegex.exec(text)) !== null) {
        const method = m[1].toUpperCase()
        const route = m[2]
        nodes.push({
          id: createHash('sha1').update(`api-route:${method}:${route}:${filePath}`).digest('hex'),
          label: route,
          type: 'APIRoute',
          filePath,
          language: 'PHP',
          metadata: { framework: 'Laravel', httpMethod: method }
        })
      }
    }

    // Find class definitions
    const classQuery = new Query(
      language,
      '(class_declaration name: (name) @name)'
    )
    const classMatches = classQuery.matches(ast.rootNode)

    for (const match of classMatches) {
      const nameNode = match.captures.find(c => c.name === 'name')?.node
      if (nameNode) {
        const className = nameNode.text
        const isController = className.includes('Controller')
        const isModel = isLaravelFile && this.isLaravelModel(nameNode, ast, language)
        const isMiddleware = className.includes('Middleware')
        
        let nodeType: 'Class' | 'Component' = 'Class'
        let metadata: any = undefined

        if (isController && isLaravelFile) {
          nodeType = 'Component'
          metadata = { framework: 'Laravel', componentType: 'controller' }
        } else if (isModel) {
          nodeType = 'Component'
          metadata = { framework: 'Laravel', componentType: 'model' }
        } else if (isMiddleware && isLaravelFile) {
          nodeType = 'Component'
          metadata = { framework: 'Laravel', componentType: 'middleware' }
        }

        nodes.push({
          id: createHash('sha1')
            .update(`class:${className}:${filePath}`)
            .digest('hex'),
          label: className,
          type: nodeType,
          filePath: filePath,
          language: 'PHP',
          codeSnippet: nameNode.parent?.text,
          metadata
        })
      }
    }

    // Find method definitions
    const methodQuery = new Query(
      language,
      '(method_declaration name: (name) @name)'
    )
    const methodMatches = methodQuery.matches(ast.rootNode)

    for (const match of methodMatches) {
      const nameNode = match.captures.find(c => c.name === 'name')?.node
      if (nameNode) {
        const methodName = nameNode.text
        const isLaravelRouteMethod = isLaravelFile && this.isLaravelRouteMethod(methodName)
        
        let nodeType: 'Function' | 'APIRoute' = 'Function'
        let metadata: any = undefined

        if (isLaravelRouteMethod) {
          nodeType = 'APIRoute'
          metadata = { 
            framework: 'Laravel',
            handlerMethod: methodName,
            httpMethod: this.detectHttpMethod(methodName)
          }
        }

        nodes.push({
          id: createHash('sha1')
            .update(`method:${methodName}:${filePath}`)
            .digest('hex'),
          label: methodName,
          type: nodeType,
          filePath: filePath,
          language: 'PHP',
          codeSnippet: nameNode.parent?.text,
          metadata
        })
      }
    }

    // Find function definitions
    const functionQuery = new Query(
      language,
      '(function_definition name: (name) @name)'
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
          language: 'PHP',
          codeSnippet: nameNode.parent?.text,
        })
      }
    }

    // Detect database interactions
    this.detectDatabaseInteractions(ast, language, nodes, filePath, isLaravelFile)

    // Find use statements (imports)
    const useQuery = new Query(
      language,
      '(use_declaration (qualified_name) @namespace)'
    )
    const useMatches = useQuery.matches(ast.rootNode)

    // Create a file node
    const fileId = createHash('sha1').update(`file:${filePath}`).digest('hex')
    nodes.push({
      id: fileId,
      type: 'File',
      label: filePath.split('/').pop() || filePath,
      filePath: filePath,
      language: 'PHP',
      metadata: isLaravelFile ? { framework: 'Laravel' } : undefined
    })

    // Create use edges
    for (const match of useMatches) {
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

  private detectLaravelPatterns(ast: Tree, language: Language): boolean {
    // Check for Laravel-specific imports
    const useQuery = new Query(
      language,
      '(use_declaration (qualified_name) @namespace)'
    )
    const useMatches = useQuery.matches(ast.rootNode)

    for (const match of useMatches) {
      const namespaceNode = match.captures.find(c => c.name === 'namespace')?.node
      if (namespaceNode) {
        const namespace = namespaceNode.text
        if (namespace.startsWith('Illuminate\\') || 
            namespace.startsWith('App\\') ||
            namespace.includes('Laravel') ||
            namespace.includes('Eloquent')) {
          return true
        }
      }
    }

    // Check for Laravel-specific method calls or class patterns
    const text = ast.rootNode.text
    return text.includes('extends Controller') ||
           text.includes('extends Model') ||
           text.includes('extends Middleware') ||
           text.includes('Route::') ||
           text.includes('DB::') ||
           text.includes('Cache::') ||
           text.includes('Log::')
  }

  private isLaravelModel(nameNode: any, ast: Tree, language: Language): boolean {
    const classDeclaration = nameNode.parent
    if (classDeclaration) {
      const text = classDeclaration.text
      return text.includes('extends Model') || text.includes('extends Eloquent')
    }
    return false
  }

  private isLaravelRouteMethod(methodName: string): boolean {
    const routeMethods = ['index', 'show', 'create', 'store', 'edit', 'update', 'destroy']
    return routeMethods.includes(methodName)
  }

  private detectHttpMethod(methodName: string): string {
    const methodMap: Record<string, string> = {
      'index': 'GET',
      'show': 'GET',
      'create': 'GET',
      'store': 'POST',
      'edit': 'GET',
      'update': 'PUT',
      'destroy': 'DELETE'
    }
    return methodMap[methodName] || 'GET'
  }

  private detectDatabaseInteractions(ast: Tree, language: Language, nodes: Node[], filePath: string, isLaravel: boolean) {
    // Look for database-related method calls
    const text = ast.rootNode.text
    
    const dbPatterns = [
      'DB::table', 'DB::select', 'DB::insert', 'DB::update', 'DB::delete',
      'Cache::get', 'Cache::put', 'Cache::forget', 'Cache::remember',
      '->where(', '->orderBy(', '->join(', '->paginate(', '->get()', '->first()',
      '->create(', '->save()', '->update(', '->delete()', '->destroy('
    ]

    for (const pattern of dbPatterns) {
      if (text.includes(pattern)) {
        const dbType = pattern.includes('Cache') ? 'cache' : 'database'
        const operation = this.extractDbOperation(pattern)
        
        nodes.push({
          id: createHash('sha1')
            .update(`db-interaction:${pattern}:${filePath}`)
            .digest('hex'),
          label: `${dbType.toUpperCase()} ${operation}`,
          type: 'Component',
          filePath: filePath,
          language: 'PHP',
          metadata: {
            framework: isLaravel ? 'Laravel' : 'PHP',
            dbType,
            operation,
            pattern
          }
        })
      }
    }
  }

  private extractDbOperation(pattern: string): string {
    if (pattern.includes('select') || pattern.includes('get') || pattern.includes('first')) return 'READ'
    if (pattern.includes('insert') || pattern.includes('create') || pattern.includes('save')) return 'CREATE'
    if (pattern.includes('update')) return 'UPDATE'
    if (pattern.includes('delete') || pattern.includes('destroy')) return 'DELETE'
    if (pattern.includes('Cache')) return 'CACHE'
    return 'QUERY'
  }
} 
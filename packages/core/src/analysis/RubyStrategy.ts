import { Tree, Query, Language } from 'tree-sitter'
import { IAnalysisStrategy } from './IAnalysisStrategy'
import { Node, Edge } from '../types'
import { createHash } from 'crypto'
import { basename } from 'path'

export class RubyStrategy implements IAnalysisStrategy {
  analyze(ast: Tree, filePath: string, language: any): { nodes: Node[]; edges: Edge[] } {
    const text = ast.rootNode.text || ''
    // Rails routes.rb detection
    if (filePath.endsWith('routes.rb')) {
      const nodes: Node[] = []
      const edges: Edge[] = []
      const routeRegex = /(get|post|put|patch|delete)\s+['"]([^'"]+)['"]/gi
      let m: RegExpExecArray | null
      while ((m = routeRegex.exec(text)) !== null) {
        const method = m[1].toUpperCase()
        const route = m[2]
        nodes.push({
          id: createHash('sha1').update(`api-route:${method}:${route}:${filePath}`).digest('hex'),
          label: route,
          type: 'APIRoute',
          filePath,
          language: 'Ruby',
          metadata: { framework: 'Rails', httpMethod: method }
        })
      }
      nodes.push({id:createHash('sha1').update(`file:${filePath}`).digest('hex'),type:'File',label:basename(filePath),filePath,language:'Ruby'})
      return {nodes,edges}
    }

    // Sinatra DSL detection
    if (/sinatra/i.test(text)) {
      const nodes: Node[] = []
      const edges: Edge[] = []
      const routeRegex = /(get|post|put|patch|delete)\s+['"]([^'"]+)['"]/gi
      let m: RegExpExecArray | null
      while ((m = routeRegex.exec(text)) !== null) {
        const method = m[1].toUpperCase()
        const route = m[2]
        nodes.push({
          id: createHash('sha1').update(`api-route:${method}:${route}:${filePath}`).digest('hex'),
          label: route,
          type: 'APIRoute',
          filePath,
          language: 'Ruby',
          metadata: { framework: 'Sinatra', httpMethod: method }
        })
      }
      nodes.push({id:createHash('sha1').update(`file:${filePath}`).digest('hex'),type:'File',label:basename(filePath),filePath,language:'Ruby'})
      return {nodes,edges}
    }

    if (!language || !language.nodeTypeInfo) {
      // Fallback: regex detection for Rails controller
      const nodes: Node[] = []
      const edges: Edge[] = []
      const classMatch = text.match(/class\s+(\w+)\s+<\s+ApplicationController/)
      if (classMatch) {
        const className = classMatch[1]
        nodes.push({
          id: createHash('sha1').update(`ruby-class:${className}:${filePath}`).digest('hex'),
          label: className,
          type: 'Component',
          filePath,
          language: 'Ruby',
          metadata:{framework:'Rails',componentType:'controller'}
        })
      }
      nodes.push({id:createHash('sha1').update(`file:${filePath}`).digest('hex'),type:'File',label:basename(filePath),filePath,language:'Ruby'})
      return {nodes,edges}
    }

    const nodes: Node[] = []
    const edges: Edge[] = []

    // Rails heuristics
    const isRailsFile = /class .* < ApplicationController/.test(text) || filePath.includes('controllers')

    // Class definitions
    const classQuery = new Query(language, '(class name: (constant) @name)')
    const classMatches = classQuery.matches(ast.rootNode)

    for (const m of classMatches) {
      const nameNode = m.captures.find(c => c.name === 'name')?.node
      if (!nameNode) continue
      const className = nameNode.text
      const isController = className.endsWith('Controller') && isRailsFile
      nodes.push({
        id: createHash('sha1').update(`class:${className}:${filePath}`).digest('hex'),
        label: className,
        type: isController ? 'Component' : 'Class',
        filePath,
        language: 'Ruby',
        metadata: isController ? { framework: 'Rails', componentType: 'controller' } : undefined,
      })
    }

    // Method definitions
    const methodQuery = new Query(language, '(method name: (identifier) @name)')
    for (const m of methodQuery.matches(ast.rootNode)) {
      const n = m.captures.find(c => c.name === 'name')?.node
      if (!n) continue
      const methodName = n.text
      const railsRoutes = ['index','show','create','update','destroy','edit','new']
      const isRoute = isRailsFile && railsRoutes.includes(methodName)
      nodes.push({
        id: createHash('sha1').update(`method:${methodName}:${filePath}`).digest('hex'),
        label: methodName,
        type: isRoute ? 'APIRoute' : 'Function',
        filePath,
        language: 'Ruby',
        metadata: isRoute ? { framework: 'Rails', httpMethod: this.httpFromMethod(methodName) } : undefined
      })
    }

    // File node
    const fileId = createHash('sha1').update(`file:${filePath}`).digest('hex')
    nodes.push({ id: fileId, label: filePath.split('/').pop() || filePath, type: 'File', filePath, language: 'Ruby' })

    return { nodes, edges }
  }

  private httpFromMethod(name: string): string {
    switch(name){
      case 'index': return 'GET'
      case 'show': return 'GET'
      case 'create': return 'POST'
      case 'update': return 'PUT'
      case 'destroy': return 'DELETE'
      default: return 'GET'
    }
  }
} 
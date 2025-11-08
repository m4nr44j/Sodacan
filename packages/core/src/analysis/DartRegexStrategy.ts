import { Node, Edge } from '../types'
import { createHash } from 'crypto'
import path from 'path'
import fs from 'fs'
import { IAnalysisStrategy } from './IAnalysisStrategy'

export class DartRegexStrategy implements IAnalysisStrategy {
  analyze(ast: any, filePath: string): { nodes: Node[]; edges: Edge[] } {
    const nodes: Node[] = []
    const edges: Edge[] = []

    const source = ast?.rootNode?.text || fs.readFileSync(filePath,'utf8')

    // Detect Flutter imports
    const isFlutter = /package:flutter\//.test(source)

    // Classes that extend Widget
    const classRegex = /class\s+(\w+)\s+extends\s+(StatelessWidget|StatefulWidget|Widget)/g
    let m
    while((m = classRegex.exec(source))!==null){
      const [_, name, base] = m
      nodes.push({
        id: createHash('sha1').update(`dart-class:${name}:${filePath}:${m.index}`).digest('hex'),
        label: name,
        type: 'Component',
        filePath,
        language: 'Dart',
        metadata:{framework:'Flutter',widgetType:base}
      })
    }

    // MaterialApp / CupertinoApp routes
    const routeRegex = /routes\s*:\s*{([^}]+)}/g
    const routeEntryRegex = /['"](\/[\w/]+)['"]\s*:\s*(\w+)/g
    while((m = routeRegex.exec(source))!==null){
      const block = m[1]
      let r
      while((r = routeEntryRegex.exec(block))!==null){
        nodes.push({
          id:createHash('sha1').update(`dart-route:${r[1]}:${filePath}:${r.index}`).digest('hex'),
          label:r[1],
          type:'APIRoute',
          filePath,
          language:'Dart',
          metadata:{framework:'Flutter',handler:r[2]}
        })
      }
    }

    // build() methods
    const buildRegex = /Widget\s+build\s*\([^)]*\)/g
    while((m = buildRegex.exec(source))!==null){
      nodes.push({
        id:createHash('sha1').update(`dart-build:${filePath}:${m.index}`).digest('hex'),
        label:'build',
        type:'Function',
        filePath,
        language:'Dart',
        metadata:{framework:'Flutter'}
      })
    }

    // File node
    nodes.push({id:createHash('sha1').update(`file:${filePath}`).digest('hex'),type:'File',label:path.basename(filePath),filePath,language:'Dart',metadata:{framework:isFlutter?'Flutter':'Dart'}})
    return {nodes,edges}
  }
} 
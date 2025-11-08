import { Tree, Query, Language } from 'tree-sitter'
import { IAnalysisStrategy } from './IAnalysisStrategy'
import { Node, Edge } from '../types'
import { createHash } from 'crypto'
import { basename } from 'path'

export class BashStrategy implements IAnalysisStrategy {
  analyze(ast: Tree, filePath: string, language: any): { nodes: Node[]; edges: Edge[] } {
    const nodes: Node[] = []
    const edges: Edge[] = []

    const textContent = ast.rootNode?.text || ''

    if (!language || !language.nodeTypeInfo) {
      // Regex-only analysis
      this.regexAnalysis(textContent, filePath, nodes)
      nodes.push({id:createHash('sha1').update(`file:${filePath}`).digest('hex'),type:'File',label:basename(filePath),filePath,language:'Shell'})
      return {nodes,edges}
    }
    // language available --> existing query logic below
    const funcQuery = new Query(language, '(function_definition name: (word) @name)')
    for (const m of funcQuery.matches(ast.rootNode)) {
      const n = m.captures.find(c=>c.name==='name')?.node
      if(!n) continue
      nodes.push({
        id: createHash('sha1').update(`func:${n.text}:${filePath}`).digest('hex'),
        label: n.text,
        type: 'Function',
        filePath,
        language: 'Shell',
      })
    }
    this.regexAnalysis(textContent,filePath,nodes)
    const fileId = createHash('sha1').update(`file:${filePath}`).digest('hex')
    nodes.push({id:fileId,label:basename(filePath),type:'File',filePath,language:'Shell'})
    return {nodes,edges}
  }

  private regexAnalysis(text:string,file:string,nodes:Node[]){
    const cliPatterns=['curl','wget','kubectl','docker','aws','gcloud']
    cliPatterns.forEach(cmd=>{
      const regex=new RegExp(`\\b${cmd}\\b`)
      if(regex.test(text)){
        nodes.push({
          id:createHash('sha1').update(`cli:${cmd}:${file}`).digest('hex'),
          label:cmd,
          type:'Component',
          filePath:file,
          language:'Shell',
          metadata:{command:cmd}
        })
      }
    })
  }
} 
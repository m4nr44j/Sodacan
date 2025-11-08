import { Tree, Query, Language } from 'tree-sitter'
import { IAnalysisStrategy } from './IAnalysisStrategy'
import { Node, Edge } from '../types'
import { createHash } from 'crypto'

export class DartStrategy implements IAnalysisStrategy {
  analyze(ast: Tree, filePath: string, language: Language): { nodes: Node[]; edges: Edge[] } {
    const nodes: Node[] = []
    const edges: Edge[] = []

    // Check if this is a Flutter project by looking for Flutter imports
    const isFlutterFile = this.detectFlutterImports(ast, language)

    // Find function definitions
    const functionQuery = new Query(
      language,
      '(function_signature name: (identifier) @name)'
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
          language: 'Dart',
          codeSnippet: nameNode.parent?.text,
        })
      }
    }

    // Find class declarations
    const classQuery = new Query(
      language,
      '(class_definition name: (identifier) @name)'
    )
    const classMatches = classQuery.matches(ast.rootNode)

    for (const match of classMatches) {
      const nameNode = match.captures.find(c => c.name === 'name')?.node
      if (nameNode) {
        // Determine if this is a Flutter Widget
        const isWidget = this.isFlutterWidget(nameNode, isFlutterFile)
        const nodeType = isWidget ? 'Component' : 'Class'
        
        nodes.push({
          id: createHash('sha1')
            .update(`class:${nameNode.text}:${filePath}`)
            .digest('hex'),
          label: nameNode.text,
          type: nodeType,
          filePath: filePath,
          language: 'Dart',
          codeSnippet: nameNode.parent?.text,
          metadata: isWidget ? { 
            framework: 'Flutter',
            widgetType: this.detectWidgetType(nameNode)
          } : undefined
        })
      }
    }

    // Find Flutter route definitions
    if (isFlutterFile) {
      this.findFlutterRoutes(ast, language, nodes, filePath)
    }

    // Find method declarations (including Flutter build methods)
    const methodQuery = new Query(
      language,
      '(method_signature name: (identifier) @name)'
    )
    const methodMatches = methodQuery.matches(ast.rootNode)

    for (const match of methodMatches) {
      const nameNode = match.captures.find(c => c.name === 'name')?.node
      if (nameNode) {
        // Special handling for Flutter build methods
        const isBuildMethod = nameNode.text === 'build' && isFlutterFile
        
        nodes.push({
          id: createHash('sha1')
            .update(`method:${nameNode.text}:${filePath}`)
            .digest('hex'),
          label: nameNode.text,
          type: 'Function',
          filePath: filePath,
          language: 'Dart',
          codeSnippet: nameNode.parent?.text,
          metadata: isBuildMethod ? { 
            framework: 'Flutter',
            methodType: 'build-method'
          } : undefined
        })
      }
    }

    // Find import statements
    const importQuery = new Query(
      language,
      '(import_specification uri: (string_literal) @import_path)'
    )
    const importMatches = importQuery.matches(ast.rootNode)

    // Create a file node
    const fileId = createHash('sha1').update(`file:${filePath}`).digest('hex')
    nodes.push({
      id: fileId,
      type: 'File',
      label: filePath.split('/').pop() || filePath,
      filePath: filePath,
      language: 'Dart',
      metadata: isFlutterFile ? { framework: 'Flutter' } : undefined
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

  private detectFlutterImports(ast: Tree, language: Language): boolean {
    const importQuery = new Query(
      language,
      '(import_specification uri: (string_literal) @import_path)'
    )
    const importMatches = importQuery.matches(ast.rootNode)

    for (const match of importMatches) {
      const importNode = match.captures.find(c => c.name === 'import_path')?.node
      if (importNode) {
        const importPath = importNode.text.replace(/['"]/g, '')
        if (importPath.includes('flutter/') || importPath === 'package:flutter/material.dart' || 
            importPath === 'package:flutter/cupertino.dart' || importPath === 'package:flutter/widgets.dart') {
          return true
        }
      }
    }
    return false
  }

  private isFlutterWidget(nameNode: any, isFlutterFile: boolean): boolean {
    if (!isFlutterFile) return false
    
    // Check if class extends StatelessWidget, StatefulWidget, or Widget
    const classDeclaration = nameNode.parent
    if (classDeclaration) {
      const text = classDeclaration.text
      return text.includes('extends StatelessWidget') || 
             text.includes('extends StatefulWidget') || 
             text.includes('extends Widget') ||
             text.includes('extends State<')
    }
    return false
  }

  private detectWidgetType(nameNode: any): string {
    const classDeclaration = nameNode.parent
    if (classDeclaration) {
      const text = classDeclaration.text
      if (text.includes('extends StatelessWidget')) return 'StatelessWidget'
      if (text.includes('extends StatefulWidget')) return 'StatefulWidget'
      if (text.includes('extends State<')) return 'State'
      if (text.includes('extends Widget')) return 'Widget'
    }
    return 'unknown'
  }

  private findFlutterRoutes(ast: Tree, language: Language, nodes: Node[], filePath: string) {
    // Look for MaterialApp or CupertinoApp with routes
    const appQuery = new Query(
      language,
      '(identifier) @app_type'
    )
    const matches = appQuery.matches(ast.rootNode)

    for (const match of matches) {
      const appNode = match.captures.find(c => c.name === 'app_type')?.node
      if (appNode && (appNode.text === 'MaterialApp' || appNode.text === 'CupertinoApp')) {
        // This is a simplified detection - could be enhanced to parse route maps
        nodes.push({
          id: createHash('sha1')
            .update(`flutter-app:${appNode.text}:${filePath}`)
            .digest('hex'),
          label: `${appNode.text} Routes`,
          type: 'APIRoute',
          filePath: filePath,
          language: 'Dart',
          metadata: {
            framework: 'Flutter',
            appType: appNode.text
          }
        })
      }
    }
  }
} 
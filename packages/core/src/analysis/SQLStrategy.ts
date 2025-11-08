import { Tree, Query, Language } from 'tree-sitter'
import { IAnalysisStrategy } from './IAnalysisStrategy'
import { Node, Edge } from '../types'
import { createHash } from 'crypto'

export class SQLStrategy implements IAnalysisStrategy {
  analyze(ast: Tree, filePath: string, language: any): { nodes: Node[]; edges: Edge[] } {
    if (!language || !language.nodeTypeInfo) {
      return {nodes:[], edges:[]}
    }
    const nodes: Node[] = []
    const edges: Edge[] = []

    // Detect database dialect
    const dialect = this.detectSQLDialect(ast, language)

    // Find CREATE TABLE statements
    const tableQuery = new Query(
      language,
      '(create_table_statement table_name: (identifier) @table_name)'
    )
    const tableMatches = tableQuery.matches(ast.rootNode)

    for (const match of tableMatches) {
      const tableNode = match.captures.find(c => c.name === 'table_name')?.node
      if (tableNode) {
        nodes.push({
          id: createHash('sha1')
            .update(`table:${tableNode.text}:${filePath}`)
            .digest('hex'),
          label: tableNode.text,
          type: 'Class',
          filePath: filePath,
          language: 'SQL',
          codeSnippet: tableNode.parent?.text,
          metadata: {
            dbType: 'table',
            dialect,
            schema: this.extractSchema(tableNode.parent?.text || '')
          }
        })
      }
    }

    // Find CREATE INDEX statements
    const indexQuery = new Query(
      language,
      '(create_index_statement index_name: (identifier) @index_name)'
    )
    const indexMatches = indexQuery.matches(ast.rootNode)

    for (const match of indexMatches) {
      const indexNode = match.captures.find(c => c.name === 'index_name')?.node
      if (indexNode) {
        nodes.push({
          id: createHash('sha1')
            .update(`index:${indexNode.text}:${filePath}`)
            .digest('hex'),
          label: indexNode.text,
          type: 'Component',
          filePath: filePath,
          language: 'SQL',
          codeSnippet: indexNode.parent?.text,
          metadata: {
            dbType: 'index',
            dialect
          }
        })
      }
    }

    // Find function/procedure definitions
    const functionQuery = new Query(
      language,
      '(create_function_statement function_name: (identifier) @function_name)'
    )
    const functionMatches = functionQuery.matches(ast.rootNode)

    for (const match of functionMatches) {
      const functionNode = match.captures.find(c => c.name === 'function_name')?.node
      if (functionNode) {
        nodes.push({
          id: createHash('sha1')
            .update(`function:${functionNode.text}:${filePath}`)
            .digest('hex'),
          label: functionNode.text,
          type: 'Function',
          filePath: filePath,
          language: 'SQL',
          codeSnippet: functionNode.parent?.text,
          metadata: {
            dbType: 'function',
            dialect
          }
        })
      }
    }

    // Find trigger definitions
    const triggerQuery = new Query(
      language,
      '(create_trigger_statement trigger_name: (identifier) @trigger_name)'
    )
    const triggerMatches = triggerQuery.matches(ast.rootNode)

    for (const match of triggerMatches) {
      const triggerNode = match.captures.find(c => c.name === 'trigger_name')?.node
      if (triggerNode) {
        nodes.push({
          id: createHash('sha1')
            .update(`trigger:${triggerNode.text}:${filePath}`)
            .digest('hex'),
          label: triggerNode.text,
          type: 'Function',
          filePath: filePath,
          language: 'SQL',
          codeSnippet: triggerNode.parent?.text,
          metadata: {
            dbType: 'trigger',
            dialect
          }
        })
      }
    }

    // Detect foreign key relationships
    this.detectForeignKeys(ast, language, edges, filePath)

    // Detect column data types and constraints
    this.detectDatabaseFeatures(ast, language, nodes, filePath, dialect)

    // Create a file node
    const fileId = createHash('sha1').update(`file:${filePath}`).digest('hex')
    nodes.push({
      id: fileId,
      type: 'File',
      label: filePath.split('/').pop() || filePath,
      filePath: filePath,
      language: 'SQL',
      metadata: { 
        dbDialect: dialect,
        fileType: 'database-schema'
      }
    })

    return { nodes, edges }
  }

  private detectSQLDialect(ast: Tree, language: Language): string {
    const text = ast.rootNode.text.toLowerCase()
    
    // PostgreSQL-specific features
    if (text.includes('bigserial') || 
        text.includes('jsonb') || 
        text.includes('text[]') ||
        text.includes('inet') ||
        text.includes('using gin') ||
        text.includes('$$ language')) {
      return 'PostgreSQL'
    }
    
    // MySQL-specific features
    if (text.includes('auto_increment') ||
        text.includes('engine=innodb') ||
        text.includes('charset=utf8') ||
        text.includes('unsigned')) {
      return 'MySQL'
    }
    
    // SQL Server-specific features
    if (text.includes('identity(') ||
        text.includes('nvarchar') ||
        text.includes('clustered index') ||
        text.includes('[dbo].')) {
      return 'SQL Server'
    }
    
    // SQLite-specific features
    if (text.includes('integer primary key') ||
        text.includes('autoincrement') ||
        text.includes('pragma')) {
      return 'SQLite'
    }
    
    // Oracle-specific features
    if (text.includes('number(') ||
        text.includes('varchar2') ||
        text.includes('sys.dual') ||
        text.includes('sequence')) {
      return 'Oracle'
    }
    
    return 'Generic SQL'
  }

  private extractSchema(tableDefinition: string): any {
    const columns: any[] = []
    const constraints: string[] = []
    
    // Simple parsing for common column patterns
    const columnPattern = /(\w+)\s+([\w\(\)]+)(?:\s+(NOT NULL|NULL|PRIMARY KEY|UNIQUE|DEFAULT \S+|REFERENCES \S+))*\s*,?/gi
    let match
    
    while ((match = columnPattern.exec(tableDefinition)) !== null) {
      const [, name, type, ...modifiers] = match
      columns.push({
        name,
        type,
        modifiers: modifiers.filter(Boolean)
      })
    }
    
    // Extract constraints
    if (tableDefinition.includes('PRIMARY KEY')) constraints.push('PRIMARY KEY')
    if (tableDefinition.includes('FOREIGN KEY')) constraints.push('FOREIGN KEY')
    if (tableDefinition.includes('UNIQUE')) constraints.push('UNIQUE')
    if (tableDefinition.includes('CHECK')) constraints.push('CHECK')
    
    return {
      columns: columns.slice(0, 10), // Limit to avoid huge metadata
      constraints,
      hasIndexes: tableDefinition.includes('INDEX'),
      hasTriggers: tableDefinition.includes('TRIGGER')
    }
  }

  private detectForeignKeys(ast: Tree, language: Language, edges: Edge[], filePath: string) {
    const text = ast.rootNode.text
    
    // Simple foreign key detection
    const fkPattern = /REFERENCES\s+(\w+)\s*\(/gi
    let match
    
    while ((match = fkPattern.exec(text)) !== null) {
      const referencedTable = match[1]
      
      edges.push({
        sourceId: createHash('sha1').update(`file:${filePath}`).digest('hex'),
        targetId: referencedTable,
        type: 'REFERENCES'
      })
    }
  }

  private detectDatabaseFeatures(ast: Tree, language: Language, nodes: Node[], filePath: string, dialect: string) {
    const text = ast.rootNode.text.toLowerCase()
    
    const features: string[] = []
    
    // Detect advanced database features
    if (text.includes('jsonb') || text.includes('json')) features.push('JSON Support')
    if (text.includes('gin') || text.includes('gist')) features.push('Advanced Indexing')
    if (text.includes('trigger')) features.push('Triggers')
    if (text.includes('function') || text.includes('procedure')) features.push('Stored Procedures')
    if (text.includes('partition')) features.push('Table Partitioning')
    if (text.includes('materialized view')) features.push('Materialized Views')
    if (text.includes('full text')) features.push('Full Text Search')
    
    if (features.length > 0) {
      nodes.push({
        id: createHash('sha1')
          .update(`db-features:${filePath}`)
          .digest('hex'),
        label: `Database Features (${features.length})`,
        type: 'Component',
        filePath: filePath,
        language: 'SQL',
        metadata: {
          dbType: 'features',
          dialect,
          features,
          complexity: features.length > 5 ? 'high' : features.length > 2 ? 'medium' : 'low'
        }
      })
    }
  }
} 
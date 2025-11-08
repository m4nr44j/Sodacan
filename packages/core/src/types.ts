// packages/core/src/types.ts

// Defines the types of constructs we can identify.
export type NodeType =
  | 'File'
  | 'Function'
  | 'Class'
  | 'Component'
  | 'APIRoute'

// Represents a single code construct (e.g., a function, a class).
export interface Node {
  id: string
  type: NodeType
  label: string
  filePath: string
  language: string
  codeSnippet?: string
  metadata?: Record<string, any>
}

// Defines the types of relationships between nodes.
export type EdgeType =
  | 'IMPORTS'
  | 'CALLS'
  | 'API_CALL'
  | 'DB_QUERY'
  | 'REFERENCES'
  | 'MESSAGE_PUBLISH'
  | 'MESSAGE_CONSUME'
  | 'RPC_CALL'
  | 'GRAPHQL_QUERY'
  | 'READS_FROM'
  | 'WRITES_TO'

// Represents a directed connection between two nodes.
export interface Edge {
  sourceId: string
  targetId: string
  type: EdgeType
}

// Code quality statistics
export interface CodeQualityStats {
  dbQueriesInLoops: {
    count: number
    issues: Array<{ filePath: string; functionName: string; line?: number }>
  }
  nPlusOneQueries: {
    count: number
    issues: Array<{ filePath: string; functionName: string; line?: number }>
  }
  deadCode: {
    count: number
    controllers: number
    methods: number
    commentedBlocks: number
    backupFiles: number
    issues: Array<{ filePath: string; type: string; name?: string }>
  }
  technicalDebt: {
    count: number
    todos: number
    fixmes: number
    hackyComments: number
    temporarilyRemoved: number
    issues: Array<{ filePath: string; line?: number; type: string; comment: string }>
  }
  codeSmells: {
    count: number
    issues: Array<{ filePath: string; functionName?: string; type: string; description: string }>
  }
  repeatedCode: {
    count: number
    issues: Array<{ filePath: string; type: string; description: string }>
  }
  anomalies: {
    count: number
    issues: Array<{ filePath: string; functionName?: string; type: string; description: string }>
  }
  blockingAsyncCalls: {
    count: number
    issues: Array<{ filePath: string; functionName?: string; line?: number; method: string }>
  }
}

// The final output structure, representing the entire project map.
export interface CodeMap {
  // Optional metadata for determinism and traceability
  version?: string
  generatedAt?: string
  generator?: string
  nodes: Node[]
  edges: Edge[]
  statistics?: CodeQualityStats
}

// Used internally by strategies to report dynamic calls before resolution
export interface CallSite {
  callerId: string
  raw: string // identifier text
  qualifier?: string // optional namespace/object qualifier
}
import { CodeMap, Node, CodeQualityStats } from './types'

export class CodeQualityAnalyzer {
  public analyze(codeMap: CodeMap): CodeQualityStats {
    const stats: CodeQualityStats = {
      dbQueriesInLoops: { count: 0, issues: [] },
      nPlusOneQueries: { count: 0, issues: [] },
      deadCode: { count: 0, controllers: 0, methods: 0, commentedBlocks: 0, backupFiles: 0, issues: [] },
      technicalDebt: { count: 0, todos: 0, fixmes: 0, hackyComments: 0, temporarilyRemoved: 0, issues: [] },
      codeSmells: { count: 0, issues: [] },
      repeatedCode: { count: 0, issues: [] },
      anomalies: { count: 0, issues: [] },
      blockingAsyncCalls: { count: 0, issues: [] }
    }

    // Analyze all function nodes
    const functionNodes = codeMap.nodes.filter(n => n.type === 'Function' || n.type === 'APIRoute')
    
    for (const node of functionNodes) {
      const code = node.codeSnippet || ''
      if (!code) continue

      // DB Queries in Loops
      this.detectDBQueriesInLoops(code, node, stats)
      
      // N+1 Query Patterns
      this.detectNPlusOneQueries(code, node, stats)
      
      // Blocking Async Calls
      this.detectBlockingAsyncCalls(code, node, stats)
      
      // Technical Debt (TODO/FIXME)
      this.detectTechnicalDebt(code, node, stats)
      
      // Code Smells
      this.detectCodeSmells(code, node, stats)
      
      // Anomalies
      this.detectAnomalies(code, node, stats)
    }

    // Dead Code Detection
    this.detectDeadCode(codeMap, stats)
    
    // Repeated Code Detection
    this.detectRepeatedCode(codeMap, stats)

    return stats
  }

  private detectDBQueriesInLoops(code: string, node: Node, stats: CodeQualityStats) {
    // Only detect actual loops (for, while, foreach) - not functional methods like map/filter
    // These are more likely to be problematic
    const loopPatterns = [
      /\bfor\s*\([^)]*\)\s*\{/g,
      /\bwhile\s*\([^)]*\)\s*\{/g,
      /\bforeach\s*\(/g
    ]

    // DB query patterns - more specific to actual database operations
    const dbQueryPatterns = [
      /\b(?:SELECT|INSERT|UPDATE|DELETE)\s+.*?\bFROM\b/i,
      /\b(?:db|DB|database|Database|_context|_db)\.(?:query|execute|ExecuteSql|FromSql|SaveChanges|SaveChangesAsync)/i,
      /\b(?:prisma|sequelize|typeorm)\.(?:findMany|findUnique|create|update|delete)/i,
      /\b(?:User|Model|Entity|DbSet)\.(?:Find|Where|First|FirstOrDefault|Single|SingleOrDefault)/i,
      /\b(?:DB::|Cache::)table|select|insert|update|delete/i,
      /\.(?:SaveChanges|SaveChangesAsync|ExecuteSql|FromSql)/i,
      /\b(?:session\.query|orm\.query|db\.query|_context\.)/i
    ]

    // Track unique issues per function to avoid double counting
    const seenIssues = new Set<string>()

    for (const loopPattern of loopPatterns) {
      const loopMatches = [...code.matchAll(loopPattern)]
      for (const loopMatch of loopMatches) {
        const loopStart = loopMatch.index || 0
        const loopEnd = this.findMatchingBrace(code, loopStart)
        if (loopEnd === -1) continue
        
        const loopBody = code.substring(loopStart, loopEnd)
        
        // Check if loop body contains DB queries
        for (const dbPattern of dbQueryPatterns) {
          if (dbPattern.test(loopBody)) {
            const issueKey = `${node.filePath}:${node.label}:${loopStart}`
            if (!seenIssues.has(issueKey)) {
              seenIssues.add(issueKey)
              stats.dbQueriesInLoops.count++
              stats.dbQueriesInLoops.issues.push({
                filePath: node.filePath,
                functionName: node.label
              })
            }
            break
          }
        }
      }
    }
  }

  private detectNPlusOneQueries(code: string, node: Node, stats: CodeQualityStats) {
    // N+1 pattern: query in a loop that fetches related data
    // More specific: loop over collection, then query for each item WITHOUT eager loading
    
    // Only actual loops, not functional methods
    const loopPatterns = [
      /\bfor\s*\([^)]*\)\s*\{/g,
      /\bwhile\s*\([^)]*\)\s*\{/g,
      /\bforeach\s*\(/g,
      /\.forEach\s*\(/g
    ]

    // Specific query patterns that indicate fetching related data
    const queryPatterns = [
      /\.(?:Find|FindAsync|First|FirstOrDefault|Single|SingleOrDefault|Where)\s*\(/i,
      /\.(?:Include|ThenInclude|Load|LoadAsync)\s*\(/i,
      /\b(?:SELECT|query|execute).*?\bFROM/i,
      /_context\.(?:Set|Find|FindAsync)/i
    ]

    // Track unique issues
    const seenIssues = new Set<string>()

    for (const loopPattern of loopPatterns) {
      const matches = [...code.matchAll(loopPattern)]
      for (const match of matches) {
        const start = match.index || 0
        const loopEnd = this.findMatchingBrace(code, start)
        if (loopEnd === -1) continue
        
        const loopBody = code.substring(start, loopEnd)
        
        // Check if loop body has queries but NO eager loading
        let hasQuery = false
        let hasEagerLoading = false
        
        for (const queryPattern of queryPatterns) {
          if (queryPattern.test(loopBody)) {
            hasQuery = true
            break
          }
        }
        
        // Check for eager loading patterns
        if (/(?:\.Include|\.ThenInclude|\.With|\.Join|eager|preload|\.Load)/i.test(loopBody)) {
          hasEagerLoading = true
        }
        
        // N+1 pattern: query in loop without eager loading
        if (hasQuery && !hasEagerLoading) {
          const issueKey = `${node.filePath}:${node.label}:${start}`
          if (!seenIssues.has(issueKey)) {
            seenIssues.add(issueKey)
            stats.nPlusOneQueries.count++
            stats.nPlusOneQueries.issues.push({
              filePath: node.filePath,
              functionName: node.label
            })
          }
        }
      }
    }
  }

  private detectBlockingAsyncCalls(code: string, node: Node, stats: CodeQualityStats) {
    // Only analyze Service/Controller methods
    if (!/Service|Controller/i.test(node.filePath) && !/Service|Controller/i.test(node.label)) {
      return
    }

    // Detect .Result, .Wait(), .GetAwaiter().GetResult() patterns
    // More specific: only count actual blocking calls, not in test code
    if (/test|spec|mock|stub/i.test(node.filePath)) {
      return
    }

    const blockingPatterns = [
      /\.Result\b(?!\s*==|\s*!=|\s*===|\s*!==)/g, // .Result but not comparisons
      /\.Wait\s*\(\s*\)/g,
      /\.GetAwaiter\s*\(\s*\)\s*\.GetResult\s*\(/g
    ]

    // Track unique instances per function
    const seenMethods = new Set<string>()

    for (const pattern of blockingPatterns) {
      const matches = [...code.matchAll(pattern)]
      for (const match of matches) {
        const method = match[0].trim()
        const methodKey = `${node.filePath}:${node.label}:${method}`
        if (!seenMethods.has(methodKey)) {
          seenMethods.add(methodKey)
          stats.blockingAsyncCalls.count++
          stats.blockingAsyncCalls.issues.push({
            filePath: node.filePath,
            functionName: node.label,
            method: method
          })
        }
      }
    }
  }

  private detectTechnicalDebt(code: string, node: Node, stats: CodeQualityStats) {
    // Only count in Services (as per original requirement: "37 TODO/FIXME comments in Services")
    if (!/Service/i.test(node.filePath) && !/Service/i.test(node.label)) {
      return
    }

    const lines = code.split('\n')
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      
      // TODO comments - must be actual comments, not in strings
      const todoMatch = /\/\/.*TODO|\/\*.*TODO|#.*TODO/i.exec(line)
      if (todoMatch && !/['"]/.test(line.substring(0, todoMatch.index || 0))) {
        stats.technicalDebt.todos++
        stats.technicalDebt.count++
        stats.technicalDebt.issues.push({
          filePath: node.filePath,
          line: i + 1,
          type: 'TODO',
          comment: line.trim()
        })
      }
      
      // FIXME comments
      const fixmeMatch = /\/\/.*FIXME|\/\*.*FIXME|#.*FIXME/i.exec(line)
      if (fixmeMatch && !/['"]/.test(line.substring(0, fixmeMatch.index || 0))) {
        stats.technicalDebt.fixmes++
        stats.technicalDebt.count++
        stats.technicalDebt.issues.push({
          filePath: node.filePath,
          line: i + 1,
          type: 'FIXME',
          comment: line.trim()
        })
      }
      
      // Hacky comments
      const hackyMatch = /\/\/.*(?:hacky|hack|kludge|workaround)|\/\*.*(?:hacky|hack|kludge|workaround)|#.*(?:hacky|hack|kludge|workaround)/i.exec(line)
      if (hackyMatch && !/['"]/.test(line.substring(0, hackyMatch.index || 0))) {
        stats.technicalDebt.hackyComments++
        stats.technicalDebt.count++
        stats.technicalDebt.issues.push({
          filePath: node.filePath,
          line: i + 1,
          type: 'HACKY',
          comment: line.trim()
        })
      }
      
      // Temporarily removed
      const tempMatch = /\/\/.*(?:temporarily\s+removed|temp\s+removed|temporary\s+removal)|\/\*.*(?:temporarily\s+removed|temp\s+removed|temporary\s+removal)|#.*(?:temporarily\s+removed|temp\s+removed|temporary\s+removal)/i.exec(line)
      if (tempMatch && !/['"]/.test(line.substring(0, tempMatch.index || 0))) {
        stats.technicalDebt.temporarilyRemoved++
        stats.technicalDebt.count++
        stats.technicalDebt.issues.push({
          filePath: node.filePath,
          line: i + 1,
          type: 'TEMPORARILY_REMOVED',
          comment: line.trim()
        })
      }
    }
  }

  private detectCodeSmells(code: string, node: Node, stats: CodeQualityStats) {
    // Only analyze Service/Controller methods to reduce false positives
    if (!/Service|Controller/i.test(node.filePath) && !/Service|Controller/i.test(node.label)) {
      return
    }

    // Inconsistent Error Handling - try without catch or catch without proper handling
    const hasTry = /try\s*\{/.test(code)
    const hasCatch = /catch\s*\(/.test(code)
    const hasThrow = /throw\s+/.test(code)
    if (hasTry && !hasCatch) {
      stats.codeSmells.count++
      stats.codeSmells.issues.push({
        filePath: node.filePath,
        functionName: node.label,
        type: 'Inconsistent Error Handling',
        description: 'Try block without catch'
      })
    }

    // Magic Numbers/Strings - only in business logic (not in Services with common patterns)
    const magicNumberPattern = /\b(?:[4-9]\d{2,}|\d{4,})\b/g // 400+ or 4+ digits
    const magicStringPattern = /['"](?:[a-zA-Z]{15,}|[A-Z_]{8,})['"]/g // Long strings or constants
    const magicNumbers = (code.match(magicNumberPattern) || []).filter(n => {
      const num = parseInt(n)
      // Exclude common HTTP codes, years, etc.
      return num !== 200 && num !== 201 && num !== 400 && num !== 404 && num !== 500 && 
             num < 1900 || num > 2100
    })
    const magicStrings = (code.match(magicStringPattern) || []).filter(s => 
      !/http|https|application|json|text|html/i.test(s)
    )
    if (magicNumbers.length > 5 || magicStrings.length > 5) {
      stats.codeSmells.count++
      stats.codeSmells.issues.push({
        filePath: node.filePath,
        functionName: node.label,
        type: 'Magic Numbers/Strings',
        description: 'Multiple magic numbers or strings detected'
      })
    }

    // Long Methods (heuristic: > 80 lines for Services)
    const lineCount = code.split('\n').length
    if (lineCount > 80) {
      stats.codeSmells.count++
      stats.codeSmells.issues.push({
        filePath: node.filePath,
        functionName: node.label,
        type: 'Long Method',
        description: `Method has ${lineCount} lines (threshold: 80)`
      })
    }

    // Type Mismatch (heuristic: excessive casting - > 10 casts)
    const typeCastPatterns = [
      /\([A-Z][a-zA-Z0-9_<>]*\)\s*\w+/g, // (Type)variable
      /\bas\s+[A-Z][a-zA-Z0-9_<>]+/g, // as Type
    ]
    let castCount = 0
    for (const pattern of typeCastPatterns) {
      castCount += (code.match(pattern) || []).length
    }
    if (castCount > 10) {
      stats.codeSmells.count++
      stats.codeSmells.issues.push({
        filePath: node.filePath,
        functionName: node.label,
        type: 'Type Mismatch',
        description: 'Excessive type casting detected'
      })
    }
  }

  private detectAnomalies(code: string, node: Node, stats: CodeQualityStats) {
    // Only analyze Service/Controller methods
    if (!/Service|Controller/i.test(node.filePath) && !/Service|Controller/i.test(node.label)) {
      return
    }

    // Track unique issues per function
    const seenTypes = new Set<string>()

    // SaveChangesAsync usage without await
    if (/SaveChangesAsync|saveChangesAsync/i.test(code) && !/\bawait\s+.*?SaveChangesAsync/i.test(code)) {
      const key = 'SaveChangesAsync'
      if (!seenTypes.has(key)) {
        seenTypes.add(key)
        stats.anomalies.count++
        stats.anomalies.issues.push({
          filePath: node.filePath,
          functionName: node.label,
          type: 'SaveChangesAsync usage',
          description: 'SaveChangesAsync without await detected'
        })
      }
    }

    // Async/Await patterns - mixing async/await with blocking calls
    const asyncAwaitMismatch = /\basync\s+[^{]*\{[^}]*\bawait\s+[^}]*\b\.Result\b/g
    if (asyncAwaitMismatch.test(code)) {
      const key = 'AsyncAwait'
      if (!seenTypes.has(key)) {
        seenTypes.add(key)
        stats.anomalies.count++
        stats.anomalies.issues.push({
          filePath: node.filePath,
          functionName: node.label,
          type: 'Async/Await pattern',
          description: 'Mixing async/await with blocking calls'
        })
      }
    }

    // Commented Includes - only if there's an active query nearby
    if ((/\/\/\s*\.(?:Include|With|ThenInclude)/i.test(code) || /\/\*[^*]*\.(?:Include|With|ThenInclude)/i.test(code)) &&
        /\.(?:Find|Where|First|ToList|ToArray)/i.test(code)) {
      const key = 'CommentedIncludes'
      if (!seenTypes.has(key)) {
        seenTypes.add(key)
        stats.anomalies.count++
        stats.anomalies.issues.push({
          filePath: node.filePath,
          functionName: node.label,
          type: 'Commented Includes',
          description: 'Eager loading includes are commented out'
        })
      }
    }

    // Database timeout - only if explicitly set to low values
    if (/timeout\s*[=:]\s*\d+\s*[<,=]\s*30/i.test(code) && /database|db|query|connection|command/i.test(code)) {
      const key = 'DatabaseTimeout'
      if (!seenTypes.has(key)) {
        seenTypes.add(key)
        stats.anomalies.count++
        stats.anomalies.issues.push({
          filePath: node.filePath,
          functionName: node.label,
          type: 'Database timeout',
          description: 'Database timeout set to low value'
        })
      }
    }

    // Fire-and-forget - Task.Run without await
    const fireAndForget = /Task\.Run\s*\([^)]*\)(?!\s*\.|await)/i
    if (fireAndForget.test(code)) {
      const key = 'FireAndForget'
      if (!seenTypes.has(key)) {
        seenTypes.add(key)
        stats.anomalies.count++
        stats.anomalies.issues.push({
          filePath: node.filePath,
          functionName: node.label,
          type: 'Fire-and-forget',
          description: 'Fire-and-forget async pattern detected'
        })
      }
    }
  }

  private detectDeadCode(codeMap: CodeMap, stats: CodeQualityStats) {
    // Find unused controllers (no incoming API_CALL edges)
    const controllers = codeMap.nodes.filter(n => 
      n.type === 'APIRoute' || 
      (n.metadata?.framework && /controller|Controller/i.test(n.metadata.framework)) ||
      /Controller/i.test(n.label)
    )
    
    for (const controller of controllers) {
      const incomingEdges = codeMap.edges.filter(e => 
        e.targetId === controller.id && (e.type === 'API_CALL' || e.type === 'CALLS')
      )
      if (incomingEdges.length === 0) {
        stats.deadCode.controllers++
        stats.deadCode.count++
        stats.deadCode.issues.push({
          filePath: controller.filePath,
          type: 'Unused Controller',
          name: controller.label
        })
      }
    }

    // Find unused methods - only count public methods in Services/Controllers that have no callers
    const serviceMethods = codeMap.nodes.filter(n => 
      n.type === 'Function' && 
      n.filePath && 
      (/Service|Controller/i.test(n.filePath) || /Service|Controller/i.test(n.label)) &&
      !/APIRoute/i.test(n.type)
    )
    
    for (const method of serviceMethods) {
      const incomingCalls = codeMap.edges.filter(e => 
        e.targetId === method.id && e.type === 'CALLS'
      )
      // Only count if truly unused (no calls) and not an entry point
      if (incomingCalls.length === 0 && 
          !/main|index|entry|constructor|init|startup/i.test(method.label.toLowerCase())) {
        stats.deadCode.methods++
        stats.deadCode.count++
        stats.deadCode.issues.push({
          filePath: method.filePath,
          type: 'Unused Method',
          name: method.label
        })
      }
    }

    // Find commented code blocks
    const allNodes = codeMap.nodes.filter(n => n.codeSnippet)
    for (const node of allNodes) {
      const code = node.codeSnippet || ''
      // Detect large commented blocks (heuristic: > 5 lines of comments)
      const commentedBlocks = code.match(/\/\*[\s\S]{100,}?\*\//g) || []
      for (const block of commentedBlocks) {
        const lines = block.split('\n').length
        if (lines > 5) {
          stats.deadCode.commentedBlocks++
          stats.deadCode.count++
          stats.deadCode.issues.push({
            filePath: node.filePath,
            type: 'Commented Code Block',
            name: node.label
          })
        }
      }
    }

    // Find backup files
    const backupFiles = codeMap.nodes.filter(n => 
      n.type === 'File' && (
        /\.bak$|\.backup$|\.old$|\.orig$|~$|\.tmp$/i.test(n.filePath) ||
        /backup|old|temp|tmp/i.test(n.filePath)
      )
    )
    stats.deadCode.backupFiles = backupFiles.length
    stats.deadCode.count += backupFiles.length
    for (const file of backupFiles) {
      stats.deadCode.issues.push({
        filePath: file.filePath,
        type: 'Backup File',
        name: file.label
      })
    }
  }

  private detectRepeatedCode(codeMap: CodeMap, stats: CodeQualityStats) {
    // Detect duplicate validation logic
    const validationPatterns = new Map<string, number>()
    const functionNodes = codeMap.nodes.filter(n => n.type === 'Function' || n.type === 'APIRoute')
    
    for (const node of functionNodes) {
      const code = node.codeSnippet || ''
      // Extract validation patterns
      const validations = code.match(/(?:validate|check|verify|required|max|min)\s*\([^)]+\)/gi) || []
      for (const validation of validations) {
        const normalized = validation.toLowerCase().replace(/\s+/g, ' ')
        validationPatterns.set(normalized, (validationPatterns.get(normalized) || 0) + 1)
      }
    }
    
    let duplicateValidations = 0
    for (const [pattern, count] of validationPatterns.entries()) {
      if (count > 1) duplicateValidations++
    }
    if (duplicateValidations > 0) {
      stats.repeatedCode.count++
      stats.repeatedCode.issues.push({
        filePath: 'Multiple files',
        type: 'Duplicate validation logic',
        description: `${duplicateValidations} duplicate validation patterns found`
      })
    }

    // Detect duplicate address collection patterns
    const addressPatterns = codeMap.nodes
      .filter(n => n.codeSnippet)
      .map(n => {
        const code = n.codeSnippet || ''
        return code.match(/(?:address|street|city|zip|postal)[\s\S]{0,200}/gi) || []
      })
      .flat()
    
    if (addressPatterns.length > 3) {
      stats.repeatedCode.count++
      stats.repeatedCode.issues.push({
        filePath: 'Multiple files',
        type: 'Duplicate address collection',
        description: 'Address collection logic appears in multiple places'
      })
    }

    // Detect duplicate SQL migrations (same table/column names)
    const sqlNodes = codeMap.nodes.filter(n => n.language === 'SQL')
    const migrationPatterns = new Map<string, number>()
    for (const node of sqlNodes) {
      const code = node.codeSnippet || ''
      const tables = code.match(/(?:CREATE|ALTER)\s+TABLE\s+(\w+)/gi) || []
      for (const table of tables) {
        migrationPatterns.set(table.toLowerCase(), (migrationPatterns.get(table.toLowerCase()) || 0) + 1)
      }
    }
    
    let duplicateMigrations = 0
    for (const [table, count] of migrationPatterns.entries()) {
      if (count > 1) duplicateMigrations++
    }
    if (duplicateMigrations > 0) {
      stats.repeatedCode.count++
      stats.repeatedCode.issues.push({
        filePath: 'Multiple files',
        type: 'Duplicate SQL migrations',
        description: `${duplicateMigrations} duplicate table migrations found`
      })
    }

    // Detect repeated Include patterns
    const includePatterns = new Map<string, number>()
    for (const node of functionNodes) {
      const code = node.codeSnippet || ''
      const includes = code.match(/\.(?:include|with|join)\s*\([^)]+\)/gi) || []
      for (const include of includes) {
        const normalized = include.toLowerCase().replace(/\s+/g, ' ')
        includePatterns.set(normalized, (includePatterns.get(normalized) || 0) + 1)
      }
    }
    
    let duplicateIncludes = 0
    for (const [pattern, count] of includePatterns.entries()) {
      if (count > 1) duplicateIncludes++
    }
    if (duplicateIncludes > 0) {
      stats.repeatedCode.count++
      stats.repeatedCode.issues.push({
        filePath: 'Multiple files',
        type: 'Repeated Include patterns',
        description: `${duplicateIncludes} duplicate include/with patterns found`
      })
    }
  }

  private findMatchingBrace(code: string, start: number): number {
    let depth = 0
    let inString = false
    let stringChar = ''
    
    for (let i = start; i < code.length; i++) {
      const char = code[i]
      const prevChar = i > 0 ? code[i - 1] : ''
      
      // Handle string literals
      if ((char === '"' || char === "'" || char === '`') && prevChar !== '\\') {
        if (!inString) {
          inString = true
          stringChar = char
        } else if (char === stringChar) {
          inString = false
        }
        continue
      }
      
      if (inString) continue
      
      if (char === '{') depth++
      if (char === '}') {
        depth--
        if (depth === 0) return i + 1
      }
    }
    
    return -1
  }
}


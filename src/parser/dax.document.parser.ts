import * as vscode from 'vscode';

export interface VariableInfo {
  name: string;
  declarationLine: number;
  declarationRange: vscode.Range;
  usageRanges: vscode.Range[];
}

export interface TableInfo {
  name: string;
  usageRanges: vscode.Range[];  // Positions where table name appears
  columns: Set<string>;         // Columns referenced for table
}

export interface TableColumnMap {
  tables: Map<string, TableInfo>;    // Table name -> TableInfo
  measures: Set<string>;             // Measure names
  variables: VariableInfo[];         // Variable metadata
  exclusionRanges: vscode.Range[];   // Ranges to exclude (comments, strings)
}

interface ExclusionRange {
  start: number;
  end: number;
}

export class DaxDocumentParser {
  
  // Find all ranges that should be excluded from parsing
  private findExclusionRanges(text: string): ExclusionRange[] {
    const ranges: ExclusionRange[] = [];
    
    // Find all single-line comments
    const singleLinePattern = /(?:\/\/|--)[^\n]*/g;
    let match;
    while ((match = singleLinePattern.exec(text)) !== null) {
      ranges.push({ start: match.index, end: match.index + match[0].length });
    }
    
    // Find all multi-line comments
    const multiLinePattern = /\/\*[\s\S]*?\*\//g;
    while ((match = multiLinePattern.exec(text)) !== null) {
      ranges.push({ start: match.index, end: match.index + match[0].length });
    }
    
    // Find all string literals
    const stringPattern = /"(?:[^"\\]|\\.)*"/g;
    while ((match = stringPattern.exec(text)) !== null) {
      ranges.push({ start: match.index, end: match.index + match[0].length });
    }
    
    // Sort by start position
    ranges.sort((a, b) => a.start - b.start);
    
    return ranges;
  }
  
  // Check if a position is inside any exclusion range
  private isInExclusionRange(index: number, length: number, exclusionRanges: ExclusionRange[]): boolean {
    for (const range of exclusionRanges) {
      if (index < range.end && index + length > range.start) {
        return true;
      }
    }
    return false;
  }

  // Convert exclusion ranges to vscode.Range
  getExclusionRanges(document: vscode.TextDocument): vscode.Range[] {
    const text = document.getText();
    const exclusionRanges = this.findExclusionRanges(text);
    
    return exclusionRanges.map(range => 
      new vscode.Range(
        document.positionAt(range.start),
        document.positionAt(range.end)
      )
    );
  }
  
  // Check if a position is inside brackets
  private isInsideBrackets(text: string, index: number): boolean {
    const before = text.lastIndexOf("[", index);
    const after = text.lastIndexOf("]", index);
    return before > after && before !== -1;
  }
  
  // Parse all Table[Column] references and track table positions
  parseTableColumns(document: vscode.TextDocument): Map<string, TableInfo> {
    const text = document.getText();
    const tables = new Map<string, TableInfo>();
    const exclusionRanges = this.findExclusionRanges(text);

    // Track positions already added
    const addedPositions = new Set<string>();
    
    // Pattern: TableName[ColumnName] or 'Table Name'[ColumnName]
    // 1: quoted table name, 2: unquoted table name, 3: column name
    const pattern = /(?:'([^']+)'|(\b[A-Z_][A-Z0-9_]*))\s*\[\s*([^\]]+)\s*\]/gi;
    
    let match;
    while ((match = pattern.exec(text)) !== null) {
      // Skip if in exclusion range
      if (this.isInExclusionRange(match.index, match[0].length, exclusionRanges)) {
        continue;
      }
      
      const tableName = (match[1] || match[2]).trim();
      const columnName = match[3].trim();
      
      // Skip empty
      if (!columnName || !tableName) {
        continue;
      }
      
      // Get or create TableInfo
      if (!tables.has(tableName)) {
        tables.set(tableName, {
          name: tableName,
          usageRanges: [],
          columns: new Set()
        });
      }
      
      const tableInfo = tables.get(tableName)!;
      
      // Add column
      tableInfo.columns.add(columnName);
      
      // Calculate the position of table name in the match
      let tableStartIndex: number;
      let tableLength: number;
      
      if (match[1]) {
        // Quoted table name
        tableStartIndex = match.index + 1; // Skip opening quote
        tableLength = match[1].length;
      } else {
        // Unquoted table name
        tableStartIndex = match.index;
        tableLength = match[2].length;
      }
      
      const startPos = document.positionAt(tableStartIndex);
      const endPos = document.positionAt(tableStartIndex + tableLength);
      const range = new vscode.Range(startPos, endPos);

      const posKey = `${startPos.line}:${startPos.character}`;
      if (!addedPositions.has(posKey)) {
        tableInfo.usageRanges.push(range);
        addedPositions.add(posKey);
      }
      
      tableInfo.usageRanges.push(range);
    }

    // Find standalone table references
    for (const [tableName, tableInfo] of tables.entries()) {
      const escapedName = tableName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const pattern = new RegExp(`\\b${escapedName}\\b`, 'gi');
      
      let match;
      while ((match = pattern.exec(text)) !== null) {
        if (this.isInExclusionRange(match.index, match[0].length, exclusionRanges)) {
          continue;
        }
        
        if (this.isInsideBrackets(text, match.index)) {
          continue;
        }
        
        const startPos = document.positionAt(match.index);
        const endPos = document.positionAt(match.index + match[0].length);
        const posKey = `${startPos.line}:${startPos.character}`;
        
        if (!addedPositions.has(posKey)) {
          tableInfo.usageRanges.push(new vscode.Range(startPos, endPos));
          addedPositions.add(posKey);
        }
      }
    }
    
    return tables;
  }
  
  // Parse all [Measure] references
  parseMeasures(document: vscode.TextDocument): Set<string> {
    const text = document.getText();
    const measures = new Set<string>();
    const exclusionRanges = this.findExclusionRanges(text);
    
    // Pattern: [MeasureName] but not preceded by a table name
    const pattern = /\[\s*([^\]]+)\s*\]/g;
    
    let match;
    while ((match = pattern.exec(text)) !== null) {
      // Skip if in exclusion range
      if (this.isInExclusionRange(match.index, match[0].length, exclusionRanges)) {
        continue;
      }
      
      const measureName = match[1].trim();
      
      // Skip empty
      if (!measureName) {
        continue;
      }
      
      // Check if preceded by table name
      let beforeBracket = match.index - 1;
      
      // Skip whitespace
      while (beforeBracket >= 0 && /\s/.test(text[beforeBracket])) {
        beforeBracket--;
      }
      
      // Check if preceded by closing quote '
      if (beforeBracket >= 0 && text[beforeBracket] === "'") {
        continue;
      }
      
      // Check if preceded by word character
      if (beforeBracket >= 0 && /[A-Z0-9_]/i.test(text[beforeBracket])) {
        continue;
      }
      
      measures.add(measureName);
    }
    
    return measures;
  }

  // Parse all variable declarations
  parseVariables(document: vscode.TextDocument): VariableInfo[] {
    const text = document.getText();
    const variables: VariableInfo[] = [];
    const declaredVars = new Map<string, VariableInfo>();
    const exclusionRanges = this.findExclusionRanges(text);
    
    // Pattern: VAR VariableName =
    const varPattern = /\bVAR\s+([A-Z_][A-Z0-9_]*)\s*=/gi;
    
    let match;
    while ((match = varPattern.exec(text)) !== null) {
      // Skip if in exclusion range
      if (this.isInExclusionRange(match.index, match[0].length, exclusionRanges)) {
        continue;
      }
      
      const varName = match[1];
      const varStartIndex = match.index + match[0].indexOf(varName);
      const startPos = document.positionAt(varStartIndex);
      const endPos = document.positionAt(varStartIndex + varName.length);
      const range = new vscode.Range(startPos, endPos);
      
      const varInfo: VariableInfo = {
        name: varName,
        declarationLine: startPos.line,
        declarationRange: range,
        usageRanges: []
      };
      
      declaredVars.set(varName.toUpperCase(), varInfo);
      variables.push(varInfo);
    }
    
    // Pattern: Identifiers that match declared variable names
    const identifierPattern = /\b([A-Z_][A-Z0-9_]*)\b/gi;
    
    while ((match = identifierPattern.exec(text)) !== null) {
      const identifier = match[1];
      const varInfo = declaredVars.get(identifier.toUpperCase());
      
      // Skip if not a declared variable
      if (!varInfo) {
        continue;
      }
      
      // Skip if in exclusion range
      if (this.isInExclusionRange(match.index, match[0].length, exclusionRanges)) {
        continue;
      }
      
      // Skip if inside brackets
      if (this.isInsideBrackets(text, match.index)) {
        continue;
      }
      
      const startPos = document.positionAt(match.index);
      const endPos = document.positionAt(match.index + identifier.length);
      
      // Skip the declaration position
      if (startPos.isEqual(varInfo.declarationRange.start)) {
        continue;
      }
      
      // Check character after identifier (skip function calls)
      const charAfter = text[match.index + identifier.length];
      
      // Skip if followed by = (another declaration? invalid DAX)
      if (charAfter && /[=]/.test(charAfter)) {
        continue;
      }
      
      // Skip if followed by ( (function call)
      let nextNonWhitespace = match.index + identifier.length;
      while (nextNonWhitespace < text.length && /\s/.test(text[nextNonWhitespace])) {
        nextNonWhitespace++;
      }
      if (nextNonWhitespace < text.length && text[nextNonWhitespace] === '(') {
        continue;
      }
      
      varInfo.usageRanges.push(new vscode.Range(startPos, endPos));
    }
    
    return variables;
  }
  
  // Parse everything at once for caching
  parse(document: vscode.TextDocument): TableColumnMap {
    return {
      tables: this.parseTableColumns(document),
      measures: this.parseMeasures(document),
      variables: this.parseVariables(document),
      exclusionRanges: this.getExclusionRanges(document)
    };
  }
}
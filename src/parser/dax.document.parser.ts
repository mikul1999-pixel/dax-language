import * as vscode from 'vscode';

export interface VariableInfo {
  name: string;
  declarationLine: number;
  declarationRange: vscode.Range;
  usageRanges: vscode.Range[];
}

export interface TableColumnMap {
  tables: Map<string, Set<string>>;  // Table -> Set of columns
  measures: Set<string>;             // Measure names
  variables: VariableInfo[];         // Variable metadata
}

export class DaxDocumentParser {
  
  // Parse all Table[Column] references
  parseTableColumns(document: vscode.TextDocument): Map<string, Set<string>> {
    const text = document.getText();
    const tables = new Map<string, Set<string>>();
    
    // Pattern: TableName[ColumnName]
    const pattern = /(?:'([^']+)'|([A-Z_][A-Z0-9_]*))\s*\[\s*([^\]]+)\s*\]/gi;
    
    let match;
    while ((match = pattern.exec(text)) !== null) {
      const tableName = (match[1] || match[2]).trim();
      const columnName = match[3].trim();
      
      // Skip empty
      if (!columnName) {
        continue;
      }
      
      // Add to map
      if (!tables.has(tableName)) {
        tables.set(tableName, new Set());
      }
      tables.get(tableName)!.add(columnName);
    }
    
    return tables;
  }
  
  // Parse all [Measure] references
  parseMeasures(document: vscode.TextDocument): Set<string> {
    const text = document.getText();
    const measures = new Set<string>();
    
    // Pattern: [MeasureName] but not preceded by a table name
    const pattern = /(?<![A-Z_][A-Z0-9_]*)\s*\[\s*([^\]]+)\s*\]/gi;
    
    let match;
    while ((match = pattern.exec(text)) !== null) {
      const measureName = match[1].trim();
      
      // Skip empty
      if (!measureName) {
        continue;
      }
      
      // Skip if it's part of Table[Column]
      const charBeforeMatch = text[match.index - 1];
      if (charBeforeMatch && /[A-Z0-9_]/i.test(charBeforeMatch)) {
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
    
    // Pattern: VAR VariableName =
    const varPattern = /\bVAR\s+([A-Z_][A-Z0-9_]*)\s*=/gi;
    
    let match;
    while ((match = varPattern.exec(text)) !== null) {
      const varName = match[1];
      const startPos = document.positionAt(match.index + 4); // After "VAR "
      const endPos = document.positionAt(match.index + 4 + varName.length);
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
    // But not followed by = or (
    const identifierPattern = /\b([A-Z_][A-Z0-9_]*)\b/gi;
    
    while ((match = identifierPattern.exec(text)) !== null) {
      const identifier = match[1];
      const varInfo = declaredVars.get(identifier.toUpperCase());
      
      // Skip unk
      if (!varInfo) {
        continue;
      }
      
      const startPos = document.positionAt(match.index);
      const endPos = document.positionAt(match.index + identifier.length);
      
      // Skip the declaration position
      if (startPos.isEqual(varInfo.declarationRange.start)) {
        continue;
      }
      
      // Check character after identifier
      const charAfter = text[match.index + identifier.length];
      
      // Skip if followed by =
      if (charAfter && /[=]/.test(charAfter)) {
        continue;
      }
      
      // Skip if followed by (
      let nextNonWhitespace = match.index + identifier.length;
      while (nextNonWhitespace < text.length && /\s/.test(text[nextNonWhitespace])) {
        nextNonWhitespace++;
      }
      if (text[nextNonWhitespace] === '(') {
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
      variables: this.parseVariables(document)
    };
  }
}
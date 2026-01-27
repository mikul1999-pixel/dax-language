import * as vscode from 'vscode';

export interface TableColumnMap {
  tables: Map<string, Set<string>>;  // Table -> Set of columns
  measures: Set<string>;             // Measure names
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
  
  // Parse everything at once for caching
  parse(document: vscode.TextDocument): TableColumnMap {
    return {
      tables: this.parseTableColumns(document),
      measures: this.parseMeasures(document)
    };
  }
}
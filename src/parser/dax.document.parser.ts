import * as vscode from 'vscode';
import { SymbolTable, Symbol, SymbolKind, SymbolMetadata } from '../symbol/dax.symbol.table';

export interface VariableInfo {
  name: string;
  declarationLine: number;
  declarationRange: vscode.Range;
  usageRanges: vscode.Range[];
  parentMeasure?: string;
}

export interface TableInfo {
  name: string;
  usageRanges: vscode.Range[];
  columns: Set<string>;
  scope?: vscode.Range;
}

export interface MeasureInfo {
  name: string;
  declarationRange?: vscode.Range;
  usageRanges: vscode.Range[];
  scope?: vscode.Range;
}

export interface Diagnostic {
  range: vscode.Range;
  message: string;
  severity: 'error' | 'warning' | 'info';
  code?: string;
}

export interface TableColumnMap {
  tables: Map<string, TableInfo>;
  measures: Map<string, MeasureInfo>;
  variables: VariableInfo[];
  exclusionRanges: vscode.Range[];
  diagnostics: Diagnostic[];
}

interface ExclusionRange {
  start: number;
  end: number;
}

interface ScopeBlock {
  type: 'VAR' | 'RETURN';
  index: number;
  position: vscode.Position;
}

export class DaxDocumentParser {
  private symbolTable: SymbolTable;
  
  constructor() {
    this.symbolTable = new SymbolTable();
  }
  
  // Get the symbol table
  getSymbolTable(): SymbolTable {
    return this.symbolTable;
  }
  
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
  parseTableColumns(document: vscode.TextDocument, exclusionRanges: ExclusionRange[], variables: VariableInfo[] = []): Map<string, TableInfo> {
    const text = document.getText();
    const tables = new Map<string, TableInfo>();

    // Create a quick lookup for variable ranges to avoid collisions
    const variableRanges = new Set<string>();
    for (const v of variables) {
      const start = v.declarationRange.start;
      variableRanges.add(`${start.line}:${start.character}`);
      for (const usage of v.usageRanges) {
        variableRanges.add(`${usage.start.line}:${usage.start.character}`);
      }
    }

    // Track positions already added
    const addedPositions = new Set<string>();
    
    // Pattern: TableName[ColumnName] or 'Table Name'[ColumnName]
    // 1: quoted table name, 2: unquoted table name, 3: column name
    const pattern = /(?:'([^']+)'|(\b[A-Z_][A-Z0-9_]*))\[\s*([^\]]+)\s*\]/gi;
    
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
          columns: new Set(),
          scope: new vscode.Range(
            document.positionAt(match.index),
            document.positionAt(match.index + match[0].length)
          )
        });
      }
      
      const tableInfo = tables.get(tableName)!;
      
      // Add column
      tableInfo.columns.add(columnName);
      
      // Calculate table name position
      let tableStartIndex: number;
      let tableLength: number;
      
      if (match[1]) {
        tableStartIndex = match.index + 1;
        tableLength = match[1].length;
      } else {
        tableStartIndex = match.index;
        tableLength = match[2].length;
      }
      
      const tableStartPos = document.positionAt(tableStartIndex);
      const tableEndPos = document.positionAt(tableStartIndex + tableLength);
      const tableRange = new vscode.Range(tableStartPos, tableEndPos);
      
      const tablePosKey = `${tableStartPos.line}:${tableStartPos.character}`;
      if (!addedPositions.has(tablePosKey)) {
        tableInfo.usageRanges.push(tableRange);
        addedPositions.add(tablePosKey);
      }
      
      // Add column to symbol table
      const columnStartIndex = match.index + match[0].indexOf(columnName);
      const columnStartPos = document.positionAt(columnStartIndex);
      const columnEndPos = document.positionAt(columnStartIndex + columnName.length);
      const columnRange = new vscode.Range(columnStartPos, columnEndPos);
      
      if (!this.symbolTable.hasSymbol(columnName, SymbolKind.Column, tableName)) {
        this.symbolTable.addSymbol({
          name: columnName,
          kind: SymbolKind.Column,
          referenceRanges: [columnRange],
          metadata: { tableContext: tableName }
        });
      } else {
        this.symbolTable.addReference(columnName, SymbolKind.Column, columnRange, tableName);
      }
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
        
        // Skip if this is a variable
        if (variableRanges.has(posKey)) {
          continue;
        }

        // Skip if followed by ( (function call) or = measure declaration
        let nextNonWhitespace = match.index + match[0].length;
        while (nextNonWhitespace < text.length && /\s/.test(text[nextNonWhitespace])) {
          nextNonWhitespace++;
        }
        if (nextNonWhitespace < text.length && (text[nextNonWhitespace] === '(' || text[nextNonWhitespace] === '=')) {
          continue;
        }

        if (!addedPositions.has(posKey)) {
          tableInfo.usageRanges.push(new vscode.Range(startPos, endPos));
          addedPositions.add(posKey);
        }
      }
      
      // Add table to symbol table with first reference as scope
      if (!this.symbolTable.hasSymbol(tableName, SymbolKind.Table)) {
        this.symbolTable.addSymbol({
          name: tableName,
          kind: SymbolKind.Table,
          referenceRanges: [...tableInfo.usageRanges],
          scope: tableInfo.scope
        });
      }
    }
    
    return tables;
  }
  
  // Parse measure definitions and references
  parseMeasures(document: vscode.TextDocument, exclusionRanges: ExclusionRange[]): Map<string, MeasureInfo> {
    const text = document.getText();
    const measures = new Map<string, MeasureInfo>();
    
    // Pattern 1: [MeasureName] := expression (measure definition)
    const defPattern1 = /\[\s*([^\]]+)\s*\]\s*:=/g;
    
    let match;
    while ((match = defPattern1.exec(text)) !== null) {
      if (this.isInExclusionRange(match.index, match[0].length, exclusionRanges)) {
        continue;
      }
      
      const measureName = match[1].trim();
      if (!measureName) {continue;}
      
      const measureStartIndex = match.index + 1; // Skip [
      const measureStartPos = document.positionAt(measureStartIndex);
      const measureEndPos = document.positionAt(measureStartIndex + measureName.length);
      const measureRange = new vscode.Range(measureStartPos, measureEndPos);
      
      // Find scope from definition to end of expression
      const nextDefMatch = defPattern1.exec(text);
      const scopeEndIndex = nextDefMatch ? nextDefMatch.index : text.length;
      defPattern1.lastIndex = match.index + match[0].length; // Reset position
      
      const scopeRange = new vscode.Range(
        measureStartPos,
        document.positionAt(scopeEndIndex)
      );
      
      if (!measures.has(measureName)) {
        measures.set(measureName, {
          name: measureName,
          declarationRange: measureRange,
          usageRanges: [],
          scope: scopeRange
        });
      }
    }
    
    // Pattern 2: MEASURE Table[MeasureName] = expression
    const defPattern2 = /\bMEASURE\s+(?:'([^']+)'|([A-Z_][A-Z0-9_]*))\[\s*([^\]]+)\s*\]\s*=/gi;
    
    while ((match = defPattern2.exec(text)) !== null) {
      if (this.isInExclusionRange(match.index, match[0].length, exclusionRanges)) {
        continue;
      }
      
      const measureName = match[3].trim();
      if (!measureName) {continue;}
      
      const measureStartIndex = match.index + match[0].indexOf('[') + 1;
      const measureStartPos = document.positionAt(measureStartIndex);
      const measureEndPos = document.positionAt(measureStartIndex + measureName.length);
      const measureRange = new vscode.Range(measureStartPos, measureEndPos);
      
      // Find scope
      const nextDefMatch = defPattern2.exec(text);
      const scopeEndIndex = nextDefMatch ? nextDefMatch.index : text.length;
      defPattern2.lastIndex = match.index + match[0].length;
      
      const scopeRange = new vscode.Range(
        measureStartPos,
        document.positionAt(scopeEndIndex)
      );
      
      if (!measures.has(measureName)) {
        measures.set(measureName, {
          name: measureName,
          declarationRange: measureRange,
          usageRanges: [],
          scope: scopeRange
        });
      }
    }
    
    // Pattern 3: Standalone [MeasureName] references
    const refPattern = /\[\s*([^\]]+)\s*\]/g;
    
    while ((match = refPattern.exec(text)) !== null) {
      if (this.isInExclusionRange(match.index, match[0].length, exclusionRanges)) {
        continue;
      }
      
      const measureName = match[1].trim();
      if (!measureName) {continue;}
      
      // Check if preceded by table name
      let beforeBracket = match.index - 1;
      while (beforeBracket >= 0 && /\s/.test(text[beforeBracket])) {
        beforeBracket--;
      }
      
      if (beforeBracket >= 0 && text[beforeBracket] === "'") {
        continue; // Part of 'Table'[Column]
      }
      
      if (
        beforeBracket >= 0 &&
        /[A-Z0-9_]/i.test(text[beforeBracket]) &&
        // ensure no whitespace between identifier and '['
        match.index === beforeBracket + 1
      ) {
        continue; // Part of Table[Column]
      }
      
      // Check if followed by := or =
      let afterBracket = match.index + match[0].length;
      while (afterBracket < text.length && /\s/.test(text[afterBracket])) {
        afterBracket++;
      }
      
      if (afterBracket < text.length && text[afterBracket] === ':') {
        continue; // This is a definition [Measure] :=
      }
      
      if (afterBracket < text.length && text[afterBracket] === '=') {
        // Check if it's := or just =
        if (afterBracket > 0 && text[afterBracket - 1] !== ':') {
          continue;
        }
      }
      
      const measureStartIndex = match.index + 1;
      const measureStartPos = document.positionAt(measureStartIndex);
      const measureEndPos = document.positionAt(measureStartIndex + measureName.length);
      const measureRange = new vscode.Range(measureStartPos, measureEndPos);
      
      // Add to existing measure or create new one
      if (!measures.has(measureName)) {
        measures.set(measureName, {
          name: measureName,
          usageRanges: [measureRange]
        });
      } else {
        measures.get(measureName)!.usageRanges.push(measureRange);
      }
    }
    
    // Add all measures to symbol table
    for (const [name, info] of measures.entries()) {
      if (!this.symbolTable.hasSymbol(name, SymbolKind.Measure)) {
        this.symbolTable.addSymbol({
          name: name,
          kind: SymbolKind.Measure,
          declarationRange: info.declarationRange,
          referenceRanges: info.usageRanges,
          scope: info.scope
        });
      }
    }
    
    return measures;
  }

  // Parse all variable declarations
  parseVariables(
    document: vscode.TextDocument, 
    exclusionRanges: ExclusionRange[],
    measures: Map<string, MeasureInfo>
  ): VariableInfo[] {
    const text = document.getText();
    const variables: VariableInfo[] = [];
    const declaredVars = new Map<string, VariableInfo>();
    
    // 1. Find scope blocks. VAR and RETURN keywords
    const scopeBlocks: ScopeBlock[] = [];
    
    const varKeywordPattern = /\bVAR\b/gi;
    let boundaryMatch;
    while ((boundaryMatch = varKeywordPattern.exec(text)) !== null) {
      if (!this.isInExclusionRange(boundaryMatch.index, boundaryMatch[0].length, exclusionRanges)) {
        scopeBlocks.push({ 
          type: 'VAR',
          index: boundaryMatch.index,
          position: document.positionAt(boundaryMatch.index)
        });
      }
    }

    const returnPattern = /\bRETURN\b/gi;
    while ((boundaryMatch = returnPattern.exec(text)) !== null) {
      if (!this.isInExclusionRange(boundaryMatch.index, boundaryMatch[0].length, exclusionRanges)) {
        scopeBlocks.push({ 
          type: 'RETURN',
          index: boundaryMatch.index,
          position: document.positionAt(boundaryMatch.index)
        });
      }
    }
    
    scopeBlocks.sort((a, b) => a.index - b.index);

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
      
      // Determine scope: from this VAR start to the next VAR or RETURN
      const scopeStartPos = document.positionAt(match.index);
      const nextBoundary = scopeBlocks.find(b => b.index > match!.index);
      const scopeEndIndex = nextBoundary ? nextBoundary.index : text.length;
      const scopeEndPos = document.positionAt(scopeEndIndex);
      const scopeRange = new vscode.Range(scopeStartPos, scopeEndPos);

      // Determine parent measure
      let parentMeasure: string | undefined;
      for (const [name, info] of measures.entries()) {
        if (info.scope && info.scope.contains(startPos)) {
          parentMeasure = name;
          break;
        }
      }

      const varInfo: VariableInfo = {
        name: varName,
        declarationLine: startPos.line,
        declarationRange: range,
        usageRanges: [],
        parentMeasure
      };
      
      declaredVars.set(varName.toUpperCase(), varInfo);
      variables.push(varInfo);
      
      // Add to symbol table
      this.symbolTable.addSymbol({
        name: varName,
        kind: SymbolKind.Variable,
        declarationRange: range,
        scope: scopeRange,
        referenceRanges: [],
        metadata: { description: parentMeasure ? `in [${parentMeasure}]` : undefined }
      });
    }
    
    // Find variable usages
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

      // Skip if preceded by ' (quoted table name)
      if (match.index > 0 && text[match.index - 1] === "'") {
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
      
      // Skip if followed by ( (function call) or [ (column reference)
      let nextNonWhitespace = match.index + identifier.length;
      while (nextNonWhitespace < text.length && /\s/.test(text[nextNonWhitespace])) {
        nextNonWhitespace++;
      }
      if (nextNonWhitespace < text.length && (text[nextNonWhitespace] === '(' || text[nextNonWhitespace] === '[')) {
        continue;
      }
      
      const usageRange = new vscode.Range(startPos, endPos);
      varInfo.usageRanges.push(usageRange);
      
      // Add reference to symbol table
      this.symbolTable.addReference(varInfo.name, SymbolKind.Variable, usageRange);
    }
    
    return variables;
  }
  
  // Generate diagnostics
  private generateDiagnostics(
    document: vscode.TextDocument,
    variables: VariableInfo[],
    scopeBlocks: ScopeBlock[]
  ): Diagnostic[] {
    const diagnostics: Diagnostic[] = [];
    
    // 1. Check for unused variables
    for (const varInfo of variables) {
      if (varInfo.usageRanges.length === 0) {
        diagnostics.push({
          range: varInfo.declarationRange,
          message: `Variable '${varInfo.name}' is declared but never used`,
          severity: 'warning',
          code: 'unused-variable'
        });
      }
    }
    
    // 2. Check VAR/RETURN order violations
    // Group scope blocks by their nesting level
    const text = document.getText();
    let currentDepth = 0;
    const varReturnPairs: { vars: ScopeBlock[], returns: ScopeBlock[] }[] = [];
    
    for (const block of scopeBlocks) {
      if (block.type === 'VAR') {
        // Start of a new scope
        if (!varReturnPairs[currentDepth]) {
          varReturnPairs[currentDepth] = { vars: [], returns: [] };
        }
        varReturnPairs[currentDepth].vars.push(block);
      } else if (block.type === 'RETURN') {
        // Check if there are VARs before this RETURN
        if (!varReturnPairs[currentDepth]) {
          varReturnPairs[currentDepth] = { vars: [], returns: [] };
        }
        varReturnPairs[currentDepth].returns.push(block);
        
        // Check for VARs after this RETURN at the same depth
        const subsequentVars = scopeBlocks.filter(
          b => b.type === 'VAR' && b.index > block.index
        );
        
        if (subsequentVars.length > 0) {
          const nextVar = subsequentVars[0];
          
          // If there's a VAR after a RETURN without another RETURN in between
          const returnsBetween = scopeBlocks.filter(
            b => b.type === 'RETURN' && b.index > block.index && b.index < nextVar.index
          );
          
          if (returnsBetween.length === 0) {
            diagnostics.push({
              range: new vscode.Range(nextVar.position, nextVar.position.translate(0, 3)),
              message: 'VAR declaration appears after RETURN statement',
              severity: 'error',
              code: 'var-after-return'
            });
          }
        }
      }
    }
    
    // 3. Check for VARs without corresponding RETURN
    for (const pair of varReturnPairs) {
      if (pair && pair.vars.length > 0 && pair.returns.length === 0) {
        const lastVar = pair.vars[pair.vars.length - 1];
        diagnostics.push({
          range: new vscode.Range(lastVar.position, lastVar.position.translate(0, 3)),
          message: 'VAR declaration without corresponding RETURN statement',
          severity: 'error',
          code: 'missing-return'
        });
      }
    }
    
    return diagnostics;
  }
  
  // Caching
  private cachedUri?: vscode.Uri;
  private cachedVersion?: number;
  private cachedResult?: TableColumnMap;

  parse(document: vscode.TextDocument): TableColumnMap {
    // Return cached if document unchanged
    if (this.cachedUri?.toString() === document.uri.toString() &&
        this.cachedVersion === document.version) {
      return this.cachedResult!;
    }
    
    // Clear all user-defined symbols
    this.symbolTable.clear();
    
    // Get exclusion ranges first
    const text = document.getText();
    const exclusionRanges = this.findExclusionRanges(text);
    
    // Parse in order: measures, then variables, then tables (to handle shadowing)
    const measures = this.parseMeasures(document, exclusionRanges);
    const variables = this.parseVariables(document, exclusionRanges, measures);
    const tables = this.parseTableColumns(document, exclusionRanges, variables);
    
    // Find scope blocks for diagnostics
    const scopeBlocks: ScopeBlock[] = [];
    const varKeywordPattern = /\bVAR\b/gi;
    let match;
    while ((match = varKeywordPattern.exec(text)) !== null) {
      if (!this.isInExclusionRange(match.index, match[0].length, exclusionRanges)) {
        scopeBlocks.push({ 
          type: 'VAR',
          index: match.index,
          position: document.positionAt(match.index)
        });
      }
    }
    const returnPattern = /\bRETURN\b/gi;
    while ((match = returnPattern.exec(text)) !== null) {
      if (!this.isInExclusionRange(match.index, match[0].length, exclusionRanges)) {
        scopeBlocks.push({ 
          type: 'RETURN',
          index: match.index,
          position: document.positionAt(match.index)
        });
      }
    }
    scopeBlocks.sort((a, b) => a.index - b.index);
    
    // Generate diagnostics
    const diagnostics = this.generateDiagnostics(document, variables, scopeBlocks);
    
    // Cache and return
    const result = {
      tables,
      measures,
      variables,
      exclusionRanges: this.getExclusionRanges(document),
      diagnostics
    };
    
    this.cachedUri = document.uri;
    this.cachedVersion = document.version;
    this.cachedResult = result;
    
    return result;
  }
  
  // Method to get diagnostics
  getDiagnostics(document: vscode.TextDocument): Diagnostic[] {
    const result = this.parse(document);
    return result.diagnostics;
  }
}
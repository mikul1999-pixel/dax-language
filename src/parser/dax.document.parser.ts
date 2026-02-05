import * as vscode from 'vscode';
import { VariableInfo, TableInfo, MeasureInfo, FunctionCall, TableColumnMap, ExclusionRange, ScopeBlock } from '../types';
import { SymbolTable, SymbolKind } from '../symbol/dax.symbol.table';
import { findScopeBlocks } from '../diagnostics/dax.diagnostics.scope';
import { runDiagnostics } from '../diagnostics';

const daxFunctions = require('../dax.functions.json');

export class DaxDocumentParser {
  private symbolTable: SymbolTable;
  private cachedUri?: vscode.Uri;
  private cachedVersion?: number;
  private cachedResult?: TableColumnMap;
  
  constructor() {
    this.symbolTable = new SymbolTable();
  }
  
  getSymbolTable(): SymbolTable {
    return this.symbolTable;
  }
  
  // ---------------- Exclusion range ----------------
  
  // Find all ranges to exclude from parsing. comments and strings
  private findExclusionRanges(text: string): ExclusionRange[] {
    const ranges: ExclusionRange[] = [];
    
    // Single line comments
    this.addMatches(ranges, text, /(?:\/\/|--)[^\n]*/g);
    
    // Multi line comments
    this.addMatches(ranges, text, /\/\*[\s\S]*?\*\//g);
    
    // Strings
    this.addMatches(ranges, text, /"(?:[^"\\]|\\.)*"/g);
    
    return ranges.sort((a, b) => a.start - b.start);
  }
  
  // Helper to add regex matches to exclusion ranges
  private addMatches(ranges: ExclusionRange[], text: string, pattern: RegExp): void {
    let match;
    while ((match = pattern.exec(text)) !== null) {
      ranges.push({ start: match.index, end: match.index + match[0].length });
    }
  }
  
  // Check if position overlaps with exclusion range
  private isInExclusionRange(index: number, length: number, exclusionRanges: ExclusionRange[]): boolean {
    const end = index + length;
    return exclusionRanges.some(range => index < range.end && end > range.start);
  }

  // Convert to vscode.range
  getExclusionRanges(document: vscode.TextDocument): vscode.Range[] {
    const exclusionRanges = this.findExclusionRanges(document.getText());
    return exclusionRanges.map(range => 
      new vscode.Range(
        document.positionAt(range.start),
        document.positionAt(range.end)
      )
    );
  }
  
  // --------- Gen helpers ---------
  
  // Check if position is inside brackets
  private isInsideBrackets(text: string, index: number): boolean {
    const lastOpen = text.lastIndexOf("[", index);
    const lastClose = text.lastIndexOf("]", index);
    return lastOpen > lastClose && lastOpen !== -1;
  }

  // Find the next non whitespace character
  private getNextNonWhitespace(text: string, startIndex: number): { char: string; index: number } | null {
    let index = startIndex;
    while (index < text.length && /\s/.test(text[index])) {
      index++;
    }
    return index < text.length ? { char: text[index], index } : null;
  }

  // Strip table constructors { }
  private stripTableConstructors(input: string): string {
    let result = '';
    let braceDepth = 0;
    let inString = false;

    for (let i = 0; i < input.length; i++) {
      const char = input[i];

      if (char === '"') {
        if (inString && input[i + 1] === '"') {
          i++; // Skip escaped quote
          continue;
        }
        inString = !inString;
      }

      if (!inString) {
        if (char === '{') {
          braceDepth++;
          if (braceDepth === 1) {
            result += '{}';
          }
          continue;
        }
        if (char === '}') {
          braceDepth--;
          continue;
        }
      }

      if (braceDepth === 0) {
        result += char;
      }
    }

    return result;
  }
  
  // Create a vscode.Range from text positions
  private createRange(document: vscode.TextDocument, start: number, length: number): vscode.Range {
    return new vscode.Range(
      document.positionAt(start),
      document.positionAt(start + length)
    );
  }

  // Create position key for dedupe
  private createPositionKey(position: vscode.Position): string {
    return `${position.line}:${position.character}`;
  }
  
  // --------- Parsing tables & columns ---------
  
  // Parse Table[Column] + standalone Table
  parseTableColumns(
    document: vscode.TextDocument, 
    exclusionRanges: ExclusionRange[], 
    variables: VariableInfo[] = []
  ): Map<string, TableInfo> {
    const text = document.getText();
    const tables = new Map<string, TableInfo>();
    
    // Create lookup sets
    const variablePositions = this.createVariablePositionSet(variables);
    const addedPositions = new Set<string>();
    
    // Parse Table[Column] patterns
    this.parseTableColumnReferences(document, text, exclusionRanges, tables, addedPositions);
    
    // Parse standalone Table references
    this.parseStandaloneTableReferences(document, text, exclusionRanges, tables, variablePositions, addedPositions);
    
    return tables;
  }

  // Create set of variable positions
  private createVariablePositionSet(variables: VariableInfo[]): Set<string> {
    const positions = new Set<string>();
    for (const v of variables) {
      positions.add(this.createPositionKey(v.declarationRange.start));
      v.usageRanges.forEach(range => positions.add(this.createPositionKey(range.start)));
    }
    return positions;
  }

  // Parse Table[Column] or 'Table Name'[Column] patterns
  private parseTableColumnReferences(
    document: vscode.TextDocument,
    text: string,
    exclusionRanges: ExclusionRange[],
    tables: Map<string, TableInfo>,
    addedPositions: Set<string>
  ): void {
    // Pattern: 'Table Name'[Column] or TableName[Column]
    const pattern = /(?:'([^']+)'|(\b[A-Z_][A-Z0-9_]*))\[\s*([^\]]+)\s*\]/gi;
    let match;
    
    while ((match = pattern.exec(text)) !== null) {
      if (this.isInExclusionRange(match.index, match[0].length, exclusionRanges)) {
        continue;
      }
      
      const tableName = (match[1] || match[2])?.trim();
      const columnName = match[3]?.trim();
      
      if (!tableName || !columnName) {
        continue;
      }
      
      // Get or create table info
      const tableInfo = this.getOrCreateTableInfo(tables, tableName, document, match.index, match[0].length);
      
      // Add column
      tableInfo.columns.add(columnName);
      
      // Add table reference
      const isQuoted = !!match[1];
      const tableStartIndex = match.index + (isQuoted ? 1 : 0);
      const tableLength = (match[1] || match[2]).length;
      const tableRange = this.createRange(document, tableStartIndex, tableLength);
      
      const posKey = this.createPositionKey(tableRange.start);
      if (!addedPositions.has(posKey)) {
        tableInfo.usageRanges.push(tableRange);
        addedPositions.add(posKey);
      }
      
      // Add column to symbol table
      this.addColumnSymbol(document, match, columnName, tableName);
    }
  }

  // Get or create table info
  private getOrCreateTableInfo(
    tables: Map<string, TableInfo>,
    tableName: string,
    document: vscode.TextDocument,
    matchIndex: number,
    matchLength: number
  ): TableInfo {
    if (!tables.has(tableName)) {
      tables.set(tableName, {
        name: tableName,
        usageRanges: [],
        columns: new Set(),
        scope: this.createRange(document, matchIndex, matchLength)
      });
    }
    return tables.get(tableName)!;
  }

  // Add column to symbol table
  private addColumnSymbol(
    document: vscode.TextDocument,
    match: RegExpExecArray,
    columnName: string,
    tableName: string
  ): void {
    const columnStartIndex = match.index + match[0].indexOf(columnName);
    const columnRange = this.createRange(document, columnStartIndex, columnName.length);
    
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

  // Parse standalone table references
  private parseStandaloneTableReferences(
    document: vscode.TextDocument,
    text: string,
    exclusionRanges: ExclusionRange[],
    tables: Map<string, TableInfo>,
    variablePositions: Set<string>,
    addedPositions: Set<string>
  ): void {
    for (const [tableName, tableInfo] of tables.entries()) {
      const pattern = new RegExp(`\\b${this.escapeRegex(tableName)}\\b`, 'gi');
      let match;
      
      while ((match = pattern.exec(text)) !== null) {
        if (this.isInExclusionRange(match.index, match[0].length, exclusionRanges) ||
            this.isInsideBrackets(text, match.index)) {
          continue;
        }
        
        const startPos = document.positionAt(match.index);
        const posKey = this.createPositionKey(startPos);
        
        // Skip if position is variable or already added
        if (variablePositions.has(posKey) || addedPositions.has(posKey)) {
          continue;
        }

        // Skip if followed by ( or =
        const next = this.getNextNonWhitespace(text, match.index + match[0].length);
        if (next && (next.char === '(' || next.char === '=')) {
          continue;
        }

        tableInfo.usageRanges.push(this.createRange(document, match.index, match[0].length));
        addedPositions.add(posKey);
      }
      
      // Add table to symbol table
      if (!this.symbolTable.hasSymbol(tableName, SymbolKind.Table)) {
        this.symbolTable.addSymbol({
          name: tableName,
          kind: SymbolKind.Table,
          referenceRanges: [...tableInfo.usageRanges],
          scope: tableInfo.scope
        });
      }
    }
  }

  // Escape special regex characters
  private escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
  
  // --------- Parsing measures ---------
  
  // Parse measure definitions and references
  parseMeasures(document: vscode.TextDocument, exclusionRanges: ExclusionRange[]): Map<string, MeasureInfo> {
    const text = document.getText();
    const measures = new Map<string, MeasureInfo>();
    
    // Pattern 1: [MeasureName] := 
    this.parseMeasureDefinitions(document, text, exclusionRanges, measures, /\[\s*([^\]]+)\s*\]\s*:=/g);
    
    // Pattern 2: MEASURE Table[MeasureName] = 
    this.parseMeasureDefinitions(
      document, 
      text, 
      exclusionRanges, 
      measures, 
      /\bMEASURE\s+(?:'([^']+)'|([A-Z_][A-Z0-9_]*))\[\s*([^\]]+)\s*\]\s*=/gi,
      true
    );
    
    // Pattern 3: Standalone [MeasureName]
    this.parseMeasureReferences(document, text, exclusionRanges, measures);
    
    // Add measure to symbol table
    this.addMeasuresToSymbolTable(measures);
    
    return measures;
  }

  // Parse measure definitions
  private parseMeasureDefinitions(
    document: vscode.TextDocument,
    text: string,
    exclusionRanges: ExclusionRange[],
    measures: Map<string, MeasureInfo>,
    pattern: RegExp,
    isTableQualified: boolean = false
  ): void {
    let match;
    
    while ((match = pattern.exec(text)) !== null) {
      if (this.isInExclusionRange(match.index, match[0].length, exclusionRanges)) {
        continue;
      }
      
      const measureName = (isTableQualified ? match[3] : match[1])?.trim();
      if (!measureName) {
        continue;
      }
      
      const measureStartIndex = match.index + match[0].indexOf('[') + 1;
      const measureRange = this.createRange(document, measureStartIndex, measureName.length);
      
      // Find scope to next definition or end of text
      const nextMatch = pattern.exec(text);
      const scopeEndIndex = nextMatch ? nextMatch.index : text.length;
      pattern.lastIndex = match.index + match[0].length;
      
      const scopeRange = new vscode.Range(
        measureRange.start,
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
  }

  // Parse standalone [measure] references
  private parseMeasureReferences(
    document: vscode.TextDocument,
    text: string,
    exclusionRanges: ExclusionRange[],
    measures: Map<string, MeasureInfo>
  ): void {
    const pattern = /\[\s*([^\]]+)\s*\]/g;
    let match;
    
    while ((match = pattern.exec(text)) !== null) {
      if (this.isInExclusionRange(match.index, match[0].length, exclusionRanges)) {
        continue;
      }
      
      const measureName = match[1]?.trim();
      if (!measureName) {
        continue;
      }
      
      // Skip if part of Table[Column] or 'Table'[Column]
      if (this.isPrecededByTableName(text, match.index)) {
        continue;
      }
      
      // Skip if definition
      if (this.isFollowedByAssignment(text, match.index + match[0].length)) {
        continue;
      }
      
      const measureRange = this.createRange(document, match.index + 1, measureName.length);
      
      // Add to existing or create new measure
      if (!measures.has(measureName)) {
        measures.set(measureName, {
          name: measureName,
          usageRanges: [measureRange]
        });
      } else {
        measures.get(measureName)!.usageRanges.push(measureRange);
      }
    }
  }

  // Check if bracket is preceded by a table name
  private isPrecededByTableName(text: string, bracketIndex: number): boolean {
    let pos = bracketIndex - 1;
    
    // Skip whitespace
    while (pos >= 0 && /\s/.test(text[pos])) {
      pos--;
    }
    
    // Check for quoted 'Table'[
    if (pos >= 0 && text[pos] === "'") {
      return true;
    }
    
    // Check for unquoted Table[ 
    if (pos >= 0 && /[A-Z0-9_]/i.test(text[pos]) && bracketIndex === pos + 1) {
      return true;
    }
    
    return false;
  }

  // Check if position is followed by := or =
  private isFollowedByAssignment(text: string, startIndex: number): boolean {
    const next = this.getNextNonWhitespace(text, startIndex);
    if (!next) {
      return false;
    }
    
    if (next.char === ':') {
      return true;
    }
    
    if (next.char === '=') {
      return next.index > 0 && text[next.index - 1] !== ':';
    }
    
    return false;
  }

  // Add parsed measures to the symbol table
  private addMeasuresToSymbolTable(measures: Map<string, MeasureInfo>): void {
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
  }
  
  // --------- Parsing vars ---------
  
  // Parse variable declarations and usages
  parseVariables(
    document: vscode.TextDocument, 
    exclusionRanges: ExclusionRange[],
    measures: Map<string, MeasureInfo>
  ): VariableInfo[] {
    const text = document.getText();
    const variables: VariableInfo[] = [];
    const declaredVars = new Map<string, VariableInfo>();
    
    // Find scope blocks. VAR and RETURN
    const scopeBlocks = this.findScopeBlocks(document, text, exclusionRanges);
    
    // Parse declarations
    this.parseVariableDeclarations(document, text, exclusionRanges, scopeBlocks, measures, variables, declaredVars);
    
    // Parse usages
    this.parseVariableUsages(document, text, exclusionRanges, declaredVars);
    
    return variables;
  }

  // Find VAR and RETURN scope blocks
  private findScopeBlocks(
    document: vscode.TextDocument,
    text: string,
    exclusionRanges: ExclusionRange[]
  ): ScopeBlock[] {
    const scopeBlocks: ScopeBlock[] = [];
    
    this.addScopeBlocks(scopeBlocks, document, text, exclusionRanges, /\bVAR\b/gi, 'VAR');
    this.addScopeBlocks(scopeBlocks, document, text, exclusionRanges, /\bRETURN\b/gi, 'RETURN');
    
    return scopeBlocks.sort((a, b) => a.index - b.index);
  }

  // Add scope blocks
  private addScopeBlocks(
    scopeBlocks: ScopeBlock[],
    document: vscode.TextDocument,
    text: string,
    exclusionRanges: ExclusionRange[],
    pattern: RegExp,
    type: 'VAR' | 'RETURN'
  ): void {
    let match;
    while ((match = pattern.exec(text)) !== null) {
      if (!this.isInExclusionRange(match.index, match[0].length, exclusionRanges)) {
        scopeBlocks.push({ 
          type,
          index: match.index,
          position: document.positionAt(match.index)
        });
      }
    }
  }

  // Parse variable declarations. VAR VariableName = ...
  private parseVariableDeclarations(
    document: vscode.TextDocument,
    text: string,
    exclusionRanges: ExclusionRange[],
    scopeBlocks: ScopeBlock[],
    measures: Map<string, MeasureInfo>,
    variables: VariableInfo[],
    declaredVars: Map<string, VariableInfo>
  ): void {
    const pattern = /\bVAR\s+([A-Z_][A-Z0-9_]*)\s*=/gi;
    let match;
    
    while ((match = pattern.exec(text)) !== null) {
      if (this.isInExclusionRange(match.index, match[0].length, exclusionRanges)) {
        continue;
      }
      
      const varName = match[1];
      const varStartIndex = match.index + match[0].indexOf(varName);
      const declarationRange = this.createRange(document, varStartIndex, varName.length);
      
      // Determine scope
      const scopeStartPos = document.positionAt(match.index);
      const nextBoundary = scopeBlocks.find(b => b.index > match.index);
      const scopeEndIndex = nextBoundary ? nextBoundary.index : text.length;
      const scopeRange = new vscode.Range(scopeStartPos, document.positionAt(scopeEndIndex));

      // Find parent measure
      const parentMeasure = this.findParentMeasure(measures, declarationRange.start);

      const varInfo: VariableInfo = {
        name: varName,
        declarationLine: declarationRange.start.line,
        declarationRange,
        usageRanges: [],
        parentMeasure
      };
      
      declaredVars.set(varName.toUpperCase(), varInfo);
      variables.push(varInfo);
      
      // Add to symbol table
      this.symbolTable.addSymbol({
        name: varName,
        kind: SymbolKind.Variable,
        declarationRange,
        scope: scopeRange,
        referenceRanges: [],
        metadata: { description: parentMeasure ? `in [${parentMeasure}]` : undefined }
      });
    }
  }

  // Find the parent measure
  private findParentMeasure(measures: Map<string, MeasureInfo>, position: vscode.Position): string | undefined {
    for (const [name, info] of measures.entries()) {
      if (info.scope?.contains(position)) {
        return name;
      }
    }
    return undefined;
  }

  // Parse variable usages
  private parseVariableUsages(
    document: vscode.TextDocument,
    text: string,
    exclusionRanges: ExclusionRange[],
    declaredVars: Map<string, VariableInfo>
  ): void {
    const pattern = /\b([A-Z_][A-Z0-9_]*)\b/gi;
    let match;
    
    while ((match = pattern.exec(text)) !== null) {
      const identifier = match[1];
      const varInfo = declaredVars.get(identifier.toUpperCase());
      
      if (!varInfo || 
          this.isInExclusionRange(match.index, match[0].length, exclusionRanges) ||
          this.isInsideBrackets(text, match.index) ||
          this.isPrecededByQuote(text, match.index)) {
        continue;
      }
      
      const usageRange = this.createRange(document, match.index, identifier.length);
      
      // Skip the declaration itself
      if (usageRange.start.isEqual(varInfo.declarationRange.start)) {
        continue;
      }
      
      // Skip if followed by =, (, or [
      const next = this.getNextNonWhitespace(text, match.index + identifier.length);
      if (next && /[=(\[]/.test(next.char)) {
        continue;
      }
      
      varInfo.usageRanges.push(usageRange);
      this.symbolTable.addReference(varInfo.name, SymbolKind.Variable, usageRange);
    }
  }

  // Check if position is preceded by a single quote
  private isPrecededByQuote(text: string, index: number): boolean {
    return index > 0 && text[index - 1] === "'";
  }
  
  // --------- Parsing functions ---------
  
  // Parse all function calls with parameter counting
  parseFunctionCalls(
    document: vscode.TextDocument,
    exclusionRanges: ExclusionRange[]
  ): FunctionCall[] {
    const text = document.getText();
    const functionCalls: FunctionCall[] = [];
    const knownFunctions = new Set(daxFunctions.map((f: any) => f.name));
    const pattern = /\b([A-Z_][A-Z0-9_.]*)\s*\(/gi;
    
    let match;
    while ((match = pattern.exec(text)) !== null) {
      const functionName = match[1].toUpperCase();
      
      if (!knownFunctions.has(functionName) || 
          this.isInExclusionRange(match.index, match[0].length, exclusionRanges)) {
        continue;
      }

      const openParenIndex = match.index + match[0].length - 1;
      const closeParenIndex = this.findMatchingCloseParen(text, openParenIndex, exclusionRanges);
      
      if (closeParenIndex === -1) {
        continue; // Malformed call
      }

      const parameterCount = this.countParameters(text, openParenIndex, closeParenIndex);
      const functionRange = this.createRange(document, match.index, match[1].length);

      functionCalls.push({
        name: functionName,
        parameterCount,
        range: [functionRange]
      });
    }

    return functionCalls;
  }

  // Find the closing parens
  private findMatchingCloseParen(text: string, openIndex: number, exclusionRanges: ExclusionRange[]): number {
    let depth = 1;
    let index = openIndex + 1;

    while (index < text.length) {
      // Skip exclusion ranges
      const inExclusion = exclusionRanges.find(r => index >= r.start && index < r.end);
      if (inExclusion) {
        index = inExclusion.end;
        continue;
      }

      const char = text[index];
      if (char === '(') {
        depth++;
      } else if (char === ')') {
        depth--;
        if (depth === 0) {
          return index;
        }
      }
      index++;
    }

    return -1;
  }

  // Count parameters. handle nested calls and table constructors
  private countParameters(text: string, openParenIndex: number, closeParenIndex: number): number {
    const rawArgs = text.substring(openParenIndex + 1, closeParenIndex);
    const sanitizedArgs = this.stripTableConstructors(rawArgs).trim();

    if (sanitizedArgs.length === 0) {
      return 0;
    }

    let commaCount = 0;
    let parenDepth = 0;
    let inString = false;

    for (const char of sanitizedArgs) {
      if (char === '"') {
        inString = !inString;
        continue;
      }

      if (inString) {
        continue;
      }

      if (char === '(') {
        parenDepth++;
      } else if (char === ')') {
        parenDepth--;
      } else if (char === ',' && parenDepth === 0) {
        commaCount++;
      }
    }

    return commaCount + 1;
  }
  
  // --------- Execute parse & cache ---------
  
  // Parse the entire document
  parse(document: vscode.TextDocument): TableColumnMap {
    // Return cached result if document unchanged
    if (this.cachedUri?.toString() === document.uri.toString() &&
        this.cachedVersion === document.version) {
      return this.cachedResult!;
    }
    
    // Clear symbol table
    this.symbolTable.clear();
    
    // Get exclusion ranges
    const text = document.getText();
    const exclusionRanges = this.findExclusionRanges(text);
    
    // Parse order: measures,variables,tables,functions
    const measures = this.parseMeasures(document, exclusionRanges);
    const variables = this.parseVariables(document, exclusionRanges, measures);
    const tables = this.parseTableColumns(document, exclusionRanges, variables);
    const functionCalls = this.parseFunctionCalls(document, exclusionRanges);
    
    // Build result
    const result: TableColumnMap = {
      tables,
      measures,
      variables,
      exclusionRanges: this.getExclusionRanges(document),
      diagnostics: [],
      functionCalls
    };

    // Run diagnostics
    const scopeBlocks = findScopeBlocks(document, exclusionRanges);
    result.diagnostics = runDiagnostics(document, result, scopeBlocks); 
    
    // Cache result
    this.cachedUri = document.uri;
    this.cachedVersion = document.version;
    this.cachedResult = result;
    
    return result;
  }
}
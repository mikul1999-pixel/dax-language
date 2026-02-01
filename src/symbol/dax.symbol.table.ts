import * as vscode from 'vscode';

export enum SymbolKind {
  Variable = 'variable',
  Table = 'table',
  Column = 'column',
  Measure = 'measure'
}

export interface Parameter {
  name: string;
  type?: string;
  optional?: boolean;
}

export interface SymbolMetadata {
  tableContext?: string;
  description?: string;
}

export interface Symbol {
  name: string;
  kind: SymbolKind;
  declarationRange?: vscode.Range;
  referenceRanges: vscode.Range[];
  scope?: vscode.Range; // For variables: VAR to RETURN block
  metadata?: SymbolMetadata;
  children?: Symbol[];
  parent?: Symbol;
}

export class SymbolTable {
  private symbols: Map<string, Symbol> = new Map();
  
  constructor() {}
  
  // Add or update symbol
  addSymbol(symbol: Symbol): void {
    const key = this.getKey(symbol.name, symbol.kind, symbol.metadata?.tableContext);
    this.symbols.set(key, symbol);

    // Handle hierarchy for Table and Column
    if (symbol.kind === SymbolKind.Column && symbol.metadata?.tableContext) {
      const tableSymbol = this.getSymbol(symbol.metadata.tableContext, SymbolKind.Table);
      if (tableSymbol) {
        this.linkParentChild(tableSymbol, symbol);
      }
    } else if (symbol.kind === SymbolKind.Table) {
      // Check for existing columns that belong to table
      for (const s of this.symbols.values()) {
        if (s.kind === SymbolKind.Column && 
            s.metadata?.tableContext?.toUpperCase() === symbol.name.toUpperCase()) {
          this.linkParentChild(symbol, s);
        }
      }
    }
  }

  private linkParentChild(parent: Symbol, child: Symbol): void {
    if (!parent.children) {
      parent.children = [];
    }
    if (!parent.children.includes(child)) {
      parent.children.push(child);
    }
    child.parent = parent;
  }
  
  // Get symbol by name and kind
  getSymbol(name: string, kind?: SymbolKind, tableContext?: string): Symbol | undefined {
    if (kind) {
      return this.symbols.get(this.getKey(name, kind, tableContext));
    }
    // Search all kinds if not specified
    for (const symbol of this.symbols.values()) {
      if (symbol.name.toUpperCase() === name.toUpperCase()) {
        return symbol;
      }
    }
    return undefined;
  }
  
  // Get all symbols of a specific kind
  getSymbolsByKind(kind: SymbolKind): Symbol[] {
    return Array.from(this.symbols.values()).filter(s => s.kind === kind);
  }
  
  // Get all symbols
  getAllSymbols(): Symbol[] {
    return Array.from(this.symbols.values());
  }
  
  // Get top-level symbols (symbols without a parent)
  getRootSymbols(): Symbol[] {
    return Array.from(this.symbols.values()).filter(symbol => !symbol.parent);
  }
  
  // Find symbol at a specific position
  getSymbolAtPosition(position: vscode.Position): Symbol | undefined {
    for (const symbol of this.symbols.values()) {
      // Check declaration
      if (symbol.declarationRange?.contains(position)) {
        return symbol;
      }
      
      // Check references
      for (const ref of symbol.referenceRanges) {
        if (ref.contains(position)) {
          return symbol;
        }
      }
    }
    return undefined;
  }
  
  // Add a reference to existing symbol
  addReference(name: string, kind: SymbolKind, range: vscode.Range, tableContext?: string): void {
    const key = this.getKey(name, kind, tableContext);
    const symbol = this.symbols.get(key);
    if (symbol) {
      symbol.referenceRanges.push(range);
    }
  }
  
  // Clear all symbols to re parse
  clear(): void {
    this.symbols.clear();
  }
  
  // Generate unique key for symbol lookup
  private getKey(name: string, kind: SymbolKind, tableContext?: string): string {
    if (kind === SymbolKind.Column && tableContext) {
      return `${kind}:${tableContext.toUpperCase()}:${name.toUpperCase()}`;
    }
    return `${kind}:${name.toUpperCase()}`;
  }
  
  // Check if symbol exists
  hasSymbol(name: string, kind: SymbolKind, tableContext?: string): boolean {
    return this.symbols.has(this.getKey(name, kind, tableContext));
  }
}

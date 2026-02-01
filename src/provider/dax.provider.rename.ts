import * as vscode from 'vscode';
import { DaxDocumentParser } from '../parser/dax.document.parser';
import { SymbolKind } from '../symbol/dax.symbol.table';

export class DaxRenameProvider implements vscode.RenameProvider {
  constructor(private parser: DaxDocumentParser) {}

  provideRenameEdits(
    document: vscode.TextDocument,
    position: vscode.Position,
    newName: string,
    token: vscode.CancellationToken
  ): vscode.ProviderResult<vscode.WorkspaceEdit> {
    
    // Parse document so symbol table is up to date
    this.parser.parse(document);
    
    const symbolTable = this.parser.getSymbolTable();
    const symbol = symbolTable.getSymbolAtPosition(position);
    
    if (!symbol) {
      return undefined;
    }
    
    // Only allow renaming user-defined symbols (variables)
    if (symbol.kind !== SymbolKind.Variable) {
      vscode.window.showWarningMessage(
        `Cannot rename ${symbol.kind}s. Only variables can be renamed.`
      );
      return undefined;
    }
    
    if (!symbol.declarationRange) {
      return undefined;
    }
    
    const workspaceEdit = new vscode.WorkspaceEdit();
    
    // Rename at declaration
    workspaceEdit.replace(document.uri, symbol.declarationRange, newName);
    
    // Rename at all references
    for (const range of symbol.referenceRanges) {
      workspaceEdit.replace(document.uri, range, newName);
    }
    
    return workspaceEdit;
  }
  
  // Provide prepare rename to show range being renamed
  prepareRename(
    document: vscode.TextDocument,
    position: vscode.Position,
    token: vscode.CancellationToken
  ): vscode.ProviderResult<vscode.Range | { range: vscode.Range; placeholder: string }> {
    
    this.parser.parse(document);
    
    const symbolTable = this.parser.getSymbolTable();
    const symbol = symbolTable.getSymbolAtPosition(position);
    
    if (!symbol || symbol.kind !== SymbolKind.Variable || !symbol.declarationRange) {
      throw new Error('Cannot rename this symbol');
    }
    
    // Find which range was clicked (declaration or reference)
    let targetRange: vscode.Range | undefined;
    
    if (symbol.declarationRange.contains(position)) {
      targetRange = symbol.declarationRange;
    } else {
      targetRange = symbol.referenceRanges.find(range => range.contains(position));
    }
    
    if (!targetRange) {
      throw new Error('Cannot rename this symbol');
    }
    
    return {
      range: targetRange,
      placeholder: symbol.name
    };
  }
}
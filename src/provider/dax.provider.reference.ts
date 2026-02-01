import * as vscode from 'vscode';
import { DaxDocumentParser } from '../parser/dax.document.parser';

export class DaxReferenceProvider implements vscode.ReferenceProvider {
  constructor(private parser: DaxDocumentParser) {}

  provideReferences(
    document: vscode.TextDocument,
    position: vscode.Position,
    context: vscode.ReferenceContext,
    token: vscode.CancellationToken
  ): vscode.ProviderResult<vscode.Location[]> {
    
    // Parse document so symbol table is up to date
    this.parser.parse(document);
    
    const symbolTable = this.parser.getSymbolTable();
    const symbol = symbolTable.getSymbolAtPosition(position);
    
    if (!symbol) {
      return [];
    }
    
    const locations: vscode.Location[] = [];
    
    // Add declaration if exists and context requests it
    if (context.includeDeclaration && symbol.declarationRange) {
      locations.push(new vscode.Location(document.uri, symbol.declarationRange));
    }
    
    // Add all references
    for (const range of symbol.referenceRanges) {
      locations.push(new vscode.Location(document.uri, range));
    }
    
    return locations;
  }
}
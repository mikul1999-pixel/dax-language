import * as vscode from 'vscode';
import { DaxDocumentParser } from '../parser/dax.document.parser';

export class DaxDefinitionProvider implements vscode.DefinitionProvider {
  constructor(private parser: DaxDocumentParser) {}

  provideDefinition(
    document: vscode.TextDocument,
    position: vscode.Position,
    token: vscode.CancellationToken
  ): vscode.ProviderResult<vscode.Definition | vscode.LocationLink[]> {
    
    // Parse document so symbol table is up to date
    this.parser.parse(document);
    
    const symbolTable = this.parser.getSymbolTable();
    const symbol = symbolTable.getSymbolAtPosition(position);
    
    if (!symbol) {
      return undefined;
    }
    
    // Skip if no declaration
    if (!symbol.declarationRange) {
      return undefined;
    }
    
    // Return declaration location
    return new vscode.Location(document.uri, symbol.declarationRange);
  }
}
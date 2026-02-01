import * as vscode from 'vscode';
import { DaxDocumentParser } from '../parser/dax.document.parser';
import { SymbolKind } from '../symbol/dax.symbol.table';

const daxFunctions = require('../dax.functions.json');
const daxKeywords = require('../dax.keywords.json');

export class DaxHoverProvider implements vscode.HoverProvider {
  constructor(private parser: DaxDocumentParser) {}

  provideHover(
    document: vscode.TextDocument,
    position: vscode.Position,
    token: vscode.CancellationToken
  ): vscode.ProviderResult<vscode.Hover> {
    
    // Get word at current position
    const wordRange = document.getWordRangeAtPosition(position);
    if (!wordRange) {
      return null;
    }
    const word = document.getText(wordRange).toUpperCase();
    
    // Check user defined symbols
    this.parser.parse(document);
    const symbolTable = this.parser.getSymbolTable();
    const symbol = symbolTable.getSymbolAtPosition(position);
    
    if (symbol) {
      const markdown = new vscode.MarkdownString();
      markdown.isTrusted = true;
      
      switch (symbol.kind) {
        case SymbolKind.Variable:
          markdown.appendCodeblock(`(variable) VAR ${symbol.name} = ...`, 'dax');
          if (symbol.declarationRange) {
            markdown.appendMarkdown(`\n*Declared on line ${symbol.declarationRange.start.line + 1}*\n`);
          }
          const refCount = symbol.referenceRanges.length;
          if (refCount > 0) {
            markdown.appendMarkdown(`· *${refCount} reference${refCount === 1 ? '' : 's'}*\n`);
          }
          return new vscode.Hover(markdown);
          
        case SymbolKind.Table:
          markdown.appendCodeblock(`(table) ${symbol.name}`, 'dax');
          const tableRefCount = symbol.referenceRanges.length;
          if (tableRefCount > 0) {
            markdown.appendMarkdown(`*${tableRefCount} reference${tableRefCount === 1 ? '' : 's'}*\n`);
          }
          return new vscode.Hover(markdown);
          
        case SymbolKind.Column:
          const displayName = symbol.metadata?.tableContext 
            ? `${/\s/.test(symbol.metadata.tableContext) ? `'${symbol.metadata.tableContext}'` : symbol.metadata.tableContext}[${symbol.name}]`
            : `[${symbol.name}]`;
          markdown.appendCodeblock(`(column) ${displayName}`, 'dax');
          return new vscode.Hover(markdown);
          
        case SymbolKind.Measure:
          markdown.appendCodeblock(`(measure) [${symbol.name}]`, 'dax');
          return new vscode.Hover(markdown);
      }
    }
    
    // Check if it's a built-in function
    const functionInfo = daxFunctions.find((fn: any) => fn.name === word);
    if (functionInfo) {
      // Check if followed by ( to confirm it's a function call
      const textAfterWord = document.getText(
        new vscode.Range(wordRange.end, document.lineAt(wordRange.end.line).range.end)
      );
      
      if (/^\s*\(/.test(textAfterWord)) {
        const markdown = new vscode.MarkdownString();
        markdown.isTrusted = true;
        markdown.appendCodeblock(`${functionInfo.syntax} -> ${functionInfo.returns}`, 'dax');
        markdown.appendMarkdown(`\n*function* · ${functionInfo.group}\n\n`);
        markdown.appendMarkdown(`${functionInfo.description}\n\n`);
        return new vscode.Hover(markdown);
      }
    }

    // Check if it's a keyword
    const keywordInfo = daxKeywords.find((kw: any) => kw.name === word);
    if (keywordInfo) {
      const markdown = new vscode.MarkdownString();
      markdown.isTrusted = true;
      markdown.appendCodeblock(`${keywordInfo.syntax}`, 'dax');
      markdown.appendMarkdown(`\n*keyword* · ${keywordInfo.kind}\n\n`);
      markdown.appendMarkdown(`${keywordInfo.description}\n\n`);
      return new vscode.Hover(markdown);
    }
    
    return null;
  }
}
import * as vscode from 'vscode';
import { DaxCompletionProvider } from './provider/dax.provider.completion';
import { DaxHoverProvider } from './provider/dax.provider.hover';
import { DaxDocumentParser } from './parser/dax.document.parser';
import { DaxSemanticTokenProvider } from './provider/dax.provider.token';

export function activate(context: vscode.ExtensionContext) {
  console.log('DAX Language Syntax is now active');

  const parser = new DaxDocumentParser();
  
  // Register completion provider
  const completionClass = new DaxCompletionProvider(parser);
  const completionProvider = vscode.languages.registerCompletionItemProvider(
    { scheme: 'file', language: 'dax' },
    completionClass,
    // Trigger characters
    '(', '[', ',', ' ', ':'
  );
  
  // Register hover provider
  const hoverProvider = vscode.languages.registerHoverProvider(
    { scheme: 'file', language: 'dax' },
    new DaxHoverProvider()
  );

  // Register the semantic token provider
  const semanticTokenProvider = vscode.languages.registerDocumentSemanticTokensProvider(
    { scheme: 'file', language: 'dax' },
    new DaxSemanticTokenProvider(parser),
    DaxSemanticTokenProvider.legend
  );
  
  context.subscriptions.push(completionProvider, hoverProvider, semanticTokenProvider);

  // Register expand parameters command
  context.subscriptions.push(
    vscode.commands.registerCommand('dax.expandParameters', () => {
      completionClass.expandParameters();
    })
  );

  // Register parameter hint command
  context.subscriptions.push(
    vscode.commands.registerCommand('dax.showParameterHint', 
      (syntax: string, functionName: string) => {
        completionClass.showParameterHint(syntax, functionName);
      }
    )
  );
}

export function deactivate() {
  console.log('DAX Language Syntax is now deactivated');
}
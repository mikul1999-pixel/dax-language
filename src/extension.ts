import * as vscode from 'vscode';
import { DaxCompletionProvider } from './dax.provider.completion';
import { DaxHoverProvider } from './dax.provider.hover';

export function activate(context: vscode.ExtensionContext) {
  console.log('DAX Language Syntax is now active');
  
  // Register completion provider
  const completionClass = new DaxCompletionProvider();
  const completionProvider = vscode.languages.registerCompletionItemProvider(
    { scheme: 'file', language: 'dax' },
    completionClass,
    // Trigger characters
    '(', ',', ' ', ':'
  );
  
  // Register hover provider
  const hoverProvider = vscode.languages.registerHoverProvider(
    { scheme: 'file', language: 'dax' },
    new DaxHoverProvider()
  );
  
  context.subscriptions.push(completionProvider, hoverProvider);

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
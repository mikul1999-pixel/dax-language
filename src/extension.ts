import * as vscode from 'vscode';
import { DaxCompletionProvider } from './dax.provider.completion';
import { DaxHoverProvider } from './dax.provider.hover';

export function activate(context: vscode.ExtensionContext) {
  console.log('DAX Language Syntax is now active');
  
  // Register completion provider
  const completionProvider = vscode.languages.registerCompletionItemProvider(
    { scheme: 'file', language: 'dax' },
    new DaxCompletionProvider(),
    // Trigger characters
    '(', ',', ' '
  );
  
  // Register hover provider
  const hoverProvider = vscode.languages.registerHoverProvider(
    { scheme: 'file', language: 'dax' },
    new DaxHoverProvider()
  );
  
  context.subscriptions.push(completionProvider, hoverProvider);
}

export function deactivate() {
  console.log('DAX Language Syntax is now deactivated');
}
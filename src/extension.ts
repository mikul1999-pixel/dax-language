import * as vscode from 'vscode';
import { DaxCompletionProvider } from './provider/dax.provider.completion';
import { DaxHoverProvider } from './provider/dax.provider.hover';
import { DaxSignatureHelpProvider } from './provider/dax.provider.signature';
import { DaxDocumentParser } from './parser/dax.document.parser';
import { DaxSemanticTokenProvider } from './provider/dax.provider.token';
import { DaxDefinitionProvider } from './provider/dax.provider.definition';
import { DaxReferenceProvider } from './provider/dax.provider.reference';
import { DaxRenameProvider } from './provider/dax.provider.rename';

export function activate(context: vscode.ExtensionContext) {
  console.log('DAX Language is now active');

  const daxSelector: vscode.DocumentSelector = { language: 'dax', scheme: 'file' };
  const parser = new DaxDocumentParser();
  
  // Register completion provider
  const completionClass = new DaxCompletionProvider(parser);
  const completionProvider = vscode.languages.registerCompletionItemProvider(
    daxSelector,
    completionClass,
    // Trigger characters
    '(', '[', ',', ' ', ':'
  );
  
  // Register hover provider
  const hoverProvider = vscode.languages.registerHoverProvider(
    daxSelector,
    new DaxHoverProvider(parser)
  );

  // Register signature provider
  const sigProvider = vscode.languages.registerSignatureHelpProvider(
    daxSelector,
    new DaxSignatureHelpProvider(),
    '(', ','
  );

  // Register the semantic token provider
  const semanticTokenProvider = vscode.languages.registerDocumentSemanticTokensProvider(
    daxSelector,
    new DaxSemanticTokenProvider(parser),
    DaxSemanticTokenProvider.legend
  );

  // Register definition provider
  const definitionProvider = vscode.languages.registerDefinitionProvider(
    daxSelector,
    new DaxDefinitionProvider(parser)
  );
  
  // Register reference provider
  const referenceProvider = vscode.languages.registerReferenceProvider(
    daxSelector,
    new DaxReferenceProvider(parser)
  );
  
  // Register rename provider
  const renameProvider = vscode.languages.registerRenameProvider(
    daxSelector,
    new DaxRenameProvider(parser)
  );
  
  context.subscriptions.push(
    completionProvider, 
    sigProvider, 
    hoverProvider, 
    semanticTokenProvider,
    definitionProvider,
    referenceProvider,
    renameProvider
  );

}

export function deactivate() {
  console.log('DAX Language is now deactivated');
}
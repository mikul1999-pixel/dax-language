import * as vscode from 'vscode';

const daxFunctions = require('./dax.functions.json');
const daxKeywords = require('./dax.keywords.json');

export class DaxCompletionProvider implements vscode.CompletionItemProvider {
  
  provideCompletionItems(
    document: vscode.TextDocument,
    position: vscode.Position,
    token: vscode.CancellationToken,
    context: vscode.CompletionContext
  ): vscode.ProviderResult<vscode.CompletionItem[] | vscode.CompletionList> {
    
    const completionItems: vscode.CompletionItem[] = [];
    
    // Add function completions
    daxFunctions.forEach((fn: any) => {
      const item = new vscode.CompletionItem(fn.name, vscode.CompletionItemKind.Function);
      
      // Set description
      item.detail = `${fn.group} - ${fn.returns}`;
      
      // Set full documentation
      const documentation = new vscode.MarkdownString();
      documentation.appendMarkdown(`**${fn.name}**\n\n`);
      documentation.appendMarkdown(`${fn.description}\n\n`);
      documentation.appendMarkdown(`**Syntax:**\n\`\`\`dax\n${fn.syntax}\n\`\`\`\n\n`);
      documentation.appendMarkdown(`**Returns:** ${fn.returns}\n\n`);
      documentation.appendMarkdown(`**Category:** ${fn.group}`);
      item.documentation = documentation;
      
      // Create snippet for function with parameters
      const snippet = this.createFunctionSnippet(fn.syntax, fn.name);
      item.insertText = snippet;
      
      // Sort order
      item.sortText = `1_${fn.name}`;
      
      completionItems.push(item);
    });
    
    // Add keyword completions
    daxKeywords.forEach((kw: any) => {
      const item = new vscode.CompletionItem(kw.name, vscode.CompletionItemKind.Keyword);
      
      item.detail = 'Keyword';
      
      const documentation = new vscode.MarkdownString();
      documentation.appendMarkdown(`**${kw.name}**\n\n`);
      documentation.appendMarkdown(`${kw.description}\n\n`);
      if (kw.syntax) {
        documentation.appendMarkdown(`**Syntax:**\n\`\`\`dax\n${kw.syntax}\n\`\`\`\n`);
      }
      item.documentation = documentation;
      
      // Keywords appear first
      item.sortText = `0_${kw.name}`;
      
      completionItems.push(item);
    });
    
    return completionItems;
  }
  
  // Create snippet from function syntax
  // Converts: "SUM(<column>)" --> "SUM(${1:column})"
  private createFunctionSnippet(syntax: string, functionName: string): vscode.SnippetString {
    // Extract everything after function name
    const match = syntax.match(/\((.*)\)/);
    
    if (!match) {
      // No parameters, just add empty parens
      return new vscode.SnippetString(`${functionName}($0)`);
    }
    
    const params = match[1];
    
    // Split by commas
    const paramList = this.splitParameters(params);
    
    // Create placeholders for each parameter
    let snippetString = `${functionName}(`;
    paramList.forEach((param, index) => {
      // Clean up parameter (remove < >)
      const cleanParam = param
        .replace(/^<|>$/g, '')
        .replace(/^\[|\]$/g, '')
        .trim();
      
      if (index > 0) {
        snippetString += ', ';
      }
      
      // Add as a placeholder
      snippetString += `\${${index + 1}:${cleanParam}}`;
    });
    snippetString += ')$0';
    
    return new vscode.SnippetString(snippetString);
  }
  
  // Split parameters by comma, keep nested brackets
  private splitParameters(params: string): string[] {
    const result: string[] = [];
    let current = '';
    let depth = 0;
    
    for (let i = 0; i < params.length; i++) {
      const char = params[i];
      
      if (char === '<' || char === '[') {
        depth++;
      } else if (char === '>' || char === ']') {
        depth--;
      }
      
      if (char === ',' && depth === 0) {
        result.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    
    if (current.trim()) {
      result.push(current.trim());
    }
    
    return result.filter(p => p.length > 0);
  }
}
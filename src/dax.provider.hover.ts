import * as vscode from 'vscode';

const daxFunctions = require('./dax.functions.json');
const daxKeywords = require('./dax.keywords.json');

export class DaxHoverProvider implements vscode.HoverProvider {
  
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
    
    // Check if it's a function
    const functionInfo = daxFunctions.find((fn: any) => fn.name === word);
    if (functionInfo) {
      const markdown = new vscode.MarkdownString();
      markdown.appendMarkdown(`### ${functionInfo.name}\n\n`);
      markdown.appendMarkdown(`${functionInfo.description}\n\n`);
      markdown.appendMarkdown(`**Syntax:**\n\`\`\`dax\n${functionInfo.syntax}\n\`\`\`\n\n`);
      markdown.appendMarkdown(`**Returns:** ${functionInfo.returns}\n\n`);
      markdown.appendMarkdown(`**Category:** ${functionInfo.group}`);
      
      return new vscode.Hover(markdown);
    }
    
    // Check if it's a keyword
    const keywordInfo = daxKeywords.find((kw: any) => kw.name === word);
    if (keywordInfo) {
      const markdown = new vscode.MarkdownString();
      markdown.appendMarkdown(`### ${keywordInfo.name}\n\n`);
      markdown.appendMarkdown(`${keywordInfo.description}\n\n`);
      if (keywordInfo.syntax) {
        markdown.appendMarkdown(`**Syntax:**\n\`\`\`dax\n${keywordInfo.syntax}\n\`\`\`\n`);
      }
      
      return new vscode.Hover(markdown);
    }
    
    return null;
  }
}
import * as vscode from 'vscode';

const daxFunctions = require('../dax.functions.json');
const daxKeywords = require('../dax.keywords.json');

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
      markdown.isTrusted = true;

      markdown.appendMarkdown(`\`\`\`dax\n${functionInfo.syntax} -> ${functionInfo.returns}\n\`\`\`\n`);
      markdown.appendMarkdown(`*function* · ${functionInfo.group}\n\n`);
      markdown.appendMarkdown(`${functionInfo.description}\n\n`);

      return new vscode.Hover(markdown);
    }
    
    // Check if it's a keyword
    const keywordInfo = daxKeywords.find((kw: any) => kw.name === word);
    if (keywordInfo) {
      const markdown = new vscode.MarkdownString();
      markdown.isTrusted = true;

      markdown.appendMarkdown(`\`\`\`dax\n${keywordInfo.syntax}\n\`\`\`\n`);
      markdown.appendMarkdown(`*keyword* · ${keywordInfo.kind}\n\n`);
      markdown.appendMarkdown(`${keywordInfo.description}\n\n`);

      return new vscode.Hover(markdown);
    }
    
    return null;
  }
}
import * as vscode from 'vscode';

const daxFunctions = require('./dax.functions.json');
const daxKeywords = require('./dax.keywords.json');
const daxSnippets = require('./dax.snippets.json');

export class DaxCompletionProvider implements vscode.CompletionItemProvider {
  private currentDecoration?: vscode.TextEditorDecorationType;
  private currentEditor?: vscode.TextEditor;
  
  provideCompletionItems(
    document: vscode.TextDocument,
    position: vscode.Position,
    token: vscode.CancellationToken,
    context: vscode.CompletionContext
  ): vscode.ProviderResult<vscode.CompletionItem[] | vscode.CompletionList> {
    
    const linePrefix = document.lineAt(position).text.substring(0, position.character);
    const isDaxSnippetTrigger = linePrefix.toLowerCase().includes('dax:');
    const completionItems: vscode.CompletionItem[] = [];
    
    // Only show snippets if "dax:" was typed
    if (isDaxSnippetTrigger) {
      Object.entries(daxSnippets).forEach(([name, snippet]: [string, any]) => {
        const item = new vscode.CompletionItem(snippet.prefix, vscode.CompletionItemKind.Snippet);
        item.detail = snippet.class;
        item.insertText = new vscode.SnippetString(snippet.body.join('\n'));
        
        // Create documentation with code preview
        const documentation = new vscode.MarkdownString();
        documentation.appendMarkdown(`**${name}**\n\n`);
        documentation.appendMarkdown(`${snippet.description}\n\n`);
        documentation.appendMarkdown(`**Snippet:**\n`);
        
        // Show first N lines of the snippet
        const previewLines = 6;
        const bodyPreview = snippet.body.slice(0, previewLines);
        const hasMore = snippet.body.length > previewLines;
        
        documentation.appendCodeblock(
          bodyPreview.join('\n') + (hasMore ? '\n...' : ''),
          'dax'
        );
        
        item.documentation = documentation;
        item.sortText = `0_${snippet.prefix}`;
        
        // Filter the "dax:" prefix from insertion
        item.filterText = snippet.prefix;
        item.range = new vscode.Range(
          position.translate(0, -4),
          position
        );
        
        completionItems.push(item);
      });
      
      return completionItems;
    }
    
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

      // Add command to show parameter hint
      item.command = {
        command: 'dax.showParameterHint',
        title: 'Show Parameter Hint',
        arguments: [fn.syntax, fn.name]
      };
      
      // Add function completions
      item.insertText = fn.name;
      
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

  // Hint about parameter placeholder snippet
  public async showParameterHint(syntax: string, functionName: string) {
    // Check if parameter hints are enabled
    const config = vscode.workspace.getConfiguration('dax');
    if (!config.get<boolean>('showParameterHints', true)) {
      return;
    }
    console.log('showParameterHint called');
    
    const editor = vscode.window.activeTextEditor;
    if (!editor) return;

    // Dispose previous decoration if exists
    if (this.currentDecoration) {
      this.currentDecoration.dispose();
    }

    // Store the editor
    this.currentEditor = editor;

    const position = editor.selection.active;
    this.currentDecoration = vscode.window.createTextEditorDecorationType({
      after: {
        contentText: ` ${syntax.replace(functionName, '').trim()} - Press Shift+Enter to insert`,
        color: new vscode.ThemeColor('editorCodeLens.foreground'),
        fontStyle: 'italic'
      }
    });

    const range = new vscode.Range(position, position);
    editor.setDecorations(this.currentDecoration, [{ range }]);

    // Auto-clear after 5 seconds
    setTimeout(() => {
      if (this.currentDecoration) {
        this.currentDecoration.dispose();
        this.currentDecoration = undefined;
        this.currentEditor = undefined;
      }
    }, 5000);
  }

  // Create snippet from function syntax
  private createFunctionSnippet(syntax: string, functionName: string): vscode.SnippetString {
    try {
      // Extract parameters from syntax: "SUM(<column>)" -> "<column>"
      const match = syntax.match(/\((.*)\)/);
      
      if (!match || !match[1]) {
        // No parameters found, return function with empty parens
        return new vscode.SnippetString(`${functionName}($0)`);
      }
      
      const paramsString = match[1];
      const paramList = this.splitParameters(paramsString);
      
      if (paramList.length === 0) {
        // Empty parameter list
        return new vscode.SnippetString(`${functionName}($0)`);
      }
      
      // Build snippet with parameter placeholders
      let snippetString = `${functionName}(`;
      
      paramList.forEach((param, index) => {
        // Clean up parameter: remove < >, [ ], and whitespace
        let cleanParam = param.trim();
        cleanParam = cleanParam.replace(/^<(.+)>$/, '$1');
        cleanParam = cleanParam.replace(/^\[<(.+)>\]$/, '$1');
        cleanParam = cleanParam.replace(/^\[(.+)\]$/, '$1');
        
        // Add comma separator for subsequent parameters
        if (index > 0) {
          snippetString += ', ';
        }
        
        // Create tabstop: ${1:paramName}
        snippetString += `\${${index + 1}:${cleanParam}}`;
      });
      
      // Add final tabstop after closing paren
      snippetString += ')$0';
      
      return new vscode.SnippetString(snippetString);
      
    } catch (error) {
      // Fallback to simple snippet
      console.error('Error creating function snippet:', error);
      return new vscode.SnippetString(`${functionName}($0)`);
    }
  }

  // Insert parameter snippet
  public async expandParameters() {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      return;
    }

    try {
      const document = editor.document;
      const position = editor.selection.active;

      // Get the word before the cursor
      const wordRange = document.getWordRangeAtPosition(position);
      if (!wordRange) {
        vscode.window.showInformationMessage('No function name found at cursor position');
        return;
      }

      const functionName = document.getText(wordRange).toUpperCase();

      // Look up the function
      const fn = daxFunctions.find(
        (f: any) => f.name.toUpperCase() === functionName
      );
      
      if (!fn) {
        vscode.window.showInformationMessage(`Function '${functionName}' not found`);
        return;
      }

      // Build snippet
      const snippet = this.createFunctionSnippet(fn.syntax, fn.name);

      // Replace the function name with the snippet
      await editor.insertSnippet(snippet, wordRange);

      // Clear the decoration
      if (this.currentDecoration && this.currentEditor) {
        this.currentEditor.setDecorations(this.currentDecoration, []);
        this.currentDecoration.dispose();
        this.currentDecoration = undefined;
        this.currentEditor = undefined;
      }
    } catch (error) {
      vscode.window.showErrorMessage(`Error expanding parameters: ${error}`);
    }
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
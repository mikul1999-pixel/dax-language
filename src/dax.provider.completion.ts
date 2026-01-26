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

    // parse tricky snippet options once. only through SnippetString, not json-->TS + SnippetString
    const SNIPPET_OPTIONS_MAP: Record<string, string[]> = {
        "fmt:number:options": [
          '#,##0','#,##0.0','#,##0.00','#,##0,.0K','#,##0,,.0M','#,##0,,,.0B',
          '+#,##0;-#,##0','+#,##0.0;-#,##0.0','+#,##0.00;-#,##0.00','+#,##0,.0K;-#,##0,.0K','+#,##0,,.0M;-#,##0,,.0M','+#,##0,,,.0B;-#,##0,,,.0B'
        ],
        "fmt:currency:options": [
          '$#,##0','$#,##0.0','$#,##0.00','$#,##0,.0K','$#,##0,,.0M','$#,##0,,,.0B',
          '+$#,##0;-$#,##0','+$#,##0.0;-$#,##0.0','+$#,##0.00;-$#,##0.00','+$#,##0,.0K;-$#,##0,.0K','+$#,##0,,.0M;-$#,##0,,.0M','+$#,##0,,,.0B;-$#,##0,,,.0B'
        ],
        "fmt:percent:options": ['0%','0.0%','0.00%','+0%;-0%','+0.0%;-0.0%','+0.00%;-0.00%'],
        "fmt:bps:options": ['0 bps','0.0 bps','+0 bps;-0 bps','+0.0 bps;-0.0 bps'],
        "fmt:date:options": ["mmm'yy",'yyyy-mm-dd','dd mmm yyyy','mmmm yyyy','mm/dd/yyyy','dd/mm/yyyy','dddd, mmmm dd, yyyy'],
    };
    
    // Only show snippets if "dax:" was typed
    if (isDaxSnippetTrigger) {
      Object.entries(daxSnippets).forEach(([name, snippet]: [string, any]) => {
        const item = new vscode.CompletionItem(snippet.prefix, vscode.CompletionItemKind.Snippet);
        let bodyString = snippet.body.join('\n');

        // replace placeholders
        for (const [key, options] of Object.entries(SNIPPET_OPTIONS_MAP)) {
            const placeholder = `{{${key}}}`;
            
            if (bodyString.includes(placeholder)) {
                const escapedOptions = options
                    .map(opt => opt
                        .replace(/\$/g, '\$')    // Escape $
                        .replace(/,/g, '\\,')    // Escape , 
                        .replace(/"/g, '\\"')    // Escape "
                    )
                    .join(',');

                bodyString = bodyString.replace(placeholder, escapedOptions);
                break;
            }
        }
        item.detail = snippet.class;
        item.insertText = new vscode.SnippetString(bodyString);
        
        // Create documentation with code preview
        const documentation = new vscode.MarkdownString();
        documentation.appendMarkdown(`*${name}*: ${snippet.description}\n\n`);
        
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
        const lineText = document.lineAt(position).text;
        const triggerIdx = lineText.toLowerCase().lastIndexOf('dax:', position.character);

        item.range = new vscode.Range(
          position.with(undefined, triggerIdx),
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
      item.detail = `${fn.group}`;
      
      // Set full documentation
      const documentation = new vscode.MarkdownString();
      documentation.appendMarkdown(`\`\`\`dax\n${fn.syntax}\n-> ${fn.returns}\n\`\`\`\n`);
      documentation.appendMarkdown(`${fn.description}\n\n`);
      item.documentation = documentation;

      // Add command to show parameter hint
      item.command = {
        command: 'dax.showParameterHint',
        title: 'Show Parameter Hint',
        arguments: [fn.syntax, fn.name]
      };
      
      // Add function completions
      item.insertText = new vscode.SnippetString(`${fn.name}($0)`);
      
      // Sort order
      item.sortText = `1_${fn.name}`;
      
      completionItems.push(item);
    });
    
    // Add keyword completions
    daxKeywords.forEach((kw: any) => {
      const item = new vscode.CompletionItem(kw.name, vscode.CompletionItemKind.Keyword);
      
      item.detail = `${kw.kind}`;
      
      const documentation = new vscode.MarkdownString();
      documentation.appendMarkdown(`\`\`\`dax\n${kw.syntax}\n\`\`\`\n`);
      documentation.appendMarkdown(`${kw.description}\n\n`);
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
        contentText: ` ${syntax.replace(functionName, '').trim()} • Shift+Enter`,
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
      
      let paramsString = match[1];

      paramsString = paramsString
        .replace(/[\[\]]/g, '')      // Remove [ and ]
        .replace(/\.\.\./g, '');     // Remove ...

      const paramList = this.splitParameters(paramsString);
      
      if (paramList.length === 0) {
        // Empty parameter list
        return new vscode.SnippetString(`${functionName}($0)`);
      }
      
      // Build snippet with parameter placeholders
      let snippetString = `${functionName}(`;
      
      paramList.forEach((param, index) => {
        // Clean up parameter: remove <, >, and whitespace
        let cleanParam = param
          .replace(/[<>]/g, '')
          .trim();

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
      let position = editor.selection.active;
      const lineText = document.lineAt(position.line).text;
      let beforeCursor = lineText.slice(0, position.character);
      
      // Adjust cursor if after closing parens
      if (beforeCursor.endsWith(')')) {
        position = position.translate(0, -1);
        editor.selection = new vscode.Selection(position, position);
        beforeCursor = lineText.slice(0, position.character);
      }
      
      // Match function name and (text)
      const match = beforeCursor.match(/([A-Z_][A-Z0-9_]*)\s*\(([^()]*)$/i);
      if (!match) {
        vscode.window.showInformationMessage('Cursor is not inside a function call');
        return;
      }
      
      const functionName = match[1].toUpperCase();
      const existingArgs = match[2];
      
      // Prevent double expand
      if (existingArgs.trim().length > 0) {
        vscode.window.showInformationMessage('Parameters already expanded');
        return;
      }
      
      // Look up the function
      const fn = daxFunctions.find(
        (f: any) => f.name.toUpperCase() === functionName
      );
      
      if (!fn) {
        vscode.window.showInformationMessage(`Function '${functionName}' not found`);
        return;
      }
      
      // Pull parameter snippet
      const fullSnippet = this.createFunctionSnippet(fn.syntax, functionName);
      const fullSnippetText = fullSnippet.value;
      
      // Extract (between the parens)
      const paramsMatch = fullSnippetText.match(/\((.+)\)\$0$/);
      if (!paramsMatch) {
        vscode.window.showInformationMessage(`Function '${functionName}' has no parameters`);
        return;
      }
      
      const paramsSnippetText = paramsMatch[1];
      
      // Calc replacement range (inside parens)
      const openParenIndex = beforeCursor.lastIndexOf('(');
      const start = new vscode.Position(position.line, openParenIndex + 1);
      
      // Check for closing parens after cursor
      const afterCursor = lineText.slice(position.character);
      const closeParenMatch = afterCursor.match(/^\s*\)/);
      const end = closeParenMatch 
        ? new vscode.Position(position.line, position.character + closeParenMatch[0].length - 1)
        : position;
      
      const replaceRange = new vscode.Range(start, end);
      
      // Insert parameter snippet
      const snippet = new vscode.SnippetString(paramsSnippetText);
      await editor.insertSnippet(snippet, replaceRange);
      
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
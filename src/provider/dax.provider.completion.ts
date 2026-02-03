import * as vscode from 'vscode';
import { DaxDocumentParser } from '../parser/dax.document.parser';

const daxFunctions = require('../dax.functions.json');
const daxKeywords = require('../dax.keywords.json');
const daxSnippets = require('../dax.snippets.json');

export class DaxCompletionProvider implements vscode.CompletionItemProvider {

  constructor(private parser: DaxDocumentParser) {
  }
  
  provideCompletionItems(
    document: vscode.TextDocument,
    position: vscode.Position,
    token: vscode.CancellationToken,
    context: vscode.CompletionContext
  ): vscode.ProviderResult<vscode.CompletionItem[] | vscode.CompletionList> {
    
    const linePrefix = document.lineAt(position).text.substring(0, position.character);
    const isDaxSnippetTrigger = linePrefix.toLowerCase().includes('dax:');
    const completionItems: vscode.CompletionItem[] = [];
    const parsed = this.parser.parse(document);

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

    // Add column/measure completions. If inside []
    const insideBrackets = linePrefix.match(/(?:'([^']+)'|([A-Z_][A-Z0-9_]*))\s*\[\s*([A-Z_]*)$/i);
    
    if (insideBrackets) {
      const tableName = (insideBrackets[1] || insideBrackets[2]).trim();
      const tableInfo = parsed.tables.get(tableName);

      if (tableInfo) {
        // Suggest columns from this table
        for (const columnName of tableInfo.columns) {
          completionItems.push({
            label: columnName,
            kind: vscode.CompletionItemKind.Field,
            detail: `Column in ${tableName}`,
            documentation: `Reference to the ${columnName} column in the ${tableName} table`,
            sortText: '0_' + columnName, // Sort columns first
            insertText: columnName,
          });
        }
        // don't suggest anything other than column if inside bracket
        return completionItems;
      }
    }

    // User is inside an opening bracket [ for measures
    const afterBracket = linePrefix.match(/\[\s*([A-Z_]*)$/i);
    
    if (afterBracket) {
      // Suggest measures
      for (const measureName of parsed.measures.keys()) {
        completionItems.push({
          label: measureName,
          kind: vscode.CompletionItemKind.Value,
          detail: 'Measure',
          documentation: `Reference to the ${measureName} measure`,
          sortText: '1_' + measureName,
          insertText: measureName,
        });
      }
      // don't suggest anything other than measure if inside bracket
      return completionItems;
    } else {
      // Suggest table names
      for (const tableName of parsed.tables.keys()) {
        const needsQuotes = /\s/.test(tableName);
        const displayName = needsQuotes ? `'${tableName}'` : tableName;

        completionItems.push({
          label: tableName,
          kind: vscode.CompletionItemKind.Class,
          detail: 'Table',
          documentation: `Reference to the ${tableName} table`,
          sortText: '2_' + tableName,
          // Auto-insert brackets with cursor inside
          insertText: new vscode.SnippetString(`${displayName}[\${1:column}]`),
        });
      }
    }

    // Add variable completions
    const variables = parsed.variables;

    for (const varInfo of variables) {
      // Only suggest variables declared before current position
      if (varInfo.declarationLine < position.line) {
        completionItems.push({
          label: varInfo.name,
          kind: vscode.CompletionItemKind.Variable,
          detail: 'Variable',
          documentation: `Variable declared on line ${varInfo.declarationLine + 1}`,
          sortText: '0_' + varInfo.name, // Sort variables first
          insertText: varInfo.name,
        });
      }
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
      
      // Add function completions
      item.insertText = new vscode.SnippetString(`${fn.name}`);
      
      // Sort order
      item.sortText = `2_${fn.name}`;
      
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
      item.sortText = `1_${kw.name}`;
      
      completionItems.push(item);
    });
    
    return completionItems;
  }
}
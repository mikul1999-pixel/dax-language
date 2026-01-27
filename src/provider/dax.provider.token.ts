import * as vscode from 'vscode';
import { DaxDocumentParser } from '../parser/dax.document.parser';

export class DaxSemanticTokenProvider implements vscode.DocumentSemanticTokensProvider {
  
  // Define the token types. built-in types: variable, parameter, function, etc.
  static readonly tokenTypes = ['variable', 'type'];
  static readonly tokenModifiers = ['declaration', 'readonly'];
  
  static readonly legend = new vscode.SemanticTokensLegend(
    DaxSemanticTokenProvider.tokenTypes,
    DaxSemanticTokenProvider.tokenModifiers
  );
  
  constructor(private parser: DaxDocumentParser) {}
  
  provideDocumentSemanticTokens(
    document: vscode.TextDocument,
    token: vscode.CancellationToken
  ): vscode.ProviderResult<vscode.SemanticTokens> {
    
    const tokensBuilder = new vscode.SemanticTokensBuilder(DaxSemanticTokenProvider.legend);
    const parsed = this.parser.parse(document);

    // Track table names
    const tableNames = Array.from(parsed.tables.keys());
    const text = document.getText();

    // Helper to escape table names
    function escapeRegex(text: string): string {
        return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    // Helper to prevent formatting columns
    function isInsideBrackets(text: string, index: number): boolean {
        const before = text.lastIndexOf("[", index);
        const after = text.lastIndexOf("]", index);

        return before > after;
    }


    for (const tableName of tableNames) {
        const regex = new RegExp(`\\b${escapeRegex(tableName)}\\b`, 'g');

        let match: RegExpExecArray | null;
        while ((match = regex.exec(text)) !== null) {
            const start = document.positionAt(match.index);
            
            // Skip if inside [ ] 
            if (isInsideBrackets(text, match.index)) { 
                continue; 
            }

            tokensBuilder.push(
            start.line,
            start.character,
            match[0].length,
            1, // token type index: 'type'
            0  // no modifiers
            );
        }
    }

    // Track variables
    const variables = parsed.variables;
    
    // Collect all ranges. declaration & usages
    const allRanges: Array<{ range: vscode.Range; isDeclaration: boolean }> = [];

    for (const varInfo of variables) {
      allRanges.push({ range: varInfo.declarationRange, isDeclaration: true });
      for (const usage of varInfo.usageRanges) {
        allRanges.push({ range: usage, isDeclaration: false });
      }
    }

    // Sort by position
    allRanges.sort((a, b) => a.range.start.compareTo(b.range.start));
    
    // Add tokens in order
    for (const { range, isDeclaration } of allRanges) {
      tokensBuilder.push(
        range.start.line,
        range.start.character,
        range.end.character - range.start.character,
        0, // token type index: 'variable'
        (isDeclaration ? 1 : 0) | 2 // token modifier: 2^0 = 1 = 'declaration' + 'readonly'
      );
    }
    
    return tokensBuilder.build();
  }
}
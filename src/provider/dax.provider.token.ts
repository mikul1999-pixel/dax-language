import * as vscode from 'vscode';
import { DaxDocumentParser } from '../parser/dax.document.parser';

export class DaxSemanticTokenProvider implements vscode.DocumentSemanticTokensProvider {
  
  // Define the token types for highlighting
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
    // Collect all table usage ranges
    const tableRanges: vscode.Range[] = [];
    for (const tableInfo of parsed.tables.values()) {
      tableRanges.push(...tableInfo.usageRanges);
    }
    
    // Sort table ranges by position
    tableRanges.sort((a, b) => a.start.compareTo(b.start));
    
    // Add tokens for table names
    for (const range of tableRanges) {
      tokensBuilder.push(
        range.start.line,
        range.start.character,
        range.end.character - range.start.character,
        1, // token type index: 'type'
        0  // no modifiers
      );
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

    // Sort variable ranges by position
    allRanges.sort((a, b) => a.range.start.compareTo(b.range.start));
    
    // Add tokens for variables
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
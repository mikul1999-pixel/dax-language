import * as vscode from 'vscode';
import { Diagnostic, ScopeBlock, ExclusionRange } from '../types';

export function findScopeBlocks(
  document: vscode.TextDocument,
  exclusionRanges: ExclusionRange[]
): ScopeBlock[] {
  const text = document.getText();
  const scopeBlocks: ScopeBlock[] = [];
  
  const varPattern = /\bVAR\b/gi;
  const returnPattern = /\bRETURN\b/gi;
  const definePattern = /\bDEFINE\b/gi;
  const evaluatePattern = /\bEVALUATE\b/gi;
  let match: RegExpExecArray | null;

  // Numeric exclusion check
  const isExcluded = (index: number, length: number): boolean => {
    const start = index;
    const end = index + length;
    return exclusionRanges.some(r =>
      // overlap check
      !(end <= r.start || start >= r.end)
    );
  };

  // Scan DEFINE
  while ((match = definePattern.exec(text)) !== null) {
    if (!isExcluded(match.index, match[0].length)) {
      scopeBlocks.push({
        type: 'DEFINE',
        index: match.index,
        position: document.positionAt(match.index)
      });
    }
  }

  // Scan EVALUATE
  while ((match = evaluatePattern.exec(text)) !== null) {
    if (!isExcluded(match.index, match[0].length)) {
      scopeBlocks.push({
        type: 'EVALUATE',
        index: match.index,
        position: document.positionAt(match.index)
      });
    }
  }

  // Scan VAR
  while ((match = varPattern.exec(text)) !== null) {
    if (!isExcluded(match.index, match[0].length)) {
      scopeBlocks.push({
        type: 'VAR',
        index: match.index,
        position: document.positionAt(match.index)
      });
    }
  }

  // Scan RETURN
  while ((match = returnPattern.exec(text)) !== null) {
    if (!isExcluded(match.index, match[0].length)) {
      scopeBlocks.push({
        type: 'RETURN',
        index: match.index,
        position: document.positionAt(match.index)
      });
    }
  }

  scopeBlocks.sort((a, b) => a.index - b.index);
  return scopeBlocks;
}

export function runScopeDiagnostics(
  document: vscode.TextDocument,
  scopeBlocks: ScopeBlock[]
): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const text = document.getText();

  // Find DEFINE/EVALUATE blocks
  const defineEvaluateRanges: { start: number; end: number }[] = [];
  for (let i = 0; i < scopeBlocks.length; i++) {
    if (scopeBlocks[i].type === 'DEFINE') {
      const nextEvaluate = scopeBlocks.slice(i + 1).find(b => b.type === 'EVALUATE');
      if (nextEvaluate) {
        defineEvaluateRanges.push({
          start: scopeBlocks[i].index,
          end: nextEvaluate.index
        });
      }
    }
  }

  // Helper: check if a VAR is inside a DEFINE/EVALUATE block
  const isInDefineBlock = (varIndex: number): boolean => {
    return defineEvaluateRanges.some(range => 
      varIndex > range.start && varIndex < range.end
    );
  };

  // Helper: calculate parenthesis depth at a position
  const getParenDepth = (startIndex: number, endIndex: number): number => {
    let depth = 0;
    for (let i = startIndex; i < endIndex && i < text.length; i++) {
      if (text[i] === '(') depth++;
      if (text[i] === ')') depth--;
    }
    return depth;
  };

  // Track VAR/RETURN pairs with nesting depth
  interface VarContext {
    block: ScopeBlock;
    parenDepth: number;
  }
  
  const varStack: VarContext[] = [];

  for (let i = 0; i < scopeBlocks.length; i++) {
    const block = scopeBlocks[i];
    
    // Skip DEFINE/EVALUATE blocks
    if (block.type === 'DEFINE' || block.type === 'EVALUATE') {
      continue;
    }

    if (block.type === 'VAR') {
      // Calculate parenthesis depth from start of document to this VAR
      const parenDepth = getParenDepth(0, block.index);
      varStack.push({ block, parenDepth });
      
    } else if (block.type === 'RETURN') {
      // Calculate parenthesis depth from start to this RETURN
      const returnDepth = getParenDepth(0, block.index);
      
      // Pop VARs at the same or deeper nesting level
      while (varStack.length > 0 && varStack[varStack.length - 1].parenDepth >= returnDepth) {
        varStack.pop();
      }
    }
  }

  // Check remaining VARs in stack for missing RETURN
  for (const varContext of varStack) {
    const varBlock = varContext.block;
    
    // Skip if this VAR is in a DEFINE block (doesn't need RETURN)
    if (isInDefineBlock(varBlock.index)) {
      continue;
    }

    // Check if there's a RETURN after this VAR at the same depth
    const indexInBlocks = scopeBlocks.findIndex(b => b.index === varBlock.index);
    const subsequentBlocks = scopeBlocks.slice(indexInBlocks + 1);
    const nextReturn = subsequentBlocks.find(b => b.type === 'RETURN');
    
    // If no RETURN found, flag it
    if (!nextReturn) {
      diagnostics.push({
        range: new vscode.Range(varBlock.position, varBlock.position.translate(0, 3)),
        message: 'VAR declaration without corresponding RETURN statement',
        severity: 'error',
        code: 'missing-return'
      });
    }
  }

  return diagnostics;
}
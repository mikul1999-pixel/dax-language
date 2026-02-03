// import * as vscode from 'vscode';
import { Diagnostic, VariableInfo } from '../types';

export function runVariableDiagnostics(variables: VariableInfo[]): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];

  for (const variable of variables) {
    if (variable.usageRanges.length === 0) {
      diagnostics.push({
        range: variable.declarationRange,
        message: `Variable '${variable.name}' is declared but never used`,
        severity: 'warning',
        code: 'unused-variable'
      });
    }
  }

  return diagnostics;
}

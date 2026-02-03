import * as vscode from 'vscode';
import { TableColumnMap, ScopeBlock, FunctionCall, Diagnostic } from '../types';
import { runVariableDiagnostics } from './dax.diagnostics.variables';
import { runScopeDiagnostics } from './dax.diagnostics.scope';
import { runFunctionDiagnostics } from './dax.diagnostics.functions';

export function runDiagnostics(
  document: vscode.TextDocument,
  result: TableColumnMap,
  scopeBlocks: ScopeBlock[]
): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];

  diagnostics.push(
    ...runVariableDiagnostics(result.variables),
    ...runScopeDiagnostics(document, scopeBlocks),
    ...runFunctionDiagnostics(result.functionCalls)
  );

  return diagnostics;
}

import * as vscode from 'vscode';

export interface VariableInfo {
  name: string;
  declarationLine: number;
  declarationRange: vscode.Range;
  usageRanges: vscode.Range[];
  parentMeasure?: string;
}

export interface TableInfo {
  name: string;
  usageRanges: vscode.Range[];
  columns: Set<string>;
  scope?: vscode.Range;
}

export interface MeasureInfo {
  name: string;
  declarationRange?: vscode.Range;
  usageRanges: vscode.Range[];
  scope?: vscode.Range;
}

export interface ExclusionRange {
  start: number;
  end: number;
}

export interface Diagnostic {
  range: vscode.Range;
  message: string;
  severity: 'error' | 'warning' | 'info';
  code?: string;
}

export interface ScopeBlock {
  type: 'VAR' | 'RETURN' | 'DEFINE' | 'EVALUATE';
  index: number;
  position: vscode.Position;
}

export interface FunctionParameter {
  name: string;
  type: string;
  isOptional: boolean;
  isRepeatable?: boolean;
}

export interface FunctionMetadata {
  name: string;
  parameters: FunctionParameter[];
}

export interface FunctionCall {
  name: string;
  parameterCount: number;
  range: vscode.Range[];
}

export interface TableColumnMap {
  tables: Map<string, TableInfo>;
  measures: Map<string, MeasureInfo>;
  variables: VariableInfo[];
  exclusionRanges: vscode.Range[];
  diagnostics: Diagnostic[];
  functionCalls: FunctionCall[];
}
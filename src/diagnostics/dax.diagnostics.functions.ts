// import * as vscode from 'vscode';
import { Diagnostic, FunctionParameter, FunctionMetadata, FunctionCall } from '../types';

const daxParameters = require('../dax.parameters.json') as FunctionMetadata[];

export function runFunctionDiagnostics(
  functionCalls: FunctionCall[]
): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];

  for (const call of functionCalls) {
    const metadata = daxParameters.find((fn) => fn.name === call.name);
    
    if (!metadata) {
      // Skip if function not found in metadata
      continue;
    }

    const { minParams, maxParams } = calculateParameterBounds(metadata.parameters);
    const hasRepeatableParams = metadata.parameters.some(p => p.isRepeatable);

    // Check min params
    if (call.parameterCount < minParams) {
      diagnostics.push({
        range: call.range[0],
        message: `Function '${call.name}' requires at least ${minParams} parameter${minParams !== 1 ? 's' : ''}, but ${call.parameterCount} ${call.parameterCount !== 1 ? 'were' : 'was'} provided`,
        severity: 'error',
        code: 'too-few-parameters'
      });
    }

    // Check max params
    if (!hasRepeatableParams && maxParams !== null && call.parameterCount > maxParams) {
      diagnostics.push({
        range: call.range[0],
        message: `Function '${call.name}' accepts at most ${maxParams} parameter${maxParams !== 1 ? 's' : ''}, but ${call.parameterCount} ${call.parameterCount !== 1 ? 'were' : 'was'} provided`,
        severity: 'error',
        code: 'too-many-parameters'
      });
    }
  }

  return diagnostics;
}

function calculateParameterBounds(parameters: FunctionParameter[]): { minParams: number; maxParams: number | null } {
  let minParams = 0;
  let maxParams = 0;
  let hasRepeatable = false;

  for (const param of parameters) {
    if (!param.isOptional) {
      minParams++;
    }
    
    if (param.isRepeatable) {
      hasRepeatable = true;
    } else {
      maxParams++;
    }
  }

  // If there are repeatables, no max
  return {
    minParams,
    maxParams: hasRepeatable ? null : maxParams
  };
}
import * as vscode from 'vscode';

const daxFunctions = require('../dax.functions.json');
const daxParameters = require('../dax.parameters.json');

export class DaxSignatureHelpProvider implements vscode.SignatureHelpProvider {

  provideSignatureHelp(
    document: vscode.TextDocument,
    position: vscode.Position,
    token: vscode.CancellationToken,
    context: vscode.SignatureHelpContext
  ): vscode.ProviderResult<vscode.SignatureHelp> {

    const lineText = document.lineAt(position.line).text;
    const beforeCursor = lineText.slice(0, position.character);

    // Find the active function call and its open paren
    const { functionName, openParenIndex } = this.findActiveFunctionCall(beforeCursor);
    if (!functionName || openParenIndex === -1) {
      return undefined;
    }

    // Look up function metadata
    const fn = daxFunctions.find((f: any) => f.name === functionName.toUpperCase());
    if (!fn) {
      return undefined;
    }

    const params = daxParameters.find((p: any) => p.name === functionName.toUpperCase())?.parameters ?? [];

    // Count commas after the open paren to determine index
    const afterOpenParen = beforeCursor.slice(openParenIndex + 1);
    const rawActiveIndex = this.getParameterIndex(afterOpenParen);
    const activeIndex = this.getActiveIndex(params, rawActiveIndex);

    // Build SignatureHelp
    const signatureHelp = new vscode.SignatureHelp();
    signatureHelp.signatures = [this.buildSignature(fn, params, rawActiveIndex)];  // for label
    signatureHelp.activeSignature = 0;
    signatureHelp.activeParameter = activeIndex;  // for highlight

    return signatureHelp;
  }

  // Walk backwards to find the nearest unclosed function call. Handles nested functions
  private findActiveFunctionCall(beforeCursor: string): { functionName: string | null; openParenIndex: number } {
    let depth = 0;

    for (let i = beforeCursor.length - 1; i >= 0; i--) {
      const char = beforeCursor[i];

      if (char === ')') {
        depth++;
      } else if (char === '(') {
        if (depth === 0) {
          // Unclosed open paren. Extract function name before it
          const beforeParen = beforeCursor.slice(0, i);
          const match = beforeParen.match(/([A-Z_][A-Z0-9_.]*)\s*$/i);
          if (match) {
            return { functionName: match[1], openParenIndex: i };
          }
          // Open paren found but no function name
          return { functionName: null, openParenIndex: -1 };
        }
        depth--;
      }
    }

    return { functionName: null, openParenIndex: -1 };
  }

  // Use comma count to get param index
  private getParameterIndex(afterOpenParen: string): number {
    let commaCount = 0;
    let depth = 0;
    for (const char of afterOpenParen) {
      if (char === '(') {
        depth++;
      } else if (char === ')') {
        depth--;
      } else if (char === ',' && depth === 0) {
        commaCount++;
      }
    }
    return commaCount;
  }

  // Adjust param index for "..."
  private getActiveIndex(params: any[], activeParamIndex: number): number {
    const repeatableStart = this.getRepeatableStartIndex(params);
    
    // No repeatables
    if (repeatableStart === -1 || activeParamIndex < repeatableStart) {
      return activeParamIndex;
    }

    const stride = params.length - repeatableStart;
    const currentInst = Math.floor((activeParamIndex - repeatableStart) / stride) + 1;
    const offset = (activeParamIndex - repeatableStart) % stride;

    // Standalone Logic
    if (stride === 1) {
      if (currentInst === 1) return activeParamIndex;
      const ellipsisCount = currentInst > 2 ? 1 : 0;
      return repeatableStart + 1 + ellipsisCount;
    } 
    
    // Pairs Logic
    else {
      if (currentInst === 1) return activeParamIndex;
      return repeatableStart + 1 + offset;
    }
  }

  // Find the index of the first repeatable parameter in the params array
  private getRepeatableStartIndex(params: any[]): number {
    for (let i = 0; i < params.length; i++) {
      if (params[i].isRepeatable) {
        return i;
      }
    }
    return -1;
  }

  // Build vscode.SignatureInformation from the function metadata. Constructs label param info for each entry in array
  private buildSignature(fn: any, params: any[], activeParamIndex: number): vscode.SignatureInformation {
    // Dynamically build the label
    const displayedParams = this.buildDisplayedParams(params, activeParamIndex);

    let label = `${fn.name}(`;
    const parameterInfos: vscode.ParameterInformation[] = [];

    displayedParams.forEach((paramName, index) => {
      // Look up param definition for the doc string
      const sourceParam = this.getSourceParam(params, index);
      
      const startIndex = label.length;
      label += this.formatParamLabel(paramName, sourceParam.isOptional);
      const endIndex = label.length;

      const paramInfo = new vscode.ParameterInformation([startIndex, endIndex]);
      paramInfo.documentation = sourceParam
        ? new vscode.MarkdownString(`${sourceParam.type}${sourceParam.isOptional ? ' *(optional)*' : ''}${sourceParam.isRepeatable ? ' *(repeatable)*' : ''}`)
        : '';

      parameterInfos.push(paramInfo);

      if (index < displayedParams.length - 1) {
        label += ', ';
      }
    });

    label += `) -> ${fn.returns}`;

    const signatureInfo = new vscode.SignatureInformation(label);
    signatureInfo.documentation = new vscode.MarkdownString(
      `` // leave as placeholder
    );
    signatureInfo.parameters = parameterInfos;

    return signatureInfo;
  }

  // Builds the list of parameter labels to display, expanding repeatable params
  private buildDisplayedParams(params: any[], activeParamIndex: number): string[] {
    if (params.length === 0) return [];

    const repeatableStart = this.getRepeatableStartIndex(params);
    const displayed: string[] = [];

    // 1. Add Static Params
    const staticEnd = repeatableStart === -1 ? params.length : repeatableStart;
    for (let i = 0; i < staticEnd; i++) {
      displayed.push(`${params[i].name}`);
    }

    // If there are no repeatables or haven't reached yet
    if (repeatableStart === -1 || activeParamIndex < repeatableStart) {
      if (repeatableStart !== -1) {
        const stride = params.length - repeatableStart;
        for (let i = 0; i < stride; i++) {
          displayed.push(`${params[repeatableStart + i].name}1`);
        }
      }
      return displayed;
    }

    const stride = params.length - repeatableStart;
    const currentInst = Math.floor((activeParamIndex - repeatableStart) / stride) + 1;

    // 2. Repeats
    if (stride === 1) {
      // Standalone
      displayed.push(`${params[repeatableStart].name}1`);
      
      if (currentInst > 2) {
        displayed.push("...");
      }

      // Show current instance if not 1st
      if (currentInst > 1) {
        displayed.push(`${params[repeatableStart].name}${currentInst}`);
      }
    } 
    else {
      // Pairs
      // Show "..." if past 1st
      if (currentInst > 1) {
        displayed.push("...");
      } else {
        // If still on Instance 1
        for (let i = 0; i < stride; i++) {
          displayed.push(`${params[repeatableStart + i].name}1`);
        }
      }

      // Show the current group
      if (currentInst > 1) {
        for (let i = 0; i < stride; i++) {
          displayed.push(`${params[repeatableStart + i].name}${currentInst}`);
        }
      }
    }

    return displayed;
  }

  // Maps a displayed parameter index back to its definition. Handles repeatables
  private getSourceParam(params: any[], displayedIndex: number): any {
    if (displayedIndex < params.length) {
      return params[displayedIndex];
    }

    const repeatableStart = this.getRepeatableStartIndex(params);
    if (repeatableStart === -1) return params[params.length - 1];

    const repeatableCount = params.length - repeatableStart;
    const overflow = displayedIndex - repeatableStart;
    return params[repeatableStart + (overflow % repeatableCount)];
  }

  private formatParamLabel(name: string, isOptional: boolean): string {
    // If optional, wrap in []
    const start = isOptional ? '[' : '';
    const end = isOptional ? ']' : '';
    return `${start}${name}${end}`;
  }
}
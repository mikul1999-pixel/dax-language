import * as vscode from 'vscode';
import { DaxDocumentParser } from '../parser/dax.document.parser';
import { Diagnostic as DaxDiagnostic } from '../types';

export class DaxDiagnosticsProvider {
  private collection: vscode.DiagnosticCollection;

  constructor(private parser: DaxDocumentParser) {
    this.collection = vscode.languages.createDiagnosticCollection('dax');
  }

  // Registers listeners for document open + change events
  register(context: vscode.ExtensionContext) {
    context.subscriptions.push(
      this.collection,

      vscode.workspace.onDidOpenTextDocument(doc => {
        if (doc.languageId === 'dax') {
          this.updateDiagnostics(doc);
        }
      }),

      vscode.workspace.onDidChangeTextDocument(e => {
        if (e.document.languageId === 'dax') {
          this.updateDiagnostics(e.document);
        }
      }),

      vscode.workspace.onDidCloseTextDocument(doc => {
        if (doc.languageId === 'dax') {
          this.collection.delete(doc.uri);
        }
      })
    );
  }

  // Runs parser + diagnostics and updates vscode's diagnostic UI
  private updateDiagnostics(document: vscode.TextDocument) {
    const result = this.parser.parse(document);

    const vscodeDiagnostics: vscode.Diagnostic[] = result.diagnostics.map(
      (d: DaxDiagnostic) => {
        const severity = this.mapSeverity(d.severity);

        const diag = new vscode.Diagnostic(
          d.range,
          d.message,
          severity
        );

        if (d.code) {
          diag.code = d.code;
        }

        return diag;
      }
    );

    this.collection.set(document.uri, vscodeDiagnostics);
  }

  private mapSeverity(
    severity: DaxDiagnostic['severity']
  ): vscode.DiagnosticSeverity {
    switch (severity) {
      case 'error':
        return vscode.DiagnosticSeverity.Error;
      case 'warning':
        return vscode.DiagnosticSeverity.Warning;
      case 'info':
      default:
        return vscode.DiagnosticSeverity.Information;
    }
  }
}

import * as vscode from 'vscode';

// Conditionally registers a provider based on extension settings
export function registerConditionalProvider(
  context: vscode.ExtensionContext,
  settingKey: string,
  providerRegistration: () => vscode.Disposable
): vscode.Disposable | undefined {
  const config = vscode.workspace.getConfiguration();
  const isEnabled = config.get<boolean>(settingKey, true); // Default to true

  if (isEnabled) {
    const provider = providerRegistration();
    context.subscriptions.push(provider);
    return provider;
  }

  return undefined;
}
import * as vscode from 'vscode';
import { MarkdownEditorProvider } from './markdownEditorProvider';

export function activate(context: vscode.ExtensionContext) {
  const provider = new MarkdownEditorProvider(context);

  context.subscriptions.push(
    vscode.window.registerCustomEditorProvider(
      MarkdownEditorProvider.viewType,
      provider,
      {
        webviewOptions: { retainContextWhenHidden: true },
        supportsMultipleEditorsPerDocument: false,
      }
    )
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('markdownWysiwyg.openWithTextEditor', () => {
      const uri = vscode.window.activeTextEditor?.document.uri
        ?? vscode.window.tabGroups.activeTabGroup.activeTab?.input;
      if (uri && 'uri' in (uri as any)) {
        vscode.commands.executeCommand('vscode.openWith', (uri as any).uri, 'default');
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('markdownWysiwyg.openWithWysiwyg', (uri?: vscode.Uri) => {
      if (uri) {
        vscode.commands.executeCommand('vscode.openWith', uri, MarkdownEditorProvider.viewType);
      }
    })
  );
}

export function deactivate() {}

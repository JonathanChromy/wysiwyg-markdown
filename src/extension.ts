import * as vscode from 'vscode';
import { MarkdownEditorProvider } from './markdownEditorProvider';

export function activate(context: vscode.ExtensionContext) {
  const isLoggingEnabled = process.env.MARKDOWN_WYSIWYG_LOG === '1';
  const output = isLoggingEnabled
    ? vscode.window.createOutputChannel('Markdown WYSIWYG')
    : undefined;
  const log = (message: string) => {
    if (isLoggingEnabled) {
      const line = `[Markdown WYSIWYG] ${message}`;
      console.log(line);
      output?.appendLine(line);
    }
  };

  log(`Activating from ${context.extensionUri.fsPath}`);
  log(`Extension mode: ${vscode.ExtensionMode[context.extensionMode]}`);

  if (output) {
    context.subscriptions.push(output);
  }

  const provider = new MarkdownEditorProvider(context, log);

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
  log(`Registered custom editor: ${MarkdownEditorProvider.viewType}`);

  context.subscriptions.push(
    vscode.commands.registerCommand('markdownWysiwyg.openWithTextEditor', () => {
      log('Command invoked: markdownWysiwyg.openWithTextEditor');
      const uri = vscode.window.activeTextEditor?.document.uri
        ?? vscode.window.tabGroups.activeTabGroup.activeTab?.input;
      if (uri && 'uri' in (uri as any)) {
        vscode.commands.executeCommand('vscode.openWith', (uri as any).uri, 'default');
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('markdownWysiwyg.openWithWysiwyg', (uri?: vscode.Uri) => {
      const targetUri = uri ?? vscode.window.activeTextEditor?.document.uri;
      log(`Command invoked: markdownWysiwyg.openWithWysiwyg (${targetUri?.toString() ?? 'no target URI'})`);
      if (targetUri) {
        vscode.commands.executeCommand('vscode.openWith', targetUri, MarkdownEditorProvider.viewType);
      }
    })
  );
}

export function deactivate() {}

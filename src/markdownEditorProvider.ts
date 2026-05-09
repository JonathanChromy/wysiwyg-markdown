import * as vscode from 'vscode';

export class MarkdownEditorProvider implements vscode.CustomTextEditorProvider {
  public static readonly viewType = 'markdownWysiwyg.editor';

  public constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly log: (message: string) => void
  ) {}

  public async resolveCustomTextEditor(
    document: vscode.TextDocument,
    webviewPanel: vscode.WebviewPanel,
    _token: vscode.CancellationToken
  ): Promise<void> {
    this.log(`Resolving custom editor for ${document.uri.toString()}`);

    const { webview } = webviewPanel;

    webview.options = {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.joinPath(this.context.extensionUri, 'out')],
    };

    webview.html = this.getHtmlForWebview(webview);

    let isUpdatingFromWebview = false;
    const disposables: vscode.Disposable[] = [];

    disposables.push(
      webview.onDidReceiveMessage(async (message: unknown) => {
        if (!isMessage(message)) {
          return;
        }

        if (message.type === 'ready') {
          this.log(`Webview ready for ${document.uri.fsPath}`);
          await webview.postMessage({ type: 'init', content: document.getText() });
          return;
        }

        if (message.type !== 'edit' || typeof message.content !== 'string') {
          return;
        }

        const edit = new vscode.WorkspaceEdit();
        edit.replace(
          document.uri,
          new vscode.Range(0, 0, document.lineCount, 0),
          message.content
        );

        isUpdatingFromWebview = true;
        try {
          this.log(`Applying webview edit to ${document.uri.fsPath}`);
          await vscode.workspace.applyEdit(edit);
        } finally {
          isUpdatingFromWebview = false;
        }
      }),
      vscode.workspace.onDidChangeTextDocument((event) => {
        if (event.document.uri.toString() !== document.uri.toString() || isUpdatingFromWebview) {
          return;
        }

        this.log(`Document changed outside webview: ${document.uri.fsPath}`);
        void webview.postMessage({ type: 'update', content: document.getText() });
      }),
      webviewPanel.onDidDispose(() => {
        while (disposables.length > 0) {
          disposables.pop()?.dispose();
        }
      })
    );
  }

  private getHtmlForWebview(webview: vscode.Webview): string {
    const nonce = getNonce();
    const stylesheetUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.context.extensionUri, 'out', 'webview.css')
    );
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.context.extensionUri, 'out', 'webview.js')
    );

    return /* html */ `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta
      http-equiv="Content-Security-Policy"
      content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src ${webview.cspSource}; font-src ${webview.cspSource}; img-src ${webview.cspSource} https: data:;"
    />
    <link rel="stylesheet" href="${stylesheetUri}" />
    <title>Markdown WYSIWYG Editor</title>
  </head>
  <body>
    <div id="editor-container" style="display: flex; flex-direction: column; width: 100vw; height: 100vh;">
      <div id="editor-toolbar" role="toolbar" aria-label="Editor formatting"></div>
      <div id="editor"></div>
    </div>
    <script nonce="${nonce}" src="${scriptUri}"></script>
  </body>
</html>`;
  }
}

type WebviewMessage =
  | { type: 'ready' }
  | { type: 'edit'; content: string };

function isMessage(message: unknown): message is WebviewMessage {
  if (!message || typeof message !== 'object' || !('type' in message)) {
    return false;
  }

  const candidate = message as { type?: unknown; content?: unknown };
  return candidate.type === 'ready'
    || (candidate.type === 'edit' && typeof candidate.content === 'string');
}

function getNonce(): string {
  let text = '';
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < 32; i++) {
    text += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return text;
}

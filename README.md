# Markdown WYSIWYG Editor

A VS Code extension that provides a full rich-text WYSIWYG markdown editor, powered by [Milkdown](https://milkdown.dev/).

## Features

- **Typora-like editing** — Write markdown with a rich-text experience (bold, italic, headers, lists, tables, code blocks, math).
- **Custom editor** — Opens `.md` files directly in the WYSIWYG editor. Toggle back to the standard text editor with one click.
- **Theme integration** — Automatically matches your VS Code color theme (light, dark, high contrast).
- **100% local** — No remote service calls. Everything runs locally in VS Code's webview.
- **Markdown fidelity** — Built on Milkdown (ProseMirror + remark) for accurate markdown round-tripping.

## Usage

1. Open any `.md` file
2. If the WYSIWYG editor isn't the default, right-click the file → **Open with WYSIWYG Editor**
3. To switch back to the standard text editor, click the `</>` icon in the editor title bar

## Development

```bash
cd tools/vscode-markdown-wysiwyg
npm install
npm run build
```

Press **F5** in VS Code to launch the Extension Development Host and test the editor.

## Building a VSIX

```bash
npm run package
```

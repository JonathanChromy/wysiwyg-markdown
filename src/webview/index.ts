/// <reference path="./vscode.d.ts" />

import { Crepe, CrepeFeature } from '@milkdown/crepe';
import '@milkdown/crepe/theme/common/style.css';
import '@milkdown/crepe/theme/frame.css';
import './styles.css';
import { replaceAll } from '@milkdown/kit/utils';
import { setupToolbar, type ToolbarController } from './toolbar';

const vscode = acquireVsCodeApi();

let crepe: Crepe | null = null;
let toolbarController: ToolbarController | null = null;
let isLocalEdit = false;
let lastKnownContent = typeof vscode.getState()?.content === 'string'
  ? vscode.getState().content
  : '';
let pendingProgrammaticContent: string | null = null;
let releaseLocalEditTimer: number | null = null;

type RemarkMathOptions = {
  singleDollarTextMath?: boolean;
};

function disableSingleDollarInlineMath(editor: Crepe['editor']) {
  editor.config((ctx) => {
    ctx.update<RemarkMathOptions, 'remarkMath'>('remarkMath', (options) => ({
      ...options,
      singleDollarTextMath: false,
    }));
  });
}

function releaseLocalEditGuard() {
  if (releaseLocalEditTimer !== null) {
    window.clearTimeout(releaseLocalEditTimer);
    releaseLocalEditTimer = null;
  }

  pendingProgrammaticContent = null;
  isLocalEdit = false;
}

function scheduleLocalEditGuardRelease() {
  if (releaseLocalEditTimer !== null) {
    window.clearTimeout(releaseLocalEditTimer);
  }

  releaseLocalEditTimer = window.setTimeout(() => {
    releaseLocalEditGuard();
  }, 500);
}

function trackContent(content: string) {
  lastKnownContent = content;
  vscode.setState({ content });
}

/**
 * Removed: enforceDarkModeColors() + setupDarkModeObserver().
 *
 * Those functions injected a parallel stylesheet on every keystroke via a
 * MutationObserver, hardcoded hex colors that broke non-Default-Dark themes,
 * and used a universal `*` selector that nuked Crepe's intentional colors.
 * The CSS variable bridge in styles.css already handles theme integration
 * across all VS Code themes (light, dark, high contrast).
 */

async function initEditor(content: string) {
  const root = document.getElementById('editor');
  if (!root) {
    console.error('Milkdown root element #editor was not found.');
    return;
  }

  if (crepe) {
    await updateEditorContent(content);
    return;
  }

  trackContent(content);

  crepe = new Crepe({
    root,
    defaultValue: content,
    features: {
      [CrepeFeature.Toolbar]: false,
      [CrepeFeature.LinkTooltip]: false,
    },
  });
  disableSingleDollarInlineMath(crepe.editor);

  crepe.on((listener) => {
    listener.markdownUpdated((_ctx, markdown, prevMarkdown) => {
      if (markdown === prevMarkdown) {
        return;
      }

      if (pendingProgrammaticContent !== null && markdown === pendingProgrammaticContent) {
        trackContent(markdown);
        releaseLocalEditGuard();
        return;
      }

      if (isLocalEdit) {
        return;
      }

      trackContent(markdown);
      vscode.postMessage({ type: 'edit', content: markdown });
    });
  });

  try {
    await crepe.create();
    const toolbar = document.getElementById('editor-toolbar');
    if (toolbar) {
      toolbarController = setupToolbar({
        toolbar,
        editor: crepe.editor,
        log: (message, error) => {
          if (error) {
            console.error(message, error);
            return;
          }

          console.warn(message);
        },
      });
    }
  } catch (error) {
    console.error('Failed to create Milkdown editor.', error);
    crepe = null;
  }
}

async function updateEditorContent(content: string) {
  if (!crepe) {
    await initEditor(content);
    return;
  }

  if (content === lastKnownContent) {
    return;
  }

  isLocalEdit = true;
  pendingProgrammaticContent = content;
  scheduleLocalEditGuardRelease();

  try {
    crepe.editor.action(replaceAll(content, true));
    trackContent(content);
  } catch (error) {
    releaseLocalEditGuard();
    console.error('Failed to update Milkdown editor content.', error);
  }
}

window.addEventListener('message', async (event: MessageEvent<{ type?: unknown; content?: unknown }>) => {
  const message = event.data;

  if (!message || typeof message.type !== 'string') {
    return;
  }

  switch (message.type) {
    case 'init':
      if (typeof message.content === 'string') {
        await initEditor(message.content);
      }
      break;
    case 'update':
      if (typeof message.content === 'string') {
        await updateEditorContent(message.content);
      }
      break;
    default:
      break;
  }
});

window.addEventListener('beforeunload', () => {
  releaseLocalEditGuard();
  toolbarController?.dispose();
  toolbarController = null;
  void crepe?.destroy();
  crepe = null;
});

vscode.postMessage({ type: 'ready' });

/// <reference path="./vscode.d.ts" />

import { Crepe } from '@milkdown/crepe';
import '@milkdown/crepe/theme/common/style.css';
import '@milkdown/crepe/theme/frame.css';
import './styles.css';
import { replaceAll } from '@milkdown/kit/utils';

const vscode = acquireVsCodeApi();

let crepe: Crepe | null = null;
let isLocalEdit = false;
let lastKnownContent = typeof vscode.getState()?.content === 'string'
  ? vscode.getState().content
  : '';
let pendingProgrammaticContent: string | null = null;
let releaseLocalEditTimer: number | null = null;

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
 * Force dark mode text colors by injecting an aggressive stylesheet
 */
function enforceDarkModeColors() {
  // Remove any existing style we added
  const existing = document.getElementById('dark-mode-enforcer');
  if (existing) {
    existing.remove();
  }

  const style = document.createElement('style');
  style.id = 'dark-mode-enforcer';
  style.textContent = `
    body.vscode-dark .milkdown,
    body.vscode-dark .crepe {
      background: var(--vscode-editor-background) !important;
      color: var(--vscode-editor-foreground) !important;
    }

    body.vscode-dark .milkdown *,
    body.vscode-dark .crepe * {
      color: var(--vscode-editor-foreground) !important;
      background-color: transparent !important;
    }

    body.vscode-dark .milkdown .ProseMirror,
    body.vscode-dark .crepe .ProseMirror {
      background: var(--vscode-editor-background) !important;
      color: var(--vscode-editor-foreground) !important;
    }

    body.vscode-dark .milkdown .ProseMirror *,
    body.vscode-dark .crepe .ProseMirror * {
      color: var(--vscode-editor-foreground) !important;
    }

    body.vscode-dark .milkdown a,
    body.vscode-dark .crepe a,
    body.vscode-dark .milkdown .ProseMirror a,
    body.vscode-dark .crepe .ProseMirror a {
      color: #569cd6 !important;
    }

    body.vscode-dark .milkdown code,
    body.vscode-dark .crepe code {
      background: rgba(255, 255, 255, 0.1) !important;
      color: #d4d4d4 !important;
    }

    body.vscode-dark .milkdown pre,
    body.vscode-dark .crepe pre {
      background: rgba(0, 0, 0, 0.3) !important;
      color: #d4d4d4 !important;
    }

    body.vscode-dark .milkdown svg,
    body.vscode-dark .crepe svg {
      fill: currentColor !important;
      color: var(--vscode-input-foreground) !important;
    }

    body.vscode-dark .milkdown button,
    body.vscode-dark .crepe button,
    body.vscode-dark .milkdown [role="button"],
    body.vscode-dark .crepe [role="button"] {
      color: var(--vscode-input-foreground) !important;
    }

    body.vscode-dark .milkdown button:hover,
    body.vscode-dark .crepe button:hover {
      background: rgba(255, 255, 255, 0.1) !important;
    }

    body.vscode-dark .milkdown .toolbar,
    body.vscode-dark .crepe .toolbar,
    body.vscode-dark .milkdown .menu,
    body.vscode-dark .crepe .menu {
      background: var(--vscode-input-background) !important;
      border-color: var(--vscode-widget-border) !important;
    }
  `;
  document.head.appendChild(style);
}

/**
 * Watch for DOM changes and re-apply dark mode colors
 */
function setupDarkModeObserver() {
  if (typeof MutationObserver === 'undefined') {
    return;
  }

  const isDarkMode = window.matchMedia('(prefers-color-scheme: dark)').matches;
  if (!isDarkMode) {
    return;
  }

  const editor = document.querySelector('.ProseMirror');
  if (!editor) {
    return;
  }

  const observer = new MutationObserver(() => {
    // Debounce the color enforcement
    clearTimeout((window as any).darkModeEnforceTimeout);
    (window as any).darkModeEnforceTimeout = setTimeout(() => {
      enforceDarkModeColors();
    }, 50);
  });

  observer.observe(editor, {
    childList: true,
    subtree: true,
    attributes: true,
    characterData: false,
  });
}

/**
 * Create a pinned toolbar with formatting options
 */
function createToolbar() {
  const toolbar = document.getElementById('editor-toolbar') as HTMLElement;
  if (!toolbar) return;

  const editor = crepe?.editor;
  if (!editor) return;

  // Clear existing
  toolbar.innerHTML = '';

  // Helper to add a button
  const addButton = (label: string, title: string, command: string, icon?: string) => {
    const button = document.createElement('button');
    button.textContent = icon || label;
    button.title = title;
    button.onclick = () => {
      try {
        editor.action((ctx) => {
          // Execute markdown command
          if (command.startsWith('toggle')) {
            const cmd = command.replace('toggle', '').toLowerCase();
            if (cmd === 'bold') ctx.commands.toggleBold?.();
            else if (cmd === 'italic') ctx.commands.toggleItalic?.();
            else if (cmd === 'code') ctx.commands.toggleInlineCode?.();
            else if (cmd === 'strikethrough') ctx.commands.toggleStrikethrough?.();
          } else if (command.startsWith('wrap')) {
            const type = command.replace('wrap', '').toLowerCase();
            if (type === 'bullet') ctx.commands.wrapInBulletList?.();
            else if (type === 'ordered') ctx.commands.wrapInOrderedList?.();
            else if (type === 'blockquote') ctx.commands.wrapInBlockquote?.();
          } else if (command.startsWith('toggle-heading')) {
            const level = command.charAt(command.length - 1);
            ctx.commands[`toggleHeading${level}`]?.();
          } else if (command === 'codeblock') {
            ctx.commands.toggleCodeBlock?.();
          } else if (command === 'table') {
            ctx.commands.insertTable?.();
          } else if (command === 'hr') {
            ctx.commands.insertHorizontalRule?.();
          }
        });
      } catch (e) {
        console.error('Command failed:', command, e);
      }
    };
    toolbar.appendChild(button);
    return button;
  };

  const addSeparator = () => {
    const sep = document.createElement('div');
    sep.className = 'toolbar-separator';
    toolbar.appendChild(sep);
  };

  // Text formatting
  addButton('B', 'Bold (Ctrl+B)', 'togglebold', '**');
  addButton('I', 'Italic (Ctrl+I)', 'toggleitalic', '_');
  addButton('S', 'Strikethrough', 'togglestrikethrough', '~~');
  addButton('Code', 'Inline Code', 'togglecode', '`');
  addSeparator();

  // Headings
  const headingSelect = document.createElement('select');
  headingSelect.innerHTML = `
    <option value="">Heading</option>
    <option value="toggle-heading-1">Heading 1</option>
    <option value="toggle-heading-2">Heading 2</option>
    <option value="toggle-heading-3">Heading 3</option>
  `;
  headingSelect.onchange = (e) => {
    const cmd = (e.target as HTMLSelectElement).value;
    if (cmd && editor) {
      editor.action((ctx) => {
        const level = cmd.charAt(cmd.length - 1);
        ctx.commands[`toggleHeading${level}`]?.();
      });
    }
    (e.target as HTMLSelectElement).value = '';
  };
  toolbar.appendChild(headingSelect);
  addSeparator();

  // Lists and blocks
  addButton('•', 'Bullet List', 'wrapbullet', '•');
  addButton('1.', 'Ordered List', 'wraported', '1.');
  addButton('"', 'Block Quote', 'wrapblockquote', '"');
  addButton('Code', 'Code Block', 'codeblock', '```');
  addSeparator();

  // Other
  addButton('—', 'Horizontal Rule', 'hr', '—');
  addButton('Table', 'Insert Table', 'table', '⊞');
}

/**
 * Add tooltips to toolbar buttons based on their content/role
 */
function addToolbarTooltips() {
  const buttons = document.querySelectorAll('.crepe button, [role="button"]');
  
  const tooltipMap: Record<string, string> = {
    'bold': 'Bold (Ctrl+B)',
    'italic': 'Italic (Ctrl+I)',
    'strikethrough': 'Strikethrough',
    'code': 'Inline Code',
    'link': 'Insert Link',
    'image': 'Insert Image',
    'h1': 'Heading 1',
    'h2': 'Heading 2',
    'h3': 'Heading 3',
    'bullet': 'Bullet List',
    'ordered': 'Ordered List',
    'quote': 'Block Quote',
    'code-block': 'Code Block',
    'table': 'Insert Table',
    'hr': 'Horizontal Rule',
    'undo': 'Undo',
    'redo': 'Redo',
  };

  buttons.forEach((button) => {
    const btn = button as HTMLElement;
    if (btn.title) return; // Skip if already has tooltip

    const ariaLabel = btn.getAttribute('aria-label');
    const text = btn.textContent?.toLowerCase() || '';
    
    // Try to match by aria-label first, then text content
    let tooltip = tooltipMap[ariaLabel?.toLowerCase() || ''];
    if (!tooltip) {
      for (const [key, value] of Object.entries(tooltipMap)) {
        if (text.includes(key)) {
          tooltip = value;
          break;
        }
      }
    }

    if (tooltip) {
      btn.title = tooltip;
      btn.setAttribute('data-tooltip', tooltip);
    }
  });
}

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
  });

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
    enforceDarkModeColors();
    createToolbar();
    addToolbarTooltips();
    setupDarkModeObserver();
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
    enforceDarkModeColors();
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
  void crepe?.destroy();
  crepe = null;
});

vscode.postMessage({ type: 'ready' });

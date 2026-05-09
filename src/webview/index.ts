/// <reference path="./vscode.d.ts" />

import { Crepe, CrepeFeature } from '@milkdown/crepe';
import '@milkdown/crepe/theme/common/style.css';
import '@milkdown/crepe/theme/frame.css';
import './styles.css';
import { replaceAll } from '@milkdown/kit/utils';
import { commandsCtx, editorViewCtx } from '@milkdown/kit/core';
import { deleteRow, deleteColumn } from '@milkdown/prose/tables';
import {
  toggleStrongCommand,
  toggleEmphasisCommand,
  toggleInlineCodeCommand,
  wrapInBulletListCommand,
  wrapInOrderedListCommand,
  wrapInBlockquoteCommand,
  createCodeBlockCommand,
  insertHrCommand,
  wrapInHeadingCommand,
  turnIntoTextCommand,
} from '@milkdown/kit/preset/commonmark';
import {
  toggleStrikethroughCommand,
  insertTableCommand,
  addRowBeforeCommand,
  addRowAfterCommand,
  addColBeforeCommand,
  addColAfterCommand,
  deleteSelectedCellsCommand,
  selectRowCommand,
  selectColCommand,
  setAlignCommand,
} from '@milkdown/kit/preset/gfm';

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
 * Removed: enforceDarkModeColors() + setupDarkModeObserver().
 *
 * Those functions injected a parallel stylesheet on every keystroke via a
 * MutationObserver, hardcoded hex colors that broke non-Default-Dark themes,
 * and used a universal `*` selector that nuked Crepe's intentional colors.
 * The CSS variable bridge in styles.css already handles theme integration
 * across all VS Code themes (light, dark, high contrast).
 */

// SVG icons for the Word-style toolbar
const ICONS = {
  bold: `<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M3 2h4.5a3.5 3.5 0 0 1 2.46 5.95A3.75 3.75 0 0 1 8.25 15H3V2zm2 2v3.5h2.5a1.5 1.5 0 0 0 0-3H5zm0 5.5V13h3.25a1.75 1.75 0 0 0 0-3.5H5z"/></svg>`,
  italic: `<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M6 2h5v2h-1.79L7.14 12H9v2H4v-2h1.79L7.86 4H6V2z"/></svg>`,
  strikethrough: `<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M8 3c-1.38 0-2.5.56-2.5 1.75 0 .59.27 1.05.73 1.38L2 6c-.55 0-1 .45-1 1s.45 1 1 1h12c.55 0 1-.45 1-1s-.45-1-1-1H9.38c.07-.15.12-.33.12-.5C9.5 3.79 8.83 3 8 3zM5.7 10c.19.5.62 1 1.3 1.25V13H6c-.55 0-1 .45-1 1s.45 1 1 1h4c.55 0 1-.45 1-1s-.45-1-1-1H9v-1.75c1.56-.5 2.5-1.75 2.5-3H5.38c.1.27.2.52.32.75z"/></svg>`,
  inlineCode: `<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M5.28 4.22a.75.75 0 0 0-1.06 1.06L5.94 7 4.22 8.72a.75.75 0 1 0 1.06 1.06l2-2a.75.75 0 0 0 0-1.06l-2-2zm5.44 0a.75.75 0 0 1 1.06 1.06L10.06 7l1.72 1.72a.75.75 0 1 1-1.06 1.06l-2-2a.75.75 0 0 1 0-1.06l2-2z"/></svg>`,
  bulletList: `<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><circle cx="2.5" cy="4" r="1.5"/><rect x="5" y="3" width="9" height="2"/><circle cx="2.5" cy="8" r="1.5"/><rect x="5" y="7" width="9" height="2"/><circle cx="2.5" cy="12" r="1.5"/><rect x="5" y="11" width="9" height="2"/></svg>`,
  orderedList: `<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><rect x="6" y="3" width="9" height="2"/><rect x="6" y="7" width="9" height="2"/><rect x="6" y="11" width="9" height="2"/><path d="M1.5 3h1v3H1V4.5H.5V3.5H1.5V3zM1 9.5V9h2v.5L2.25 11H3V12H1v-.5l1.25-1.5H1V9.5z"/></svg>`,
  blockquote: `<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M3 4a1 1 0 0 1 1-1h2a1 1 0 0 1 0 2H5v1a1 1 0 0 1-2 0V4zm5 0a1 1 0 0 1 1-1h2a1 1 0 0 1 0 2h-1v1a1 1 0 0 1-2 0V4zM2 10h12v2H2v-2z"/></svg>`,
  codeBlock: `<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><rect x="1" y="1" width="14" height="14" rx="2" ry="2" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M5 5.5 2.5 8 5 10.5M11 5.5 13.5 8 11 10.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" fill="none"/></svg>`,
  table: `<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M1 2h14v2H1zm0 4h6v2H1zm0 4h6v2H1zm8-4h6v2H9zm0 4h6v2H9z"/></svg>`,
  hr: `<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><rect x="1" y="7" width="14" height="2"/></svg>`,
  heading: `<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M2 3h2v4h6V3h2v10h-2V9H4v4H2V3z"/></svg>`,
  addRowAbove: `<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M2 9h12v5H2zM2 7h12V6H2zm0-2h12V4H2zM7 .5v3h2v-3z"/></svg>`,
  addRowBelow: `<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M2 2h12v5H2zM2 9h12v1H2zm0 2h12v1H2zm5 4.5v-3h2v3z"/></svg>`,
  addColLeft: `<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M9 2h5v12H9zM7 2H6v12h1zm-2 0H4v12h1zM.5 7h3v2h-3z"/></svg>`,
  addColRight: `<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M2 2h5v12H2zM9 2h1v12H9zm2 0h1v12h-1zm4.5 5v2h-3V7z"/></svg>`,
  deleteRow: `<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M2 4h12v3H2zm0 5h12v3H2zM4.5 1.5l7 7m0-7l-7 7" stroke="currentColor" stroke-width="1.5" fill="none"/></svg>`,
  deleteCol: `<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M2 2h3v12H2zm9 0h3v12h-3zM5.5 4.5l5 5m0-5l-5 5" stroke="currentColor" stroke-width="1.5" fill="none"/></svg>`,
  alignLeft: `<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><rect x="1" y="3" width="14" height="2"/><rect x="1" y="7" width="9" height="2"/><rect x="1" y="11" width="12" height="2"/></svg>`,
  alignCenter: `<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><rect x="1" y="3" width="14" height="2"/><rect x="3.5" y="7" width="9" height="2"/><rect x="2" y="11" width="12" height="2"/></svg>`,
  alignRight: `<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><rect x="1" y="3" width="14" height="2"/><rect x="6" y="7" width="9" height="2"/><rect x="3" y="11" width="12" height="2"/></svg>`,
};

interface ToolbarButtonDef {
  id: string;
  icon: string;
  title: string;
  run: () => void;
  isActive?: () => boolean;
  tableOnly?: boolean;
}

let toolbarButtons: { el: HTMLButtonElement; def: ToolbarButtonDef }[] = [];

/**
 * Create a Word-style pinned toolbar with real Milkdown commands
 */
function createToolbar() {
  const toolbar = document.getElementById('editor-toolbar') as HTMLElement;
  if (!toolbar) return;

  const editor = crepe?.editor;
  if (!editor) return;

  toolbar.innerHTML = '';
  toolbarButtons = [];

  const callCmd = (cmdKey: { key: any }, payload?: any) => {
    editor.action((ctx) => {
      ctx.get(commandsCtx).call(cmdKey.key, payload);
    });
    // Refresh active states after command
    setTimeout(refreshToolbarActiveStates, 50);
  };

  const makeButton = (def: ToolbarButtonDef) => {
    const btn = document.createElement('button');
    btn.innerHTML = def.icon;
    btn.title = def.title;
    btn.setAttribute('aria-label', def.title);
    if (def.tableOnly) btn.classList.add('table-only');
    btn.onclick = () => { def.run(); };
    toolbar.appendChild(btn);
    toolbarButtons.push({ el: btn, def });
    return btn;
  };

  const addSep = (opts?: { tableOnly?: boolean }) => {
    const sep = document.createElement('div');
    sep.className = 'toolbar-separator';
    if (opts?.tableOnly) sep.classList.add('table-only');
    toolbar.appendChild(sep);
  };

  // Heading select
  const headingSelect = document.createElement('select');
  headingSelect.title = 'Paragraph style';
  headingSelect.setAttribute('aria-label', 'Paragraph style');
  headingSelect.innerHTML = `
    <option value="0">Paragraph</option>
    <option value="1">Heading 1</option>
    <option value="2">Heading 2</option>
    <option value="3">Heading 3</option>
  `;
  headingSelect.onchange = (e) => {
    const level = parseInt((e.target as HTMLSelectElement).value, 10);
    if (level > 0) {
      callCmd(wrapInHeadingCommand, level);
    } else {
      callCmd(turnIntoTextCommand);
    }
  };
  toolbar.appendChild(headingSelect);
  addSep();

  // Inline formatting
  makeButton({ id: 'bold', icon: ICONS.bold, title: 'Bold (Ctrl+B)', run: () => callCmd(toggleStrongCommand) });
  makeButton({ id: 'italic', icon: ICONS.italic, title: 'Italic (Ctrl+I)', run: () => callCmd(toggleEmphasisCommand) });
  makeButton({ id: 'strikethrough', icon: ICONS.strikethrough, title: 'Strikethrough', run: () => callCmd(toggleStrikethroughCommand) });
  makeButton({ id: 'inlineCode', icon: ICONS.inlineCode, title: 'Inline Code', run: () => callCmd(toggleInlineCodeCommand) });
  addSep();

  // Block formatting
  makeButton({ id: 'bulletList', icon: ICONS.bulletList, title: 'Bullet List', run: () => callCmd(wrapInBulletListCommand) });
  makeButton({ id: 'orderedList', icon: ICONS.orderedList, title: 'Ordered List', run: () => callCmd(wrapInOrderedListCommand) });
  makeButton({ id: 'blockquote', icon: ICONS.blockquote, title: 'Block Quote', run: () => callCmd(wrapInBlockquoteCommand) });
  makeButton({ id: 'codeBlock', icon: ICONS.codeBlock, title: 'Code Block', run: () => callCmd(createCodeBlockCommand) });
  addSep();

  // Insert
  makeInsertTableButton();
  makeButton({ id: 'hr', icon: ICONS.hr, title: 'Horizontal Rule', run: () => callCmd(insertHrCommand) });
  addSep({ tableOnly: true });
  const runProseCmd = (cmd: (state: any, dispatch: any) => boolean) => {
    if (!crepe?.editor) return;
    crepe.editor.action((ctx) => {
      const view = ctx.get(editorViewCtx);
      cmd(view.state, view.dispatch);
      view.focus();
    });
    setTimeout(refreshToolbarActiveStates, 50);
  };

  makeButton({ id: 'addRowAbove', icon: ICONS.addRowAbove, title: 'Insert Row Above', run: () => callCmd(addRowBeforeCommand), tableOnly: true });
  makeButton({ id: 'addRowBelow', icon: ICONS.addRowBelow, title: 'Insert Row Below', run: () => callCmd(addRowAfterCommand), tableOnly: true });
  makeButton({ id: 'addColLeft', icon: ICONS.addColLeft, title: 'Insert Column Left', run: () => callCmd(addColBeforeCommand), tableOnly: true });
  makeButton({ id: 'addColRight', icon: ICONS.addColRight, title: 'Insert Column Right', run: () => callCmd(addColAfterCommand), tableOnly: true });
  makeButton({ id: 'deleteRow', icon: ICONS.deleteRow, title: 'Delete Row', run: () => runProseCmd(deleteRow), tableOnly: true });
  makeButton({ id: 'deleteCol', icon: ICONS.deleteCol, title: 'Delete Column', run: () => runProseCmd(deleteColumn), tableOnly: true });
  makeButton({ id: 'alignLeft', icon: ICONS.alignLeft, title: 'Align Column Left', run: () => callCmd(setAlignCommand, 'left'), tableOnly: true });
  makeButton({ id: 'alignCenter', icon: ICONS.alignCenter, title: 'Align Column Center', run: () => callCmd(setAlignCommand, 'center'), tableOnly: true });
  makeButton({ id: 'alignRight', icon: ICONS.alignRight, title: 'Align Column Right', run: () => callCmd(setAlignCommand, 'right'), tableOnly: true });

  function makeInsertTableButton() {
    const wrap = document.createElement('div');
    wrap.className = 'table-picker-wrap';

    const btn = document.createElement('button');
    btn.innerHTML = ICONS.table;
    btn.title = 'Insert Table';
    btn.setAttribute('aria-label', 'Insert Table');
    btn.setAttribute('aria-haspopup', 'dialog');
    btn.setAttribute('aria-expanded', 'false');
    wrap.appendChild(btn);

    const popover = document.createElement('div');
    popover.className = 'table-picker-popover';
    popover.setAttribute('role', 'dialog');
    popover.setAttribute('aria-label', 'Choose table size');
    popover.hidden = true;
    const ROWS = 8;
    const COLS = 10;
    const grid = document.createElement('div');
    grid.className = 'table-picker-grid';
    grid.style.setProperty('--cols', String(COLS));

    const cells: HTMLDivElement[] = [];
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const cell = document.createElement('div');
        cell.className = 'table-picker-cell';
        cell.dataset['row'] = String(r + 1);
        cell.dataset['col'] = String(c + 1);
        cells.push(cell);
        grid.appendChild(cell);
      }
    }

    const label = document.createElement('div');
    label.className = 'table-picker-label';
    label.textContent = 'Hover to choose size';

    popover.appendChild(grid);
    popover.appendChild(label);
    // Append popover to body so the toolbar's overflow:hidden doesn't clip it.
    document.body.appendChild(popover);

    const highlight = (row: number, col: number) => {
      for (const cell of cells) {
        const r = parseInt(cell.dataset['row']!, 10);
        const c = parseInt(cell.dataset['col']!, 10);
        cell.classList.toggle('hot', r <= row && c <= col);
      }
      label.textContent = `${col} × ${row}  (cols × rows)`;
    };

    grid.addEventListener('mousemove', (e) => {
      const target = (e.target as HTMLElement).closest('.table-picker-cell') as HTMLElement | null;
      if (!target) return;
      const r = parseInt(target.dataset['row']!, 10);
      const c = parseInt(target.dataset['col']!, 10);
      highlight(r, c);
    });

    grid.addEventListener('mouseleave', () => {
      cells.forEach((cell) => cell.classList.remove('hot'));
      label.textContent = 'Hover to choose size';
    });

    grid.addEventListener('click', (e) => {
      const target = (e.target as HTMLElement).closest('.table-picker-cell') as HTMLElement | null;
      if (!target) return;
      const row = parseInt(target.dataset['row']!, 10);
      const col = parseInt(target.dataset['col']!, 10);
      // GFM tables in Milkdown count the header as row 1 — add 1 so user-picked
      // "row count" means content rows, not "header + content" rows.
      callCmd(insertTableCommand, { row: row + 1, col });
      closePopover();
    });

    const positionPopover = () => {
      const rect = btn.getBoundingClientRect();
      popover.style.top = `${rect.bottom + 4}px`;
      popover.style.left = `${rect.left}px`;
    };

    const openPopover = () => {
      popover.hidden = false;
      positionPopover();
      btn.setAttribute('aria-expanded', 'true');
      document.addEventListener('mousedown', onDocDown, true);
      document.addEventListener('keydown', onDocKey, true);
      window.addEventListener('resize', positionPopover);
      window.addEventListener('scroll', positionPopover, true);
    };
    const closePopover = () => {
      popover.hidden = true;
      btn.setAttribute('aria-expanded', 'false');
      document.removeEventListener('mousedown', onDocDown, true);
      document.removeEventListener('keydown', onDocKey, true);
      window.removeEventListener('resize', positionPopover);
      window.removeEventListener('scroll', positionPopover, true);
    };
    const onDocDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (!wrap.contains(target) && !popover.contains(target)) closePopover();
    };
    const onDocKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { closePopover(); btn.focus(); }
    };

    btn.onclick = () => {
      if (popover.hidden) openPopover(); else closePopover();
    };

    toolbar.appendChild(wrap);
    toolbarButtons.push({ el: btn, def: { id: 'table', icon: ICONS.table, title: 'Insert Table', run: () => {} } });
  }
}

/**
 * Refresh active/pressed state on toolbar buttons based on current ProseMirror selection
 */
function refreshToolbarActiveStates() {
  if (!crepe?.editor) return;

  try {
    crepe.editor.action((ctx) => {
      const view = ctx.get(editorViewCtx);
      const { state } = view;
      const { schema, selection } = state;
      const { $from, from, to, empty } = selection;

      const isMarkActive = (markName: string) => {
        const markType = schema.marks[markName];
        if (!markType) return false;
        if (empty) return !!markType.isInSet(state.storedMarks ?? $from.marks());
        return state.doc.rangeHasMark(from, to, markType);
      };

      const parentNodeName = $from.parent.type.name;
      const headingLevel = parentNodeName === 'heading' ? ($from.parent.attrs['level'] as number) : 0;

      let inTable = false;
      for (let d = $from.depth; d > 0; d--) {
        const n = $from.node(d);
        if (n.type.name === 'table' || n.type.name === 'table_row' || n.type.name === 'table_cell' || n.type.name === 'table_header') {
          inTable = true;
          break;
        }
      }

      const activeMap: Record<string, boolean> = {
        bold: isMarkActive('strong'),
        italic: isMarkActive('em'),
        strikethrough: isMarkActive('strikethrough'),
        inlineCode: isMarkActive('code'),
        bulletList: parentNodeName === 'bullet_list' || $from.node($from.depth - 1)?.type.name === 'bullet_list',
        orderedList: parentNodeName === 'ordered_list' || $from.node($from.depth - 1)?.type.name === 'ordered_list',
        blockquote: parentNodeName === 'blockquote' || $from.node($from.depth - 1)?.type.name === 'blockquote',
        codeBlock: parentNodeName === 'code_block' || parentNodeName === 'fence',
      };

      for (const { el, def } of toolbarButtons) {
        const active = activeMap[def.id] ?? false;
        el.classList.toggle('active', active);
        el.setAttribute('aria-pressed', String(active));
      }
      toolbarButtons[0]?.el.closest('#editor-toolbar')?.classList.toggle('in-table', inTable);

      // Update heading select
      const headingSelect = document.querySelector('#editor-toolbar select') as HTMLSelectElement | null;
      if (headingSelect) {
        headingSelect.value = String(headingLevel);
      }
    });
  } catch {
    // Silently ignore if editor context is not ready
  }
}

/**
 * Wire up ProseMirror selection listener to keep toolbar active states in sync
 */
function setupToolbarActiveStateTracking() {
  if (!crepe?.editor) return;

  crepe.editor.action((ctx) => {
    const view = ctx.get(editorViewCtx);
    const originalDispatch = view.dispatch.bind(view);
    view.dispatch = (tr) => {
      originalDispatch(tr);
      if (tr.selectionSet || tr.docChanged || tr.storedMarksSet) {
        setTimeout(refreshToolbarActiveStates, 0);
      }
    };
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
    features: {
      [CrepeFeature.Toolbar]: false,
      [CrepeFeature.LinkTooltip]: false,
    },
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
    createToolbar();
    setupToolbarActiveStateTracking();
    refreshToolbarActiveStates();
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
  void crepe?.destroy();
  crepe = null;
});

vscode.postMessage({ type: 'ready' });

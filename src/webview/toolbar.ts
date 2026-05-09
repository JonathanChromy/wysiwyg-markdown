import type { Crepe } from '@milkdown/crepe';
import type { CmdKey } from '@milkdown/kit/core';
import { commandsCtx, editorViewCtx } from '@milkdown/kit/core';
import {
  createCodeBlockCommand,
  insertHrCommand,
  toggleEmphasisCommand,
  toggleInlineCodeCommand,
  toggleStrongCommand,
  turnIntoTextCommand,
  wrapInBlockquoteCommand,
  wrapInBulletListCommand,
  wrapInHeadingCommand,
  wrapInOrderedListCommand,
} from '@milkdown/kit/preset/commonmark';
import {
  addColAfterCommand,
  addColBeforeCommand,
  addRowAfterCommand,
  addRowBeforeCommand,
  insertTableCommand,
  setAlignCommand,
  toggleStrikethroughCommand,
} from '@milkdown/kit/preset/gfm';
import type { EditorView } from '@milkdown/kit/prose/view';
import { deleteColumn, deleteRow } from '@milkdown/prose/tables';
import { getToolbarState, type ToolbarState } from './toolbarState';

type MilkdownEditor = Crepe['editor'];
type ToolbarCommand<T = unknown> = { key: CmdKey<T> };
type ToolbarActionId = keyof Omit<ToolbarState, 'headingLevel' | 'inTable'>
  | 'table'
  | 'addRowAbove'
  | 'addRowBelow'
  | 'addColLeft'
  | 'addColRight'
  | 'deleteRow'
  | 'deleteCol'
  | 'alignLeft'
  | 'alignCenter'
  | 'alignRight';

interface ToolbarAction<T = unknown> {
  id: ToolbarActionId;
  title: string;
  icon: string;
  command?: ToolbarCommand<T>;
  payload?: T;
  run?: () => void;
  tableOnly?: boolean;
}

interface CommandAction<T = unknown> {
  id: string;
  command?: ToolbarCommand<T>;
  payload?: T;
}

interface ToolbarButton {
  element: HTMLButtonElement;
  action: ToolbarAction;
}

export interface ToolbarController {
  refresh: () => void;
  dispose: () => void;
}

interface SetupToolbarOptions {
  toolbar: HTMLElement;
  editor: MilkdownEditor;
  log?: (message: string, error?: unknown) => void;
}

const TOOLBAR_REFRESH_DELAY_MS = 50;
const TABLE_PICKER_ROWS = 8;
const TABLE_PICKER_COLUMNS = 10;
const DUPLICATE_LINE_BREAKS = /\n{2,}/g;

const ICONS = {
  bold: '<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M3 2h4.5a3.5 3.5 0 0 1 2.46 5.95A3.75 3.75 0 0 1 8.25 15H3V2zm2 2v3.5h2.5a1.5 1.5 0 0 0 0-3H5zm0 5.5V13h3.25a1.75 1.75 0 0 0 0-3.5H5z"/></svg>',
  italic: '<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M6 2h5v2H9.21L7.14 12H9v2H4v-2h1.79L7.86 4H6V2z"/></svg>',
  strikethrough: '<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M8 3c-1.38 0-2.5.56-2.5 1.75 0 .59.27 1.05.73 1.38L2 6a1 1 0 0 0 0 2h12a1 1 0 1 0 0-2H9.38c.07-.15.12-.33.12-.5C9.5 3.79 8.83 3 8 3zM5.7 10c.19.5.62 1 1.3 1.25V13H6a1 1 0 1 0 0 2h4a1 1 0 1 0 0-2H9v-1.75c1.56-.5 2.5-1.75 2.5-3H5.38c.1.27.2.52.32.75z"/></svg>',
  inlineCode: '<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M5.28 4.22a.75.75 0 0 0-1.06 1.06L5.94 7 4.22 8.72a.75.75 0 1 0 1.06 1.06l2-2a.75.75 0 0 0 0-1.06l-2-2zm5.44 0a.75.75 0 0 1 1.06 1.06L10.06 7l1.72 1.72a.75.75 0 1 1-1.06 1.06l-2-2a.75.75 0 0 1 0-1.06l2-2z"/></svg>',
  bulletList: '<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><circle cx="2.5" cy="4" r="1.5"/><rect x="5" y="3" width="9" height="2"/><circle cx="2.5" cy="8" r="1.5"/><rect x="5" y="7" width="9" height="2"/><circle cx="2.5" cy="12" r="1.5"/><rect x="5" y="11" width="9" height="2"/></svg>',
  orderedList: '<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><rect x="6" y="3" width="9" height="2"/><rect x="6" y="7" width="9" height="2"/><rect x="6" y="11" width="9" height="2"/><path d="M1.5 3h1v3H1V4.5H.5V3.5h1V3zM1 9.5V9h2v.5L2.25 11H3v1H1v-.5L2.25 10H1v-.5z"/></svg>',
  blockquote: '<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M3 4a1 1 0 0 1 1-1h2a1 1 0 1 1 0 2H5v1a1 1 0 1 1-2 0V4zm5 0a1 1 0 0 1 1-1h2a1 1 0 1 1 0 2h-1v1a1 1 0 1 1-2 0V4zM2 10h12v2H2v-2z"/></svg>',
  codeBlock: '<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><rect x="1" y="1" width="14" height="14" rx="2" ry="2" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M5 5.5 2.5 8 5 10.5M11 5.5 13.5 8 11 10.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" fill="none"/></svg>',
  table: '<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M1 2h14v2H1zm0 4h6v2H1zm0 4h6v2H1zm8-4h6v2H9zm0 4h6v2H9z"/></svg>',
  hr: '<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><rect x="1" y="7" width="14" height="2"/></svg>',
  addRowAbove: '<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M2 9h12v5H2zM2 7h12V6H2zm0-2h12V4H2zM7 .5v3h2v-3z"/></svg>',
  addRowBelow: '<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M2 2h12v5H2zM2 9h12v1H2zm0 2h12v1H2zm5 4.5v-3h2v3z"/></svg>',
  addColLeft: '<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M9 2h5v12H9zM7 2H6v12h1zm-2 0H4v12h1zM.5 7h3v2h-3z"/></svg>',
  addColRight: '<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M2 2h5v12H2zM9 2h1v12H9zm2 0h1v12h-1zm4.5 5v2h-3V7z"/></svg>',
  deleteRow: '<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M2 4h12v3H2zm0 5h12v3H2zM4.5 1.5l7 7m0-7-7 7" stroke="currentColor" stroke-width="1.5" fill="none"/></svg>',
  deleteCol: '<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M2 2h3v12H2zm9 0h3v12h-3zM5.5 4.5l5 5m0-5-5 5" stroke="currentColor" stroke-width="1.5" fill="none"/></svg>',
  alignLeft: '<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><rect x="1" y="3" width="14" height="2"/><rect x="1" y="7" width="9" height="2"/><rect x="1" y="11" width="12" height="2"/></svg>',
  alignCenter: '<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><rect x="1" y="3" width="14" height="2"/><rect x="3.5" y="7" width="9" height="2"/><rect x="2" y="11" width="12" height="2"/></svg>',
  alignRight: '<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><rect x="1" y="3" width="14" height="2"/><rect x="6" y="7" width="9" height="2"/><rect x="3" y="11" width="12" height="2"/></svg>',
};

const toolbarGroups: ToolbarAction[][] = [
  [
    { id: 'bold', title: 'Bold (Ctrl+B)', icon: ICONS.bold, command: toggleStrongCommand },
    { id: 'italic', title: 'Italic (Ctrl+I)', icon: ICONS.italic, command: toggleEmphasisCommand },
    { id: 'strikethrough', title: 'Strikethrough', icon: ICONS.strikethrough, command: toggleStrikethroughCommand },
    { id: 'inlineCode', title: 'Inline Code', icon: ICONS.inlineCode, command: toggleInlineCodeCommand },
  ],
  [
    { id: 'bulletList', title: 'Bullet List', icon: ICONS.bulletList, command: wrapInBulletListCommand },
    { id: 'orderedList', title: 'Ordered List', icon: ICONS.orderedList, command: wrapInOrderedListCommand },
    { id: 'blockquote', title: 'Block Quote', icon: ICONS.blockquote, command: wrapInBlockquoteCommand },
    { id: 'codeBlock', title: 'Code Block', icon: ICONS.codeBlock, command: createCodeBlockCommand },
  ],
  [
    { id: 'hr', title: 'Horizontal Rule', icon: ICONS.hr, command: insertHrCommand },
  ],
];

const tableActions: ToolbarAction[] = [
  { id: 'addRowAbove', title: 'Insert Row Above', icon: ICONS.addRowAbove, command: addRowBeforeCommand, tableOnly: true },
  { id: 'addRowBelow', title: 'Insert Row Below', icon: ICONS.addRowBelow, command: addRowAfterCommand, tableOnly: true },
  { id: 'addColLeft', title: 'Insert Column Left', icon: ICONS.addColLeft, command: addColBeforeCommand, tableOnly: true },
  { id: 'addColRight', title: 'Insert Column Right', icon: ICONS.addColRight, command: addColAfterCommand, tableOnly: true },
  { id: 'deleteRow', title: 'Delete Row', icon: ICONS.deleteRow, tableOnly: true },
  { id: 'deleteCol', title: 'Delete Column', icon: ICONS.deleteCol, tableOnly: true },
  { id: 'alignLeft', title: 'Align Column Left', icon: ICONS.alignLeft, command: setAlignCommand, payload: 'left', tableOnly: true },
  { id: 'alignCenter', title: 'Align Column Center', icon: ICONS.alignCenter, command: setAlignCommand, payload: 'center', tableOnly: true },
  { id: 'alignRight', title: 'Align Column Right', icon: ICONS.alignRight, command: setAlignCommand, payload: 'right', tableOnly: true },
];

function callCommand<T>(
  editor: MilkdownEditor,
  action: CommandAction<T>,
  log: SetupToolbarOptions['log'],
) {
  if (!action.command) {
    return;
  }

  try {
    editor.action((ctx) => {
      const didRun = ctx.get(commandsCtx).call(action.command.key, action.payload);
      if (!didRun) {
        log?.(`Toolbar command did not run: ${action.id}`);
      }
    });
  } catch (error) {
    log?.(`Toolbar command failed: ${action.id}`, error);
  }
}

function runProseCommand(
  editor: MilkdownEditor,
  command: (state: EditorView['state'], dispatch?: EditorView['dispatch']) => boolean,
  refresh: () => void,
) {
  editor.action((ctx) => {
    const view = ctx.get(editorViewCtx);
    command(view.state, view.dispatch);
    view.focus();
  });
  window.setTimeout(refresh, TOOLBAR_REFRESH_DELAY_MS);
}

function normalizeCodeBlockSelection(text: string): string {
  return text
    .replace(/\r\n?/g, '\n')
    .replace(DUPLICATE_LINE_BREAKS, '\n')
    .replace(/^\n+|\n+$/g, '');
}

function findAncestorDepth(state: EditorView['state'], nodeName: string): number | null {
  const { $from } = state.selection;

  for (let depth = $from.depth; depth > 0; depth -= 1) {
    if ($from.node(depth).type.name === nodeName) {
      return depth;
    }
  }

  return null;
}

function toggleCodeBlockOffIfActive(editor: MilkdownEditor): boolean {
  let didToggle = false;

  editor.action((ctx) => {
    const view = ctx.get(editorViewCtx);
    const { state } = view;
    const codeBlockDepth = findAncestorDepth(state, 'code_block');

    if (codeBlockDepth === null) {
      return;
    }

    const codeBlock = state.selection.$from.node(codeBlockDepth);
    const paragraphType = state.schema.nodes['paragraph'];
    if (!paragraphType) {
      return;
    }

    const text = normalizeCodeBlockSelection(codeBlock.textContent);
    const paragraphs = (text ? text.split('\n') : ['']).map((line) =>
      paragraphType.create(null, line ? state.schema.text(line) : undefined),
    );

    const from = state.selection.$from.before(codeBlockDepth);
    const to = state.selection.$from.after(codeBlockDepth);
    view.dispatch(state.tr.replaceWith(from, to, paragraphs).scrollIntoView());
    view.focus();
    didToggle = true;
  });

  return didToggle;
}

function createCodeBlockFromSelection(
  editor: MilkdownEditor,
  refresh: () => void,
  log: SetupToolbarOptions['log'],
) {
  try {
    if (toggleCodeBlockOffIfActive(editor)) {
      window.setTimeout(refresh, TOOLBAR_REFRESH_DELAY_MS);
      return;
    }

    let handled = false;

    editor.action((ctx) => {
      const view = ctx.get(editorViewCtx);
      const { state } = view;
      const { from, to, empty } = state.selection;
      const selectedText = state.doc.textBetween(from, to, '\n');

      if (empty || !selectedText.includes('\n')) {
        return;
      }

      const codeBlockType = state.schema.nodes['code_block'];
      if (!codeBlockType) {
        log?.('Toolbar command did not run: codeBlock; code_block schema node was not found');
        return;
      }

      const normalizedText = normalizeCodeBlockSelection(selectedText);
      const codeBlock = codeBlockType.create(
        null,
        normalizedText ? state.schema.text(normalizedText) : undefined,
      );

      view.dispatch(state.tr.replaceSelectionWith(codeBlock, false).scrollIntoView());
      view.focus();
      handled = true;
    });

    if (!handled) {
      callCommand(editor, { id: 'codeBlock', command: createCodeBlockCommand }, log);
    }
  } catch (error) {
    log?.('Toolbar command failed: codeBlock', error);
  }

  window.setTimeout(refresh, TOOLBAR_REFRESH_DELAY_MS);
}

function createSeparator(tableOnly = false) {
  const separator = document.createElement('div');
  separator.className = 'toolbar-separator';
  separator.classList.toggle('table-only', tableOnly);
  return separator;
}

function createHeadingSelect(editor: MilkdownEditor, refresh: () => void, log: SetupToolbarOptions['log']) {
  const select = document.createElement('select');
  select.title = 'Paragraph style';
  select.setAttribute('aria-label', 'Paragraph style');
  select.innerHTML = `
    <option value="0">Paragraph</option>
    <option value="1">Heading 1</option>
    <option value="2">Heading 2</option>
    <option value="3">Heading 3</option>
  `;

  select.onchange = () => {
    const level = Number(select.value);
    if (level > 0) {
      callCommand(editor, {
        id: `heading-${level}`,
        command: wrapInHeadingCommand,
        payload: level,
      }, log);
    } else {
      callCommand(editor, {
        id: 'paragraph',
        command: turnIntoTextCommand,
      }, log);
    }
    window.setTimeout(refresh, TOOLBAR_REFRESH_DELAY_MS);
  };

  return select;
}

function createButton(
  editor: MilkdownEditor,
  action: ToolbarAction,
  refresh: () => void,
  log: SetupToolbarOptions['log'],
) {
  const button = document.createElement('button');
  button.innerHTML = action.icon;
  button.title = action.title;
  button.setAttribute('aria-label', action.title);
  button.setAttribute('aria-pressed', 'false');
  button.classList.toggle('table-only', !!action.tableOnly);
  button.onclick = () => {
    if (action.run) {
      action.run();
    } else {
      callCommand(editor, action, log);
      window.setTimeout(refresh, TOOLBAR_REFRESH_DELAY_MS);
    }
  };

  return button;
}

function createTablePicker(
  editor: MilkdownEditor,
  refresh: () => void,
  log: SetupToolbarOptions['log'],
): { element: HTMLElement; button: HTMLButtonElement; dispose: () => void } {
  const wrap = document.createElement('div');
  wrap.className = 'table-picker-wrap';

  const button = document.createElement('button');
  button.innerHTML = ICONS.table;
  button.title = 'Insert Table';
  button.setAttribute('aria-label', 'Insert Table');
  button.setAttribute('aria-haspopup', 'dialog');
  button.setAttribute('aria-expanded', 'false');
  wrap.appendChild(button);

  const popover = document.createElement('div');
  popover.className = 'table-picker-popover';
  popover.setAttribute('role', 'dialog');
  popover.setAttribute('aria-label', 'Choose table size');
  popover.hidden = true;

  const grid = document.createElement('div');
  grid.className = 'table-picker-grid';
  grid.style.setProperty('--cols', String(TABLE_PICKER_COLUMNS));

  const cells: HTMLDivElement[] = [];
  for (let row = 0; row < TABLE_PICKER_ROWS; row += 1) {
    for (let col = 0; col < TABLE_PICKER_COLUMNS; col += 1) {
      const cell = document.createElement('div');
      cell.className = 'table-picker-cell';
      cell.dataset['row'] = String(row + 1);
      cell.dataset['col'] = String(col + 1);
      cells.push(cell);
      grid.appendChild(cell);
    }
  }

  const label = document.createElement('div');
  label.className = 'table-picker-label';
  label.textContent = 'Hover to choose size';

  popover.appendChild(grid);
  popover.appendChild(label);
  document.body.appendChild(popover);

  const highlight = (row: number, col: number) => {
    for (const cell of cells) {
      const cellRow = Number(cell.dataset['row']);
      const cellCol = Number(cell.dataset['col']);
      cell.classList.toggle('hot', cellRow <= row && cellCol <= col);
    }
    label.textContent = `${col} x ${row}  (cols x rows)`;
  };

  const positionPopover = () => {
    const rect = button.getBoundingClientRect();
    popover.style.top = `${rect.bottom + 4}px`;
    popover.style.left = `${rect.left}px`;
  };

  const closePopover = () => {
    popover.hidden = true;
    button.setAttribute('aria-expanded', 'false');
    document.removeEventListener('mousedown', onDocumentMouseDown, true);
    document.removeEventListener('keydown', onDocumentKeyDown, true);
    window.removeEventListener('resize', positionPopover);
    window.removeEventListener('scroll', positionPopover, true);
  };

  const openPopover = () => {
    popover.hidden = false;
    positionPopover();
    button.setAttribute('aria-expanded', 'true');
    document.addEventListener('mousedown', onDocumentMouseDown, true);
    document.addEventListener('keydown', onDocumentKeyDown, true);
    window.addEventListener('resize', positionPopover);
    window.addEventListener('scroll', positionPopover, true);
  };

  function onDocumentMouseDown(event: MouseEvent) {
    const target = event.target as Node;
    if (!wrap.contains(target) && !popover.contains(target)) {
      closePopover();
    }
  }

  function onDocumentKeyDown(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      closePopover();
      button.focus();
    }
  }

  grid.addEventListener('mousemove', (event) => {
    const target = (event.target as HTMLElement).closest('.table-picker-cell') as HTMLElement | null;
    if (!target) {
      return;
    }

    highlight(Number(target.dataset['row']), Number(target.dataset['col']));
  });

  grid.addEventListener('mouseleave', () => {
    cells.forEach((cell) => cell.classList.remove('hot'));
    label.textContent = 'Hover to choose size';
  });

  grid.addEventListener('click', (event) => {
    const target = (event.target as HTMLElement).closest('.table-picker-cell') as HTMLElement | null;
    if (!target) {
      return;
    }

    const row = Number(target.dataset['row']);
    const col = Number(target.dataset['col']);
    callCommand(editor, {
      id: 'table',
      command: insertTableCommand,
      payload: { row: row + 1, col },
    }, log);
    closePopover();
    window.setTimeout(refresh, TOOLBAR_REFRESH_DELAY_MS);
  });

  button.onclick = () => {
    if (popover.hidden) {
      openPopover();
      return;
    }

    closePopover();
  };

  return {
    element: wrap,
    button,
    dispose: () => {
      closePopover();
      popover.remove();
    },
  };
}

function attachToolbarStateTracking(editor: MilkdownEditor, refresh: () => void): () => void {
  let originalDispatch: EditorView['dispatch'] | undefined;

  editor.action((ctx) => {
    const view = ctx.get(editorViewCtx);
    originalDispatch = view.dispatch.bind(view);

    view.dispatch = (transaction) => {
      originalDispatch?.(transaction);

      if (transaction.selectionSet || transaction.docChanged || transaction.storedMarksSet) {
        window.setTimeout(refresh, 0);
      }
    };
  });

  return () => {
    if (!originalDispatch) {
      return;
    }

    editor.action((ctx) => {
      ctx.get(editorViewCtx).dispatch = originalDispatch;
    });
  };
}

export function setupToolbar({
  toolbar,
  editor,
  log,
}: SetupToolbarOptions): ToolbarController {
  const buttons: ToolbarButton[] = [];
  const disposables: Array<() => void> = [];
  toolbar.innerHTML = '';

  const refresh = () => {
    editor.action((ctx) => {
      const state = getToolbarState(ctx.get(editorViewCtx).state);

      for (const { element, action } of buttons) {
        const activeValue = state[action.id as keyof ToolbarState];
        const isActive = typeof activeValue === 'boolean' ? activeValue : false;
        element.classList.toggle('active', isActive);
        element.setAttribute('aria-pressed', String(isActive));
      }

      toolbar.classList.toggle('in-table', state.inTable);
      headingSelect.value = String(state.headingLevel);
    });
  };

  const headingSelect = createHeadingSelect(editor, refresh, log);
  toolbar.appendChild(headingSelect);
  toolbar.appendChild(createSeparator());

  toolbarGroups.forEach((group, groupIndex) => {
    if (groupIndex > 0) {
      toolbar.appendChild(createSeparator());
    }

    for (const action of group) {
      const toolbarAction = { ...action };
      if (toolbarAction.id === 'codeBlock') {
        toolbarAction.run = () => createCodeBlockFromSelection(editor, refresh, log);
      }

      const element = createButton(editor, toolbarAction, refresh, log);
      toolbar.appendChild(element);
      buttons.push({ element, action: toolbarAction });
    }
  });

  const tablePicker = createTablePicker(editor, refresh, log);
  toolbar.appendChild(tablePicker.element);
  buttons.push({
    element: tablePicker.button,
    action: { id: 'table', title: 'Insert Table', icon: ICONS.table },
  });
  disposables.push(tablePicker.dispose);

  toolbar.appendChild(createSeparator(true));
  for (const action of tableActions) {
    const tableAction = { ...action };
    if (action.id === 'deleteRow') {
      tableAction.run = () => runProseCommand(editor, deleteRow, refresh);
    } else if (action.id === 'deleteCol') {
      tableAction.run = () => runProseCommand(editor, deleteColumn, refresh);
    }

    const element = createButton(editor, tableAction, refresh, log);
    toolbar.appendChild(element);
    buttons.push({ element, action: tableAction });
  }

  disposables.push(attachToolbarStateTracking(editor, refresh));
  refresh();

  return {
    refresh,
    dispose: () => {
      for (const dispose of disposables) {
        dispose();
      }
    },
  };
}

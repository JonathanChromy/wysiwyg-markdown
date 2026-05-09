import type { EditorState } from '@milkdown/kit/prose/state';

export interface ToolbarState {
  bold: boolean;
  italic: boolean;
  strikethrough: boolean;
  inlineCode: boolean;
  bulletList: boolean;
  orderedList: boolean;
  blockquote: boolean;
  codeBlock: boolean;
  inTable: boolean;
  headingLevel: number;
}

function isMarkActive(state: EditorState, markName: string): boolean {
  const markType = state.schema.marks[markName];
  if (!markType) {
    return false;
  }

  const { from, to, empty, $from } = state.selection;
  if (empty) {
    return !!markType.isInSet(state.storedMarks ?? $from.marks());
  }

  return state.doc.rangeHasMark(from, to, markType);
}

function hasAncestorNode(state: EditorState, nodeName: string): boolean {
  const { $from } = state.selection;

  for (let depth = $from.depth; depth >= 0; depth -= 1) {
    if ($from.node(depth).type.name === nodeName) {
      return true;
    }
  }

  return false;
}

export function getToolbarState(state: EditorState): ToolbarState {
  const parent = state.selection.$from.parent;

  return {
    bold: isMarkActive(state, 'strong'),
    italic: isMarkActive(state, 'em'),
    strikethrough: isMarkActive(state, 'strike_through'),
    inlineCode: isMarkActive(state, 'code'),
    bulletList: hasAncestorNode(state, 'bullet_list'),
    orderedList: hasAncestorNode(state, 'ordered_list'),
    blockquote: hasAncestorNode(state, 'blockquote'),
    codeBlock: parent.type.name === 'code_block' || parent.type.name === 'fence',
    inTable: hasAncestorNode(state, 'table')
      || hasAncestorNode(state, 'table_row')
      || hasAncestorNode(state, 'table_cell')
      || hasAncestorNode(state, 'table_header'),
    headingLevel: parent.type.name === 'heading' ? Number(parent.attrs['level'] ?? 0) : 0,
  };
}

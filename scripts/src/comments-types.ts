// Shared shapes for the review-comment layer (see comments.ts).

export interface CommentStrings {
  comment: string;
  placeholder: string;
  hint: string;
  save: string;
  cancel: string;
  edit: string;
  remove: string;
  copy: string;
  copied: string;
  copyFailed: string;
  copyEmpty: string;
  list: string;
  jump: string;
  clear: string;
  clearConfirm: string;
  close: string;
  selected: string;
  locTitle: string;
  locSummary: string;
  locParagraph: string;
  locItem: string;
  locDiagram: string;
  locPopover: string;
  locFile: string;
  answers: string;
  decision: string;
  verdictApprove: string;
  verdictChanges: string;
  decisionNote: string;
}

export const DEFAULT_STRINGS: CommentStrings = {
  comment: "Comment",
  placeholder: "Write a comment…",
  hint: "Ctrl+Enter to save",
  save: "Save",
  cancel: "Cancel",
  edit: "Edit",
  remove: "Delete",
  copy: "Copy comments",
  copied: "Copied",
  copyFailed: "Copy failed",
  copyEmpty: "No comments yet. Hover a block, or select text, to add one.",
  list: "Comments",
  jump: "Jump to",
  clear: "Clear all",
  clearConfirm: "Click again to clear",
  close: "Close",
  selected: "Selected text",
  locTitle: "Title",
  locSummary: "Summary",
  locParagraph: "Paragraph",
  locItem: "Item",
  locDiagram: "Diagram",
  locPopover: "Detail popover",
  locFile: "File view",
  answers: "Answers",
  decision: "Decision",
  verdictApprove: "Approve",
  verdictChanges: "Request changes",
  decisionNote: "Note",
};

/** Live elements that show a comment exists: a bar on the block, a dot on the thing that opens it. */
export interface Marks {
  blocks: Element[];
  triggers: Element[];
}

/**
 * What a comment is attached to, captured when the comment is made. The popover
 * for a reference and the file dialog are re-rendered on every open, so an anchor
 * keeps text, never a pointer into that DOM.
 */
export interface Anchor {
  key: string;
  section: string;
  /** Manifest path from the nearest `data-nsx-field` (innermost wins); empty when none. */
  field: string;
  where: string;
  excerpt: string;
  files: string[];
  /** Element that fixes this anchor's place in the document, for ordering. */
  sortEl: Element;
  /** Order among anchors that share a `sortEl` (hunk index, line number). */
  sub: number;
  marks(): Marks;
  /** Bring the place back on screen: scroll to it, or reopen the popover or file that held it. */
  reveal(): void;
}

/** What the pointer or a selection is over right now. */
export interface Target {
  key: string;
  /** Element the floating comment UI is mounted in. A modal dialog makes everything outside it inert. */
  host: HTMLElement;
  /** True when the place lives in the top layer or a fixed box: the UI then uses viewport coordinates. */
  fixed: boolean;
  /** `outside`: the icon sits beside the box when there is room. `inside`: it sits in the box's top-right corner. */
  side: "outside" | "inside";
  /** The block itself, for vertical alignment. */
  rect(): DOMRect;
  /** The box whose right edge the icon sits beside (the popover or dialog, else the block). */
  edge(): DOMRect;
  /** The box the icon must stay inside vertically, when the block scrolls within a smaller box. */
  clip?(): DOMRect;
  /** False once the popover closed, the dialog moved on to another file, or the block left the page. */
  alive(): boolean;
  anchor(): Anchor;
}

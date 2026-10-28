// Copy shared by every template: the comment layer and the file view. Vietnamese is the default.

import type { Lang } from "./template.ts";

export interface SharedCopy {
  viewFile: string;
  comments: Record<string, string>;
}

export const SHARED_COPY: Record<Lang, SharedCopy> = {
  vi: {
    viewFile: "Xem file",
    comments: {
      comment: "Bình luận", placeholder: "Viết bình luận…", hint: "Ctrl+Enter để lưu",
      save: "Lưu", cancel: "Hủy", edit: "Sửa", remove: "Xóa",
      copy: "Sao chép bình luận", copied: "Đã sao chép", copyFailed: "Không sao chép được",
      copyEmpty: "Chưa có bình luận. Rê chuột vào một đoạn, hoặc bôi đen chữ, để thêm.",
      list: "Bình luận", jump: "Đến chỗ này", clear: "Xóa tất cả",
      clearConfirm: "Bấm lại để xóa hết", close: "Đóng",
      selected: "Đoạn đã chọn", locTitle: "Tiêu đề", locSummary: "Tóm tắt",
      locParagraph: "Đoạn", locItem: "Mục", locDiagram: "Sơ đồ",
      locPopover: "Giải thích chi tiết", locFile: "Xem file",
    },
  },
  en: {
    viewFile: "View file",
    comments: {
      comment: "Comment", placeholder: "Write a comment…", hint: "Ctrl+Enter to save",
      save: "Save", cancel: "Cancel", edit: "Edit", remove: "Delete",
      copy: "Copy comments", copied: "Copied", copyFailed: "Copy failed",
      copyEmpty: "No comments yet. Hover a block, or select text, to add one.",
      list: "Comments", jump: "Jump to", clear: "Clear all",
      clearConfirm: "Click again to clear", close: "Close",
      selected: "Selected text", locTitle: "Title", locSummary: "Summary",
      locParagraph: "Paragraph", locItem: "Item", locDiagram: "Diagram",
      locPopover: "Detail popover", locFile: "File view",
    },
  },
};

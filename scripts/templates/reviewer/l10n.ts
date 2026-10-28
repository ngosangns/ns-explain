// Copy for the reviewer template. Vietnamese is the default.

import type { Lang } from "../../core/template.ts";

export interface TestCopy {
  title: string; notRun: string; passed: string; skipped: string;
  scope: string; scopes: Record<string, string>; command: string;
  failedHead: string; failedNone: string; earlier: string; cause: string;
  changesHead: string; specDesc: string; kinds: Record<string, string>;
}
export interface PlanCopy {
  title: string; fileDesc: string; touched: (n: number, m: number) => string;
  status: Record<string, string>; states: Record<string, string>;
}
export interface Copy {
  plan: PlanCopy;
  features: string;
  plain: string;
  diagram: string;
  flows: string;
  groups: Record<string, string>;
  tests: TestCopy;
}

export const L10N: Record<Lang, Copy> = {
  vi: {
    plan: {
      title: "Kế hoạch liên quan", fileDesc: "Kế hoạch mà change này thực hiện.",
      touched: (n, m) => `${n} / ${m} bước của kế hoạch chạm tới change này`,
      status: { draft: "Bản nháp", approved: "Đã duyệt", "in-progress": "Đang làm", done: "Xong" },
      states: { todo: "Chưa làm", doing: "Đang làm", done: "Xong", blocked: "Bị chặn" },
    },
    features: "Tính năng bị ảnh hưởng", plain: "Nói cho dễ hiểu",
    tests: {
      title: "Kết quả test", notRun: "Chưa chạy test", passed: "đạt", skipped: "bỏ qua",
      scope: "Phạm vi", scopes: { full: "Toàn bộ repo", package: "Cả package", related: "Chỉ spec liên quan" },
      command: "Lệnh chạy", failedHead: "Test lỗi", failedNone: "Không có test nào lỗi.",
      earlier: "Lần chạy trước đó", cause: "Nguyên nhân",
      changesHead: "Test thêm hoặc sửa trong change này",
      specDesc: "File spec có test thêm hoặc sửa trong change này.",
      kinds: { added: "Thêm", modified: "Sửa" },
    },
    diagram: "Sơ đồ", flows: "Luồng chạy",
    groups: { added: "Thêm", modified: "Sửa", removed: "Xóa" },
  },
  en: {
    plan: {
      title: "Related plan", fileDesc: "The plan this change carries out.",
      touched: (n, m) => `${n} / ${m} plan steps touch this change`,
      status: { draft: "Draft", approved: "Approved", "in-progress": "In progress", done: "Done" },
      states: { todo: "To do", doing: "Doing", done: "Done", blocked: "Blocked" },
    },
    tests: {
      title: "Test results", notRun: "Tests not run", passed: "passed", skipped: "skipped",
      scope: "Scope", scopes: { full: "Whole repo", package: "Whole package", related: "Related specs only" },
      command: "Command", failedHead: "Failed tests", failedNone: "No test failed.",
      earlier: "Earlier run", cause: "Cause",
      changesHead: "Tests added or edited in this change",
      specDesc: "Spec file with tests added or edited in this change.",
      kinds: { added: "Added", modified: "Modified" },
    },
    features: "Features affected", plain: "In plain terms",
    diagram: "Diagram", flows: "Flows",
    groups: { added: "Added", modified: "Modified", removed: "Removed" },
  },
};

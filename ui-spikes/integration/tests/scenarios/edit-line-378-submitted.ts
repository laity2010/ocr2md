import type { UiInteractionContract } from "../uic/schema";

export const editLine378Submitted: UiInteractionContract = {
  id: "UIC-CLEAN-004",
  title: "正文单行修改进入变动行",
  area: "清洗工作区 / 变动行",
  intent: "验证普通正文的单行字符修正不会被章节标题或自动非法断行候选吞掉，而是可靠进入变动行审计表。",
  automation: "browser",
  fixture: {
    mode: "ui-test",
    source: "source.md",
    baseline: "source",
  },
  preconditions: [
    "使用固定 Buffett’s Alpha source.md 作为原稿和初始 working。",
    "第 378 行包含 Submited 24 April 2018...",
  ],
  steps: [
    {
      action: "replaceInLine",
      line: 378,
      search: "Submited",
      replace: "Submitted",
      note: "模拟用户在源码窗修正 OCR 拼写。",
    },
  ],
  expectations: [
    {
      kind: "gridRow",
      module: "变动行",
      line: 378,
      change: "修改",
      owner: "未归类",
      text: "Submitted 24 April 2018 Accepted 15 June 2018 by Stephen J. Brown",
      changed: true,
      navigable: true,
      note: "普通正文修改必须无条件进入变动行，不能被自动非法断行候选范围吞掉。",
    },
  ],
  invariants: [
    "变动行是完整 diff 审计表，任何正文修改都不能凭空消失。",
    "自动识别的非法断行候选不能独占其覆盖范围内的正文 diff。",
    "普通正文修改不应被误标为章节标题。",
    "修改记录必须可以点击预览跳转到 working 对应位置。",
  ],
  evidence: {
    browserTest: "ui-spikes/integration/tests/ui.spec.ts",
  },
  tags: ["diff", "replace-line", "change-audit", "regression"],
};

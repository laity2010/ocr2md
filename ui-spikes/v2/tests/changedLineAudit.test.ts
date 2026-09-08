import assert from "node:assert/strict";
import type { Candidate } from "../../../src/types";
import { deriveChangedLineAuditRows } from "../src/changedLineAudit";

function row(
  overrides: Partial<Candidate> & Pick<Candidate, "typeLabel" | "lineType" | "range">,
): Candidate {
  return {
    id: overrides.id ?? "row",
    kind: "regex",
    label: overrides.label ?? "row",
    raw: overrides.raw ?? "",
    preview: overrides.preview ?? overrides.raw ?? "",
    status: "候选",
    ...overrides,
  };
}

const modified = deriveChangedLineAuditRows({
  originalText: "alpha\nSubmited value\nomega\n",
  workingText: "alpha\nSubmitted value\nomega\n",
  calibrationRows: [],
});
assert.deepStrictEqual(
  modified.map((item) => ({
    line: item.line,
    state: item.state,
    owner: item.owner,
    workingText: item.workingText,
    baselineText: item.baselineText,
    canLocateWorking: item.canLocateWorking,
  })),
  [{
    line: 1,
    state: "修改",
    owner: "未归类",
    workingText: "Submitted value",
    baselineText: "Submited value",
    canLocateWorking: true,
  }],
  "ordinary prose edits must always appear in the audit table",
);

const added = deriveChangedLineAuditRows({
  originalText: "alpha\nomega\n",
  workingText: "alpha\ninserted\nomega\n",
  calibrationRows: [],
});
assert.equal(added.length, 1);
assert.equal(added[0].state, "新增");
assert.equal(added[0].line, 1);
assert.equal(added[0].workingText, "inserted");
assert.equal(added[0].baselineText, undefined);
assert.equal(added[0].canLocateWorking, true);

const unrelatedAddedAnnotation = deriveChangedLineAuditRows({
  originalText: "alpha\n",
  workingText: "plain inserted prose\nalpha\n",
  calibrationRows: [
    row({
      id: "stale-annotation",
      raw: "<sup>1</sup>",
      preview: "<sup>1</sup>",
      typeLabel: "注释",
      lineType: "注释引用",
      range: { line: 0, start: 0, end: 0 },
    }),
  ],
});
assert.equal(
  unrelatedAddedAnnotation[0].owner,
  "未归类",
  "a stale same-line annotation candidate must not claim unrelated added prose",
);

const realAddedAnnotation = deriveChangedLineAuditRows({
  originalText: "alpha\n",
  workingText: "new text <sup>1</sup>\nalpha\n",
  calibrationRows: [
    row({
      id: "real-annotation",
      raw: "<sup>1</sup>",
      preview: "<sup>1</sup>",
      typeLabel: "注释",
      lineType: "注释引用",
      range: { line: 0, start: 9, end: 21 },
    }),
  ],
});
assert.equal(
  realAddedAnnotation[0].owner,
  "注释",
  "an added line containing the actual annotation candidate must retain annotation ownership",
);

const unrelatedAddedHeading = deriveChangedLineAuditRows({
  originalText: "alpha\n",
  workingText: "plain inserted prose\nalpha\n",
  calibrationRows: [
    row({
      id: "stale-heading",
      raw: "# Old heading",
      preview: "# Old heading",
      typeLabel: "章节标题",
      lineType: "1 级标题",
      range: { line: 0, start: 0, end: 13 },
    }),
  ],
});
assert.equal(
  unrelatedAddedHeading[0].owner,
  "未归类",
  "a stale same-line heading candidate must not claim unrelated added prose",
);

const deleted = deriveChangedLineAuditRows({
  originalText: "alpha\nobsolete\nomega\n",
  workingText: "alpha\nomega\n",
  calibrationRows: [],
});
assert.equal(deleted.length, 1);
assert.equal(deleted[0].state, "删除");
assert.equal(deleted[0].line, 1);
assert.equal(deleted[0].baselineText, "obsolete");
assert.equal(deleted[0].canLocateWorking, false);

const headingOwner = deriveChangedLineAuditRows({
  originalText: "# Ttle\nbody\n",
  workingText: "# Title\nbody\n",
  calibrationRows: [
    row({
      id: "heading",
      raw: "# Title",
      preview: "# Title",
      typeLabel: "章节标题",
      lineType: "1 级标题",
      range: { line: 0, start: 0, end: 7 },
    }),
  ],
});
assert.equal(headingOwner[0].owner, "章节标题");

const annotationOwner = deriveChangedLineAuditRows({
  originalText: "Text [^1] tail\n",
  workingText: "Text [^2] tail\n",
  calibrationRows: [
    row({
      id: "annotation",
      raw: "[^2]",
      preview: "[^2]",
      typeLabel: "注释",
      lineType: "注释引用",
      range: { line: 0, start: 5, end: 9 },
    }),
  ],
});
assert.equal(annotationOwner[0].owner, "注释");

const embedOwner = deriveChangedLineAuditRows({
  originalText: "![[old.png]]\n",
  workingText: "![[new.png]]\n",
  calibrationRows: [
    row({
      id: "embed",
      raw: "![[new.png]]",
      preview: "![[new.png]]",
      typeLabel: "嵌入块",
      lineType: "嵌入链接",
      range: { line: 0, start: 0, end: 12 },
    }),
  ],
});
assert.equal(embedOwner[0].owner, "嵌入块");

const unrelatedAnnotation = deriveChangedLineAuditRows({
  originalText: "wrong [^1] tail\n",
  workingText: "right [^1] tail\n",
  calibrationRows: [
    row({
      id: "annotation",
      raw: "[^1]",
      preview: "[^1]",
      typeLabel: "注释",
      lineType: "注释引用",
      range: { line: 0, start: 6, end: 10 },
    }),
  ],
});
assert.equal(
  unrelatedAnnotation[0].owner,
  "未归类",
  "a same-line module candidate must not swallow an unrelated character edit",
);

const automaticIllegalBreak = row({
  id: "auto-break",
  raw: "wrong\nright",
  preview: "wrong right",
  typeLabel: "非法断行",
  lineType: "合并",
  range: { line: 0, start: 0, endLine: 1, end: 5 },
});
const manualIllegalBreak = {
  ...automaticIllegalBreak,
  id: "manual-break",
  isWorkingCorrection: true,
};
const autoOwner = deriveChangedLineAuditRows({
  originalText: "wrong text\n",
  workingText: "right text\n",
  calibrationRows: [automaticIllegalBreak],
});
assert.equal(
  autoOwner[0].owner,
  "未归类",
  "automatic illegal-break suggestions must not claim unrelated real diffs",
);
const manualOwner = deriveChangedLineAuditRows({
  originalText: "wrong text\n",
  workingText: "right text\n",
  calibrationRows: [manualIllegalBreak],
});
assert.equal(manualOwner[0].owner, "非法断行");

const deletedHeadingOwner = deriveChangedLineAuditRows({
  originalText: "# Removed heading\nbody\n",
  workingText: "body\n",
  calibrationRows: [
    row({
      id: "deleted-heading",
      raw: "# Removed heading",
      preview: "# Removed heading",
      baselinePreview: "# Removed heading",
      chapterBoundaryState: "deleted",
      typeLabel: "章节标题",
      lineType: "1 级标题",
      range: { line: 0, start: 0, end: 17 },
    }),
  ],
});
assert.equal(deletedHeadingOwner[0].state, "删除");
assert.equal(deletedHeadingOwner[0].owner, "章节标题");
assert.equal(deletedHeadingOwner[0].canLocateWorking, false);

const ownerPriority = deriveChangedLineAuditRows({
  originalText: "# Ttle [^1]\n",
  workingText: "# Title [^1]\n",
  calibrationRows: [
    row({
      id: "annotation-overlap",
      raw: "# Title [^1]",
      preview: "# Title [^1]",
      typeLabel: "注释",
      lineType: "注释引用",
      range: { line: 0, start: 0, end: 12 },
    }),
    row({
      id: "heading-overlap",
      raw: "# Title [^1]",
      preview: "# Title [^1]",
      typeLabel: "章节标题",
      lineType: "1 级标题",
      range: { line: 0, start: 0, end: 12 },
    }),
  ],
});
assert.equal(
  ownerPriority[0].owner,
  "章节标题",
  "owner priority must remain 标题 → 注释 → 嵌入块 → 非法断行",
);

const ignoredHeading = deriveChangedLineAuditRows({
  originalText: "# Ttle\n",
  workingText: "# Title\n",
  calibrationRows: [
    row({
      id: "ignored-heading",
      raw: "# Title",
      preview: "# Title",
      typeLabel: "章节标题",
      lineType: "已忽略",
      range: { line: 0, start: 0, end: 7 },
    }),
  ],
});
assert.equal(ignoredHeading[0].owner, "未归类");

const restored = deriveChangedLineAuditRows({
  originalText: "same\n",
  workingText: "same\n",
  calibrationRows: [],
});
assert.deepStrictEqual(
  restored,
  [],
  "restoring working text to original must clear the derived audit table",
);

console.log("changedLineAudit tests passed");

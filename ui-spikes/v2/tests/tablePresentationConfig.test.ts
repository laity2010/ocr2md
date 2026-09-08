import assert from "node:assert/strict";
import {
  TABLE_PRESENTATION_DEFAULT_SOURCE,
  parseTablePresentationConfig,
  resolveDefaultTablePresentation,
} from "../src/tablePresentationConfig";

{
  const parsed = parseTablePresentationConfig(TABLE_PRESENTATION_DEFAULT_SOURCE);
  assert.equal(parsed.ok, true);
  assert.equal(parsed.sourceEditor?.showHardReturns, true);
  const annotation = parsed.resolved?.["注释"];
  assert.deepEqual(
    annotation?.columns.map((column) => column.label),
    ["行号", "行类型", "注释号", "预览", "配对状态"],
  );
  assert.deepEqual(
    annotation?.sort.map((entry) => entry.colId),
    ["annotationNumber", "sourceLine"],
  );
  const embed = parsed.resolved?.["嵌入块"];
  assert.deepEqual(
    embed?.columns.map((column) => column.label),
    ["行号", "行类型", "组号", "预览"],
  );
  assert.deepEqual(
    embed?.sort.map((entry) => entry.colId),
    ["embedNumber", "sourceLine"],
  );
  assert.equal(
    embed?.columns.find((column) => column.colId === "sourceLine")?.pinned,
    null,
  );
}

{
  const parsed = parseTablePresentationConfig(JSON.stringify({
    version: 1,
    modules: {
      注释: {
        columns: ["注释号", "行号", "预览"],
        sort: [
          { column: "注释号", direction: "desc" },
          "行号",
        ],
        columnStyles: {
          预览: { minWidth: 500, flex: 2 },
          配对状态: { hidden: true },
        },
      },
    },
  }));
  assert.equal(parsed.ok, true);
  const annotation = parsed.resolved?.["注释"];
  assert.deepEqual(
    annotation?.columns.map((column) => column.label),
    ["注释号", "行号", "预览", "行类型", "配对状态"],
  );
  assert.deepEqual(annotation?.sort, [
    { colId: "annotationNumber", direction: "desc" },
    { colId: "sourceLine", direction: "asc" },
  ]);
  assert.equal(
    annotation?.columns.find((column) => column.label === "预览")?.minWidth,
    500,
  );
  assert.equal(
    annotation?.columns.find((column) => column.label === "配对状态")?.hidden,
    true,
  );
}


{
  const parsed = parseTablePresentationConfig(JSON.stringify({
    version: 1,
    sourceEditor: {
      showHardReturns: false,
    },
    modules: {},
  }));
  assert.equal(parsed.ok, true);
  assert.equal(parsed.sourceEditor?.showHardReturns, false);
}

{
  const parsed = parseTablePresentationConfig(JSON.stringify({
    version: 1,
    sourceEditor: {
      showHardReturns: "yes",
    },
    modules: {},
  }));
  assert.equal(parsed.ok, false);
  assert.ok(
    parsed.errors.some((error) =>
      error.includes("sourceEditor.showHardReturns 必须是 boolean")),
  );
}

{
  const parsed = parseTablePresentationConfig("{ bad json");
  assert.equal(parsed.ok, false);
  assert.match(parsed.errors[0] ?? "", /JSON 解析失败/);
}

{
  const parsed = parseTablePresentationConfig(JSON.stringify({
    version: 1,
    modules: {
      注释: {
        columns: ["行号", "不存在"],
        sort: ["注释号", "不存在"],
        columnStyles: {
          预览: { width: -1, pinned: "middle" },
        },
      },
    },
  }));
  assert.equal(parsed.ok, false);
  assert.ok(parsed.errors.some((error) => error.includes("未知列")));
  assert.ok(parsed.errors.some((error) => error.includes("必须是正数")));
  assert.ok(parsed.errors.some((error) => error.includes("left/right/null")));
}

{
  const defaults = resolveDefaultTablePresentation();
  assert.equal(defaults["章节标题"].sort[0]?.colId, "sourceLine");
  assert.equal(defaults["变动行"].sort[0]?.colId, "sourceLine");
}

console.log("table presentation config contract: PASS");

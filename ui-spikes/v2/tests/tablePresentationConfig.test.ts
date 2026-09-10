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
  assert.equal(parsed.sourceEditor?.hardReturnColor, "#9aa79d");
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
    "left",
  );
}

{
  const source = JSON.parse(TABLE_PRESENTATION_DEFAULT_SOURCE) as {
    版本: number;
    配置: Array<Record<string, unknown>>;
  };
  assert.equal(source.版本, 2);
  assert.ok(source.配置.length >= 23);
  assert.deepEqual(
    Object.keys(source.配置[0] ?? {}),
    ["控件", "功能组", "键值", "中文描述"],
  );
  assert.ok(source.配置.every((entry) => entry["功能组"] === "通用"));
  assert.deepEqual(
    source.配置.find((entry) => {
      const keyValue = entry["键值"];
      return typeof keyValue === "object"
        && keyValue !== null
        && "showHardReturns" in keyValue;
    }),
    {
      控件: "源码窗口",
      功能组: "通用",
      键值: { showHardReturns: true },
      中文描述: "显示硬回车",
    },
  );
  assert.deepEqual(
    source.配置.find((entry) => {
      const keyValue = entry["键值"];
      return typeof keyValue === "object"
        && keyValue !== null
        && "hardReturnColor" in keyValue;
    }),
    {
      控件: "源码窗口",
      功能组: "通用",
      键值: { hardReturnColor: "#9aa79d" },
      中文描述: "硬回车颜色",
    },
  );
}

{
  const parsed = parseTablePresentationConfig(JSON.stringify({
    版本: 2,
    配置: [
      {
        控件: "源码窗口",
        键值: { showHardReturns: false },
        中文描述: "显示硬回车",
      },
    ],
  }));
  assert.equal(parsed.ok, true);
  assert.equal(parsed.sourceEditor?.showHardReturns, false);
  assert.equal(parsed.config?.配置[0]?.功能组, "通用");
}

{
  const parsed = parseTablePresentationConfig(JSON.stringify({
    版本: 2,
    配置: [
      {
        控件: "源码窗口",
        功能组: "通用",
        键值: {
          showHardReturns: true,
          extra: false,
        },
        中文描述: "显示硬回车",
      },
    ],
  }));
  assert.equal(parsed.ok, false);
  assert.ok(
    parsed.errors.some((error) =>
      error.includes("键值 必须且只能包含一个键")),
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
  assert.equal(parsed.migratedFromLegacy, true);
  assert.equal(parsed.config?.版本, 2);
  assert.deepEqual(
    Object.keys(parsed.config?.配置[0] ?? {}),
    ["控件", "功能组", "键值", "中文描述"],
  );
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
  assert.equal(parsed.sourceEditor?.hardReturnColor, "#9aa79d");
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
  const parsed = parseTablePresentationConfig(JSON.stringify({
    version: 1,
    sourceEditor: {
      hardReturnColor: "",
    },
    modules: {},
  }));
  assert.equal(parsed.ok, false);
  assert.ok(
    parsed.errors.some((error) =>
      error.includes("sourceEditor.hardReturnColor 必须是非空字符串")),
  );
}

{
  const parsed = parseTablePresentationConfig("{ bad json");
  assert.equal(parsed.ok, false);
  assert.match(parsed.errors[0] ?? "", /JSON 解析失败/);
}

{
  const parsed = parseTablePresentationConfig(JSON.stringify({
    版本: 2,
    配置: [
      {
        控件: "源码窗口",
        功能组: "通用",
        键值: {
          showHardReturns: true,
          extra: false,
        },
        中文描述: "显示硬回车",
      },
    ],
  }));
  assert.equal(parsed.ok, false);
  assert.ok(
    parsed.errors.some((error) =>
      error.includes("键值 必须且只能包含一个键")),
  );
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

import * as assert from "assert";
import {
  renderObsidianTranslationBundle,
  type ObsidianTranslationExportInput,
} from "./translationExport";

const input: ObsidianTranslationExportInput = {
  sourceLinkTarget: "books/sample/output/org/01 Chapter",
  translationLinkTarget: "books/sample/output/trans/01 Chapter",
  units: [
    { kind: "yaml", source: "---\nocr2md_corrected: true\n---" },
    {
      kind: "sentence",
      source: "# Chapter",
      translation: "# 章节",
      anchorId: "sid-1-1",
      breakAfter: true,
      groupId: "block-1",
    },
    {
      kind: "sentence",
      source: "An ordinary sentence.",
      translation: "一个普通句子。",
      anchorId: "sid-2-1",
      groupId: "block-2",
    },
    {
      kind: "structure",
      source: ">",
      anchorId: "bid-3-1",
      breakAfter: true,
      groupId: "block-3",
      structureRole: "marker",
    },
    {
      kind: "structure",
      source: "![image](imgs/a.jpg)",
      anchorId: "bid-3-2",
      breakAfter: true,
      groupId: "block-3",
      structureRole: "image",
    },
    {
      kind: "sentence",
      source: "Top Award",
      translation: "最高奖项",
      anchorId: "sid-3-1",
      groupId: "block-3",
    },
    {
      kind: "structure",
      source: "$$",
      anchorId: "bid-4-1",
      breakAfter: true,
      groupId: "block-4",
      structureRole: "latex-marker",
    },
    {
      kind: "structure",
      source: "x = 1",
      anchorId: "bid-4-2",
      breakAfter: true,
      groupId: "block-4",
      structureRole: "latex-code",
    },
    {
      kind: "structure",
      source: "$$",
      anchorId: "bid-4-3",
      breakAfter: true,
      groupId: "block-4",
      structureRole: "latex-marker",
    },
    {
      kind: "footnote",
      source: "[^1]: English note.",
      translation: "[^1]: 中文注释。",
      anchorId: "bid-5",
      breakAfter: true,
      groupId: "block-5",
    },
  ],
};

const expectedOrg2Trans = `---
ocr2md_corrected: true
---

# Chapter
^sid-1-1
>[! ds]-
>![[books/sample/output/trans/01 Chapter#^sid-1-1]]

<br>

An ordinary sentence.
^sid-2-1
>[! ds]-
>![[books/sample/output/trans/01 Chapter#^sid-2-1]]

<br>

>
![image](imgs/a.jpg)
Top Award
>>[! ds]-
最高奖项
>

$$
x = 1
$$

[^1]: English note.
<br>中文注释。
^bid-5

<br>
`;

const bundle = renderObsidianTranslationBundle(input);
assert.strictEqual(bundle.org2trans, expectedOrg2Trans);
assert.ok(!bundle.org2trans.includes("\n\n>[! ds]-"), "anchor and cross-language callout must be adjacent");
assert.ok(bundle.trans2org.includes(">![[books/sample/output/org/01 Chapter#^sid-2-1]]"));
assert.ok(bundle.org.includes("x = 1\n^bid-4-2\n\n<br>"));
assert.ok(!bundle.org2trans.includes("^bid-4-2"), "cross output must not anchor multiline LaTeX");
assert.ok(bundle.trans.includes("[^1]: 中文注释。\n^bid-5"));

const nested = renderObsidianTranslationBundle({
  sourceLinkTarget: "org",
  translationLinkTarget: "trans",
  units: [
    {
      kind: "structure",
      source: ">",
      anchorId: "bid-10-1",
      breakAfter: true,
      groupId: "block-10",
      structureRole: "marker",
    },
    {
      kind: "structure",
      source: ">>[! ]- Table 1",
      anchorId: "bid-10-2",
      breakAfter: true,
      groupId: "block-10",
      structureRole: "callout",
    },
    {
      kind: "structure",
      source: ">><table><tr><td>A</td></tr></table>",
      anchorId: "bid-10-3",
      breakAfter: true,
      groupId: "block-10",
      structureRole: "html",
    },
    {
      kind: "structure",
      source: ">>",
      anchorId: "bid-10-4",
      breakAfter: true,
      groupId: "block-10",
      structureRole: "marker",
    },
    {
      kind: "structure",
      source: "><sup>a</sup>Table note.",
      anchorId: "bid-10-5",
      breakAfter: true,
      groupId: "block-10",
      structureRole: "html",
    },
  ],
});

assert.ok(nested.org2trans.includes(">>[! ]- Table 1"));
assert.ok(nested.org2trans.includes(">><table><tr><td>A</td></tr></table>"));
assert.ok(nested.org2trans.includes("\n<sup>a</sup>Table note."));
assert.ok(!nested.org2trans.includes("[! ds]"), "structure-only composites must not invent translations");
assert.ok(!nested.org2trans.includes("^bid-10-5"));
assert.ok(!nested.org2trans.includes("bid-10-3"), "HTML tables remain structural and do not receive a cross callout");

const figure = renderObsidianTranslationBundle({
  sourceLinkTarget: "org",
  translationLinkTarget: "books/sample/trans/01 Chapter",
  units: [
    {
      kind: "structure",
      source: ">",
      anchorId: "bid-27-1",
      breakAfter: true,
      groupId: "block-27",
      structureRole: "marker",
    },
    {
      kind: "sentence",
      source: "Figure 1. How Berkshire Stacks Up",
      translation: "图1 伯克希尔的表现",
      anchorId: "sid-27-1",
      groupId: "block-27",
    },
    {
      kind: "structure",
      source: ">",
      anchorId: "bid-27-2",
      breakAfter: true,
      groupId: "block-27",
      structureRole: "marker",
    },
    {
      kind: "structure",
      source: "![image](imgs/figure-1.jpg)",
      anchorId: "bid-27-3",
      breakAfter: true,
      groupId: "block-27",
      structureRole: "image",
    },
    {
      kind: "sentence",
      source: "Notes: This figure shows the distribution.",
      translation: "注：本图显示该分布。",
      anchorId: "sid-27-2",
      groupId: "block-27",
    },
    {
      kind: "sentence",
      source: "See also definitions in the notes to Table 1.",
      translation: "另见表1注释中的定义。",
      anchorId: "sid-27-3",
      groupId: "block-27",
    },
  ],
});

const expectedFigure = `>
Figure 1. How Berkshire Stacks Up
>>[! ds]-
图1 伯克希尔的表现
>
![image](imgs/figure-1.jpg)
Notes: This figure shows the distribution.
>>[! ds]-
注：本图显示该分布。
>
See also definitions in the notes to Table 1.
>>[! ds]-
另见表1注释中的定义。
>
`;
assert.strictEqual(figure.org2trans, expectedFigure);
assert.ok(!figure.org2trans.includes("^sid-"), "composite sentences must not emit cross-file anchors");
assert.ok(!figure.org2trans.includes("![["), "composite sentences must use inline translations");

const explicitTable = renderObsidianTranslationBundle({
  sourceLinkTarget: "org",
  translationLinkTarget: "books/sample/trans/01 Chapter",
  units: [
    {
      kind: "structure",
      source: ">",
      anchorId: "bid-20-1",
      groupId: "block-20",
      structureRole: "marker",
    },
    {
      kind: "structure",
      source: ">>[! ]- Table 2. Performance",
      anchorId: "bid-20-2",
      groupId: "block-20",
      structureRole: "callout",
    },
    {
      kind: "structure",
      source: ">><table><tr><td>A</td></tr></table>",
      anchorId: "bid-20-3",
      groupId: "block-20",
      structureRole: "html",
    },
    {
      kind: "structure",
      source: ">>",
      anchorId: "bid-20-4",
      groupId: "block-20",
      structureRole: "marker",
    },
    {
      kind: "sentence",
      source: ">Notes: Returns are annualized.",
      translation: ">注：收益率已经年化。",
      anchorId: "sid-20-1",
      groupId: "block-20",
    },
    {
      kind: "structure",
      source: ">>",
      anchorId: "bid-20-5",
      groupId: "block-20",
      structureRole: "marker",
    },
    {
      kind: "sentence",
      source: "Alphas are annualized.",
      translation: "阿尔法已经年化。",
      anchorId: "sid-20-2",
      groupId: "block-20",
    },
  ],
});
assert.strictEqual(
  explicitTable.org2trans,
  `>
>>[! ]- Table 2. Performance
>><table><tr><td>A</td></tr></table>
>>
Notes: Returns are annualized.
>>>[! ds]-
注：收益率已经年化。
>>
Alphas are annualized.
>>>[! ds]-
阿尔法已经年化。
>>
`,
);

const explicitTableWithLeadingSentences = renderObsidianTranslationBundle({
  sourceLinkTarget: "org",
  translationLinkTarget: "books/sample/trans/01 Chapter",
  units: [
    {
      kind: "sentence",
      source: "To minimize randomness, Table 1 compares longer histories.",
      translation: "为减少随机性，表1比较了更长的历史。",
      anchorId: "sid-25-1",
      groupId: "block-25",
    },
    {
      kind: "sentence",
      source: "Figure 1 and Figure 2 also illustrate the distribution.",
      translation: "图1和图2也展示了该分布。",
      anchorId: "sid-25-2",
      groupId: "block-25",
    },
    {
      kind: "structure",
      source: ">",
      anchorId: "bid-25-1",
      groupId: "block-25",
      structureRole: "marker",
    },
    {
      kind: "structure",
      source: "![image](imgs/table-a.jpg)",
      anchorId: "bid-25-2",
      groupId: "block-25",
      structureRole: "image",
    },
    {
      kind: "structure",
      source: "![image](imgs/table-b.jpg)",
      anchorId: "bid-25-3",
      groupId: "block-25",
      structureRole: "image",
    },
    {
      kind: "structure",
      source: ">>[! ]- Table 1. Performance",
      anchorId: "bid-25-4",
      groupId: "block-25",
      structureRole: "callout",
    },
    {
      kind: "structure",
      source: ">><table><tr><td>A</td></tr></table>",
      anchorId: "bid-25-5",
      groupId: "block-25",
      structureRole: "html",
    },
    {
      kind: "structure",
      source: ">>",
      anchorId: "bid-25-6",
      groupId: "block-25",
      structureRole: "marker",
    },
    {
      kind: "sentence",
      source: "Notes: Returns are annualized.",
      translation: "注：收益率已经年化。",
      anchorId: "sid-25-3",
      groupId: "block-25",
    },
  ],
});
assert.ok(
  explicitTableWithLeadingSentences.org2trans.includes(
    "Figure 1 and Figure 2 also illustrate the distribution.\n"
      + "^sid-25-2\n>[! ds]-\n"
      + ">![[books/sample/trans/01 Chapter#^sid-25-2]]\n\n<br>\n\n>\n"
      + "![image](imgs/table-a.jpg)",
  ),
  "a leading explanatory sentence must remain outside the table composite and before its break",
);
assert.ok(
  !explicitTableWithLeadingSentences.org2trans.includes(
    ">>[! ]- Table 1. Performance\n>>>[! ds]-",
  ),
  "a multi-image table title must not emit a duplicate counterpart callout",
);

const inferredFigure = renderObsidianTranslationBundle({
  sourceLinkTarget: "org",
  translationLinkTarget: "books/sample/trans/01 Chapter",
  units: [
    {
      kind: "sentence",
      source: "Figure 1. How Berkshire Stacks Up",
      translation: "图1 伯克希尔的表现",
      anchorId: "sid-31-1",
      groupId: "block-31",
    },
    {
      kind: "sentence",
      source: "![image](imgs/figure-1.jpg)",
      translation: "[图片](imgs/figure-1.jpg)",
      anchorId: "sid-32-1",
      groupId: "block-32",
    },
    {
      kind: "sentence",
      source: "Notes: This figure shows the distribution.",
      translation: "注：本图显示该分布。",
      anchorId: "sid-33-1",
      groupId: "block-33",
    },
    {
      kind: "sentence",
      source: "See also definitions in the notes to Table 1.",
      translation: "另见表1注释中的定义。",
      anchorId: "sid-33-2",
      groupId: "block-33",
    },
  ],
});
const expectedInferredFigure = `>
Figure 1. How Berkshire Stacks Up
>>[! ds]-
图1 伯克希尔的表现
>
![image](imgs/figure-1.jpg)
Notes: This figure shows the distribution.
>>[! ds]-
注：本图显示该分布。
>
See also definitions in the notes to Table 1.
>>[! ds]-
另见表1注释中的定义。
>
`;
assert.strictEqual(inferredFigure.org2trans, expectedInferredFigure);
assert.ok(
  inferredFigure.org.includes("![image](imgs/figure-1.jpg)"),
  "standalone output must preserve the Markdown image source",
);
assert.ok(
  !inferredFigure.org.startsWith(">"),
  "the inferred parent quote marker is cross-output only",
);

const inferredImageCaption = renderObsidianTranslationBundle({
  sourceLinkTarget: "org",
  translationLinkTarget: "books/sample/trans/01 Chapter",
  units: [
    {
      kind: "structure",
      source: "![image](imgs/award.jpg)",
      anchorId: "bid-35",
      groupId: "block-35",
      structureRole: "image",
    },
    {
      kind: "sentence",
      source: "Top Award",
      translation: "最高奖项",
      anchorId: "sid-36-1",
      groupId: "block-36",
    },
    {
      kind: "sentence",
      source: "The next ordinary paragraph.",
      translation: "下一个普通段落。",
      anchorId: "sid-37-1",
      groupId: "block-37",
    },
  ],
});
assert.strictEqual(
  inferredImageCaption.org2trans,
  `>
![image](imgs/award.jpg)
Top Award
>>[! ds]-
最高奖项
>

The next ordinary paragraph.
^sid-37-1
>[! ds]-
>![[books/sample/trans/01 Chapter#^sid-37-1]]
`,
);

const inferredTable = renderObsidianTranslationBundle({
  sourceLinkTarget: "org",
  translationLinkTarget: "books/sample/cross/trans/trans2org 01 Chapter",
  units: [
    {
      kind: "sentence",
      source: "Table 1. Buffett Performance",
      translation: "表1 巴菲特的表现",
      anchorId: "sid-41-1",
      groupId: "block-41",
    },
    {
      kind: "structure",
      source: "<table><tr><td>A</td></tr></table>",
      anchorId: "bid-42",
      groupId: "block-42",
      structureRole: "html",
    },
    {
      kind: "structure",
      source: "<table><tr><td>B</td></tr></table>",
      anchorId: "bid-43",
      groupId: "block-43",
      structureRole: "html",
    },
    {
      kind: "sentence",
      source: "Notes: Ratios are annualized.",
      translation: "注：比率已经年化。",
      anchorId: "sid-44-1",
      groupId: "block-44",
    },
  ],
});
assert.strictEqual(
  inferredTable.org2trans,
  `>
>>[! ]- Table 1. Buffett Performance
>>>[! ds]-
表1 巴菲特的表现
>><table><tr><td>A</td></tr></table>
>><table><tr><td>B</td></tr></table>
>>
Notes: Ratios are annualized.
>>>[! ds]-
注：比率已经年化。
>>
`,
);
assert.ok(
  inferredTable.trans2org.includes(">>[! ]- 表1 巴菲特的表现\n>>>[! ds]-\nTable 1. Buffett Performance"),
  "translated table captions must preserve the same nested callout structure",
);

const inferredNestedFigure = renderObsidianTranslationBundle({
  sourceLinkTarget: "org",
  translationLinkTarget: "books/sample/trans/01 Chapter",
  units: [
    {
      kind: "sentence",
      source: "Figure 3. Performance of the Equity Market",
      translation: "图3 股票市场表现",
      anchorId: "sid-106-1",
      groupId: "block-106",
    },
    {
      kind: "sentence",
      source: "A. Berkshire Hathaway Public Stocks",
      translation: "A. 伯克希尔公开持股",
      anchorId: "sid-107-1",
      groupId: "block-107",
    },
    {
      kind: "structure",
      source: "![image](imgs/panel-a.jpg)",
      anchorId: "bid-108",
      groupId: "block-108",
      structureRole: "image",
    },
    {
      kind: "sentence",
      source: "(continued)",
      translation: "（续）",
      anchorId: "sid-109-1",
      groupId: "block-109",
    },
    {
      kind: "sentence",
      source: "Figure 3. Performance of the Equity Market (continued)",
      translation: "图3 股票市场表现（续）",
      anchorId: "sid-110-1",
      groupId: "block-110",
    },
    {
      kind: "sentence",
      source: "B. Berkshire Hathaway Stock",
      translation: "B. 伯克希尔股票",
      anchorId: "sid-111-1",
      groupId: "block-111",
    },
    {
      kind: "structure",
      source: "![image](imgs/panel-b.jpg)",
      anchorId: "bid-112",
      groupId: "block-112",
      structureRole: "image",
    },
    {
      kind: "sentence",
      source: "Notes: Panel A shows cumulative return.",
      translation: "注：A面板显示累计回报。",
      anchorId: "sid-113-1",
      groupId: "block-113",
    },
    {
      kind: "sentence",
      source: "Panel B shows cumulative return.",
      translation: "B面板显示累计回报。",
      anchorId: "sid-113-2",
      groupId: "block-113",
    },
    {
      kind: "sentence",
      source: "The explanatory variables are the monthly returns.",
      translation: "解释变量为月度收益率。",
      anchorId: "sid-113-3",
      groupId: "block-113",
    },
  ],
});
assert.strictEqual(
  inferredNestedFigure.org2trans,
  `>
Figure 3. Performance of the Equity Market
>>[! ds]-
图3 股票市场表现
>
>>A. Berkshire Hathaway Public Stocks
>>>[! ds]-
A. 伯克希尔公开持股
>>
![image](imgs/panel-a.jpg)
Notes: Panel A shows cumulative return.
>>>[! ds]-
注：A面板显示累计回报。
>
>>B. Berkshire Hathaway Stock
>>>[! ds]-
B. 伯克希尔股票
>>
![image](imgs/panel-b.jpg)
Panel B shows cumulative return.
>>>[! ds]-
B面板显示累计回报。
>>
The explanatory variables are the monthly returns.
>>>[! ds]-
解释变量为月度收益率。
>>
`,
);
assert.ok(
  inferredNestedFigure.org.includes("(continued)")
    && inferredNestedFigure.org.includes("Figure 3. Performance of the Equity Market (continued)"),
  "standalone output must preserve continuation labels that are omitted only from the cross layout",
);
assert.ok(
  inferredNestedFigure.trans2org.includes(
    ">\n图3 股票市场表现\n>>[! ds]-\nFigure 3. Performance of the Equity Market",
  ),
  "translated multi-panel figure captions must retain the outer composite level",
);
assert.ok(
  inferredNestedFigure.trans2org.includes(
    ">>A. 伯克希尔公开持股\n>>>[! ds]-\nA. Berkshire Hathaway Public Stocks",
  ),
  "translated panel headings must retain the nested panel level",
);

const nestedFigure = renderObsidianTranslationBundle({
  sourceLinkTarget: "org",
  translationLinkTarget: "books/sample/trans/01 Chapter",
  units: [
    {
      kind: "structure",
      source: ">",
      anchorId: "bid-95-1",
      groupId: "block-95",
      structureRole: "marker",
    },
    {
      kind: "sentence",
      source: "Figure 3. Performance of the Equity Market",
      translation: "图3 股票市场表现",
      anchorId: "sid-95-1",
      groupId: "block-95",
    },
    {
      kind: "structure",
      source: ">",
      anchorId: "bid-95-2",
      groupId: "block-95",
      structureRole: "marker",
    },
    {
      kind: "sentence",
      source: ">>A. Berkshire Hathaway Public Stocks",
      translation: ">>A. 伯克希尔公开持股",
      anchorId: "sid-95-2",
      groupId: "block-95",
    },
    {
      kind: "structure",
      source: "![image](imgs/panel-a.jpg)",
      anchorId: "bid-95-3",
      groupId: "block-95",
      structureRole: "image",
    },
    {
      kind: "sentence",
      source: "Notes: Panel A shows cumulative return.",
      translation: "注：A面板显示累计回报。",
      anchorId: "sid-95-3",
      groupId: "block-95",
    },
    {
      kind: "structure",
      source: ">",
      anchorId: "bid-95-4",
      groupId: "block-95",
      structureRole: "marker",
    },
    {
      kind: "sentence",
      source: ">>B. Berkshire Hathaway Stock",
      translation: ">>B. 伯克希尔股票",
      anchorId: "sid-95-4",
      groupId: "block-95",
    },
    {
      kind: "structure",
      source: "![image](imgs/panel-b.jpg)",
      anchorId: "bid-95-5",
      groupId: "block-95",
      structureRole: "image",
    },
    {
      kind: "sentence",
      source: "Notes: Panel B shows cumulative return.",
      translation: "注：B面板显示累计回报。",
      anchorId: "sid-95-5",
      groupId: "block-95",
    },
    {
      kind: "sentence",
      source: "The explanatory variables are the monthly returns.",
      translation: "解释变量为月度收益率。",
      anchorId: "sid-95-6",
      groupId: "block-95",
    },
  ],
});

const expectedNestedFigure = `>
Figure 3. Performance of the Equity Market
>>[! ds]-
图3 股票市场表现
>
>>A. Berkshire Hathaway Public Stocks
>>>[! ds]-
A. 伯克希尔公开持股
>>
![image](imgs/panel-a.jpg)
Notes: Panel A shows cumulative return.
>>>[! ds]-
注：A面板显示累计回报。
>
>>B. Berkshire Hathaway Stock
>>>[! ds]-
B. 伯克希尔股票
>>
![image](imgs/panel-b.jpg)
Notes: Panel B shows cumulative return.
>>>[! ds]-
注：B面板显示累计回报。
>>
The explanatory variables are the monthly returns.
>>>[! ds]-
解释变量为月度收益率。
>>
`;
assert.strictEqual(nestedFigure.org2trans, expectedNestedFigure);
assert.ok(
  !nestedFigure.org2trans.includes(
    "Figure 3. Performance of the Equity Market\n^sid-95-1",
  ),
  "an explicit multi-panel figure caption must follow the sample and suppress its outer anchor line",
);

console.log("translationExport tests passed");

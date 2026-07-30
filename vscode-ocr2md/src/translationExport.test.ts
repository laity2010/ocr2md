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

>
![image](imgs/a.jpg)
Top Award
^sid-3-1
>>[! ds]-
![[books/sample/output/trans/01 Chapter#^sid-3-1]]

$$
x = 1
^bid-4-2
$$

<br>

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

assert.ok(nested.org2trans.includes(">>[! ]- Table 1\n>>>[! ds]-\n![[trans#^bid-10-2]]"));
assert.ok(nested.org2trans.includes("><sup>a</sup>Table note.\n^bid-10-5\n>>>[! ds]-"));
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
^sid-27-1
>>[! ds]-
![[books/sample/trans/01 Chapter#^sid-27-1]]
>
![image](imgs/figure-1.jpg)
Notes: This figure shows the distribution.
^sid-27-2
>>[! ds]-
![[books/sample/trans/01 Chapter#^sid-27-2]]
>
See also definitions in the notes to Table 1.
^sid-27-3
>>[! ds]-
![[books/sample/trans/01 Chapter#^sid-27-3]]
`;
assert.strictEqual(figure.org2trans, expectedFigure);

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
^sid-95-1
>>[! ds]-
![[books/sample/trans/01 Chapter#^sid-95-1]]
>
>>A. Berkshire Hathaway Public Stocks
^sid-95-2
>>>[! ds]-
![[books/sample/trans/01 Chapter#^sid-95-2]]
>>
![image](imgs/panel-a.jpg)
Notes: Panel A shows cumulative return.
^sid-95-3
>>>[! ds]-
![[books/sample/trans/01 Chapter#^sid-95-3]]
>
>>B. Berkshire Hathaway Stock
^sid-95-4
>>>[! ds]-
![[books/sample/trans/01 Chapter#^sid-95-4]]
>>
![image](imgs/panel-b.jpg)
Notes: Panel B shows cumulative return.
^sid-95-5
>>>[! ds]-
![[books/sample/trans/01 Chapter#^sid-95-5]]
>>
The explanatory variables are the monthly returns.
^sid-95-6
>>>[! ds]-
![[books/sample/trans/01 Chapter#^sid-95-6]]
`;
assert.strictEqual(nestedFigure.org2trans, expectedNestedFigure);

console.log("translationExport tests passed");

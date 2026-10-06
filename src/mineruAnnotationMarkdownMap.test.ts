import * as assert from "assert";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import {
  discoverCanonicalChapterMarkdown,
  mapMineruAnnotationsToChapters,
  mapMineruJsonFootnoteFactsToChapters,
  normalizeAnnotationMatchText,
} from "./mineruAnnotationMarkdownMap";
import type {
  MineruAnnotationBody,
  MineruAnnotationReference,
  MineruJsonFootnoteFacts,
  MineruPageAnnotation,
} from "./mineruAnnotationContract";

function makeProject(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ocr2md-mineru-map-"));
  fs.mkdirSync(path.join(root, "chapters"));
  return root;
}

function writeChapter(root: string, id: string, body: string): string {
  const dir = path.join(root, "chapters", id);
  fs.mkdirSync(dir, { recursive: true });
  const filePath = path.join(dir, id + ".md");
  fs.writeFileSync(filePath, body, "utf8");
  return filePath;
}

function reference(
  pageIndex: number,
  marker: string,
  context: string,
  occurrence = 1,
): MineruAnnotationReference {
  return {
    occurrence,
    marker,
    context,
    json: {
      pageIndex,
      collection: "preproc_blocks",
      blockIndex: 2,
      bbox: [10, 10, 500, 200],
    },
  };
}

function body(
  pageIndex: number,
  marker: string,
  content: string,
): MineruAnnotationBody {
  return {
    marker,
    content,
    raw: marker + " " + content,
    blockType: "page_footnote",
    json: {
      pageIndex,
      collection: "discarded_blocks",
      blockIndex: 8,
      bbox: [10, 700, 500, 820],
    },
  };
}

function annotation(
  pageIndex: number,
  annotationNumber: number,
  refs: MineruAnnotationReference[],
  noteBody?: MineruAnnotationBody,
): MineruPageAnnotation {
  return {
    documentKey: "book",
    sourceJsonPath: "json/book.json",
    sourceMarkdownPath: "MinerU_markdown_book.md",
    pageIndex,
    annotationNumber,
    references: refs,
    body: noteBody,
    status: noteBody ? "自动匹配" : "注释正文缺失",
  };
}

const root = makeProject();
try {
  writeChapter(
    root,
    "01 第一章",
    [
      "# 第一章",
      "",
      "这是一条普通句子①，但它不是目标注释上下文。",
      "",
      "主，你是伟大的，你应受一切赞美；你有无上的能力、无限的智慧。①",
      "",
      "另一页重新从①开始编号，但正文上下文完全不同。",
    ].join("\n"),
  );
  writeChapter(
    root,
    "02 第二章",
    [
      "# 第二章",
      "",
      "第二章也有①，但这里谈论的是另一件完全不同的事情。",
      "",
      "尾声。",
    ].join("\n"),
  );

  const chapters = discoverCanonicalChapterMarkdown(root);
  assert.deepStrictEqual(
    chapters.map((item) => path.basename(item)),
    ["01 第一章.md", "02 第二章.md"],
  );

  const note = annotation(
    8,
    1,
    [reference(
      8,
      "①",
      "主，你是伟大的，你应受一切赞美；你有无上的能力、无限的智慧。①",
    )],
    body(8, "①", "见《旧约·诗篇》144首3节。"),
  );

  const result = mapMineruAnnotationsToChapters(root, [note]);
  assert.deepStrictEqual(result.summary, {
    total: 1,
    matched: 1,
    missing: 0,
    ambiguous: 0,
  });
  const mapped = result.annotations[0].references[0].markdown;
  assert.ok(mapped);
  assert.strictEqual(mapped?.chapterId, "01 第一章");
  assert.strictEqual(mapped?.chapterPath, path.join("chapters", "01 第一章", "01 第一章.md"));
  assert.strictEqual(mapped?.lineIndex, 4);
  assert.strictEqual(mapped?.anchorText.includes("无限的智慧。①"), true);
  assert.strictEqual(
    mapped?.anchorText.slice(mapped.start, mapped.end),
    "①",
    "locator must point to the actual Markdown annotation marker",
  );
  assert.ok(mapped?.anchorTextHash);
  assert.ok(mapped?.anchorPreviousHash);
  assert.ok(mapped?.anchorNextHash);
  assert.strictEqual(result.annotations[0].status, "自动匹配");
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}

const repeatedRoot = makeProject();
try {
  const sharedContext = "第一处引用①位于中间，然后继续一段足够长的文字，第二处引用①位于结尾。";
  writeChapter(
    repeatedRoot,
    "03 重复号",
    "# 重复号\n\n" + sharedContext + "\n",
  );

  const shared = annotation(
    151,
    1,
    [
      reference(151, "①", sharedContext, 1),
      reference(151, "①", sharedContext, 2),
    ],
    body(151, "①", "见《哥林多前书》4章7节。"),
  );
  const result = mapMineruAnnotationsToChapters(repeatedRoot, [shared]);
  assert.deepStrictEqual(result.summary, {
    total: 2,
    matched: 2,
    missing: 0,
    ambiguous: 0,
  });
  const [first, second] = result.annotations[0].references.map((item) => item.markdown);
  assert.ok(first && second);
  assert.strictEqual(first?.lineIndex, second?.lineIndex);
  assert.notStrictEqual(first?.start, second?.start);
  assert.ok((first?.start ?? 0) < (second?.start ?? 0));
  assert.strictEqual(result.annotations[0].status, "共享注释");
} finally {
  fs.rmSync(repeatedRoot, { recursive: true, force: true });
}

const missingRoot = makeProject();
try {
  writeChapter(
    missingRoot,
    "04 缺失",
    "# 缺失\n\nMarkdown 中完全没有 JSON 所说的那条引用。\n",
  );
  const missing = annotation(
    20,
    1,
    [reference(
      20,
      "①",
      "JSON 中存在这一段足够长的正文上下文，但是 Markdown 导出时整个注释引用①消失了。",
    )],
    body(20, "①", "译者按：示例注释。"),
  );
  const result = mapMineruAnnotationsToChapters(missingRoot, [missing]);
  assert.strictEqual(result.references[0].status, "missing");
  assert.strictEqual(result.annotations[0].status, "MD引用缺失");
  assert.strictEqual(result.annotations[0].references[0].markdown, undefined);
} finally {
  fs.rmSync(missingRoot, { recursive: true, force: true });
}

const ambiguousRoot = makeProject();
try {
  const same = "这段完全相同的正文会在两个章节里重复出现，因此引用①不能被静默猜测。";
  writeChapter(ambiguousRoot, "05 A", "# A\n\n" + same + "\n");
  writeChapter(ambiguousRoot, "06 B", "# B\n\n" + same + "\n");
  const ambiguous = annotation(
    30,
    1,
    [reference(30, "①", same)],
    body(30, "①", "同一个注释正文。"),
  );
  const result = mapMineruAnnotationsToChapters(ambiguousRoot, [ambiguous]);
  assert.strictEqual(result.references[0].status, "ambiguous");
  assert.strictEqual(result.references[0].candidates.length, 2);
  assert.strictEqual(result.annotations[0].status, "匹配歧义");
  assert.strictEqual(result.annotations[0].references[0].markdown, undefined);
} finally {
  fs.rmSync(ambiguousRoot, { recursive: true, force: true });
}

const pipelineRoot = makeProject();
try {
  const line = "正式 WP2 事实通过上下文找到这里的引用①并生成 Markdown locator。";
  writeChapter(pipelineRoot, "07 流水线", "# 流水线\n\n" + line + "\n");
  const matchedRef = reference(40, "①", line);
  const matchedBody = body(40, "①", "正式正文。");
  const facts: MineruJsonFootnoteFacts = {
    documentKey: "book-json-01",
    sourceJsonPath: "json/book-json-01.json",
    sourceMarkdownPath: "MinerU_markdown_book.md",
    pageCount: 3,
    annotations: [
      {
        documentKey: "book-json-01",
        pageIndex: 40,
        annotationNumber: 1,
        references: [matchedRef],
        bodies: [matchedBody],
        status: "matched",
      },
      {
        documentKey: "book-json-01",
        pageIndex: 41,
        annotationNumber: 2,
        references: [],
        bodies: [body(41, "②", "只有 JSON 正文，没有引用。")],
        status: "missing-reference",
      },
      {
        documentKey: "book-json-01",
        pageIndex: 42,
        annotationNumber: 3,
        references: [reference(42, "③", "另一个足够长但 Markdown 中不存在的引用③。")],
        bodies: [
          body(42, "③", "重复正文 A。"),
          body(42, "③", "重复正文 B。"),
        ],
        status: "duplicate-body",
      },
    ],
    unidentifiedFootnotes: [],
    unverifiedReferences: [],
  };
  const result = mapMineruJsonFootnoteFactsToChapters(pipelineRoot, facts);
  assert.strictEqual(result.facts, facts, "WP2 evidence must be retained byte-for-byte by reference");
  assert.strictEqual(result.annotations[0].status, "自动匹配");
  assert.ok(result.annotations[0].references[0].markdown);
  assert.strictEqual(result.annotations[1].status, "MD引用缺失");
  assert.strictEqual(result.annotations[2].status, "匹配歧义");
  assert.strictEqual(result.facts.annotations[2].bodies.length, 2);
} finally {
  fs.rmSync(pipelineRoot, { recursive: true, force: true });
}

assert.strictEqual(
  normalizeAnnotationMatchText("正文　有 空格①"),
  "正文有空格1",
  "NFKC normalization must make MinerU/Markdown typography comparable",
);
assert.strictEqual(
  normalizeAnnotationMatchText("正文$^{①}$"),
  "正文1",
  "inline-equation wrappers around a footnote marker must not block Markdown matching",
);
assert.strictEqual(
  normalizeAnnotationMatchText("①\n## 十三"),
  "1十三",
  "Markdown heading markers must not block adjacent-block disambiguation",
);

console.log("MinerU annotation Markdown map tests passed");

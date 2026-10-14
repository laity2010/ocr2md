import {strict as assert} from "node:assert";
import {chapterModules,cleaningModule,toolIdsForCleaning} from "./registry";
import {scanChapterElements} from "../../../../src/chapterElementCatalog";
import {scanChapterHeadingCandidates} from "../../../../src/textBlocks";

const ids=chapterModules.map(m=>m.id);
assert.deepEqual(ids,["章节定界","章节标题","媒体","表格","LaTeX"]);
assert.equal(new Set(ids).size,ids.length);
assert.equal(chapterModules.filter(m=>m.stage==="boundary").length,1);
assert.equal(chapterModules.filter(m=>m.stage==="cleaning").length,4);
assert.equal(chapterModules[0].scan,undefined);
assert.deepEqual(toolIdsForCleaning("章节标题"),["wb-clean-heading-numbers-label"]);
assert.deepEqual(toolIdsForCleaning("媒体"),["wb-clean-download-media"]);
assert.deepEqual(toolIdsForCleaning("表格"),[]);
assert.deepEqual(toolIdsForCleaning("LaTeX"),[]);
const chapter=[
 "# Heading","[图片来源](https://example.org/a.png)",
 "<table><tr><td>one</td></tr></table>",
 "$x^2$","$$\\frac{1}{2}$$",
].join("\n");
const file="/ocr2md/Book/chapters/01.md";
assert.deepEqual(cleaningModule("章节标题").scan(chapter,file),
  scanChapterHeadingCandidates(chapter,file));
for(const id of ["媒体","表格","LaTeX"] as const)
  assert.deepEqual(cleaningModule(id).scan(chapter,file),
    scanChapterElements(chapter,file,id));
assert.throws(()=>cleaningModule("误用" as "媒体"),/未知章节清洗模块/);
console.log("V3_CHAPTER_MODULE_REGISTRY_PASS",JSON.stringify({ids,toolIds:4,noIo:true}));

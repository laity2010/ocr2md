import * as assert from "assert";
import {
  extractImageUrl,
  extractLocalImagePath,
  safeImageName,
  shouldDownloadImage,
  timestampedImageName,
} from "./imageDownload";

assert.strictEqual(
  extractImageUrl("![image](https://cdn.example/a.jpg)"),
  "https://cdn.example/a.jpg",
);
assert.strictEqual(
  extractImageUrl('<img src="https://cdn.example/b.png">'),
  "https://cdn.example/b.png",
);
assert.strictEqual(extractImageUrl("![[local.png]]"), undefined);
assert.strictEqual(extractImageUrl("plain text"), undefined);
assert.strictEqual(extractLocalImagePath("![alt text](image.png)"), "image.png");
assert.strictEqual(extractLocalImagePath("![alt](./images/image%2001.png)"), "./images/image 01.png");
assert.strictEqual(extractLocalImagePath("![alt](https://cdn.example/a.jpg)"), undefined);

assert.strictEqual(safeImageName("https://cdn.example/path/fcc27f.jpg", 10), "fcc27f.jpg");
assert.strictEqual(safeImageName("https://cdn.example/", 10), "image-11.jpg");
assert.strictEqual(
  timestampedImageName("image.png", new Date(2026, 7, 23, 19, 28, 53, 355).getTime()),
  "image-20260823-192853-355.png",
);

const row = { raw: "![image](https://cdn.example/a.jpg)", localPath: "imgs/a.jpg", imageDownloadStatus: "done" as const };
assert.strictEqual(shouldDownloadImage(row, true), false, "done file must not download again");
assert.strictEqual(shouldDownloadImage(row, false), true, "missing file must resume");
assert.strictEqual(
  shouldDownloadImage({ ...row, imageDownloadStatus: "failed" }, true),
  true,
  "failed download must retry",
);
assert.strictEqual(
  shouldDownloadImage({ raw: row.raw }, false),
  true,
  "new image must download",
);
assert.strictEqual(shouldDownloadImage({ raw: "caption only" }, false), false);

console.log("imageDownload tests passed");

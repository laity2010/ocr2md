import * as assert from "assert";
import {
  GoogleDriveApiError,
  GoogleDriveApiGateway,
  type DriveHttpRequest,
  type DriveHttpResponse,
  type DriveHttpTransport,
} from "./googleDriveApiGateway";
import { GOOGLE_DRIVE_FOLDER_MIME_TYPE, type GoogleDriveItem } from "./googleDriveWorkspaceStorage";

class RecordingTransport implements DriveHttpTransport {
  readonly requests: DriveHttpRequest[] = [];
  readonly responses: DriveHttpResponse[] = [];

  async request(request: DriveHttpRequest): Promise<DriveHttpResponse> {
    this.requests.push({
      ...request,
      headers: { ...request.headers },
      body: request.body ? Uint8Array.from(request.body) : undefined,
    });
    const response = this.responses.shift();
    if (!response) throw new Error("No fake Drive response queued");
    return response;
  }

  queueJson(status: number, value: unknown): void {
    this.responses.push({ status, body: new TextEncoder().encode(JSON.stringify(value)) });
  }

  queueBytes(status: number, value: string): void {
    this.responses.push({ status, body: new TextEncoder().encode(value) });
  }
}

function driveItem(id: string, name: string, mimeType = "text/markdown"): GoogleDriveItem {
  return {
    id,
    name,
    mimeType,
    parents: ["folder-id"],
    createdTime: "2026-08-29T00:00:00.000Z",
    modifiedTime: "2026-08-29T00:00:00.000Z",
    size: "12",
  };
}

function requestBodyText(request: DriveHttpRequest): string {
  return new TextDecoder().decode(request.body ?? new Uint8Array());
}

void (async () => {
  const transport = new RecordingTransport();
  const gateway = new GoogleDriveApiGateway(transport, () => "short-lived-access-token");

  transport.queueJson(200, {
    files: [driveItem("file-1", "01.md")],
    nextPageToken: "page-2",
  });
  transport.queueJson(200, {
    files: [driveItem("file-2", "02.md")],
  });
  const children = await gateway.listChildren("folder-id");
  assert.deepStrictEqual(children.map((item) => item.id), ["file-1", "file-2"]);
  assert.strictEqual(transport.requests.length, 2);
  assert.ok(decodeURIComponent(transport.requests[0].url).includes("'folder-id' in parents and trashed = false"));
  assert.ok(transport.requests[1].url.includes("pageToken=page-2"));
  assert.strictEqual(transport.requests[0].headers.Authorization, "Bearer short-lived-access-token");

  transport.queueBytes(200, "# 第一章\n");
  assert.strictEqual(new TextDecoder().decode(await gateway.downloadFile("file-1")), "# 第一章\n");
  assert.ok(transport.requests.at(-1)?.url.endsWith("/files/file-1?alt=media"));

  transport.queueJson(200, driveItem("folder-2", "chapters", GOOGLE_DRIVE_FOLDER_MIME_TYPE));
  const folder = await gateway.createFolder("chapters", "folder-id");
  assert.strictEqual(folder.id, "folder-2");
  const createFolderRequest = transport.requests.at(-1);
  assert.strictEqual(createFolderRequest?.method, "POST");
  assert.deepStrictEqual(JSON.parse(requestBodyText(createFolderRequest!)), {
    name: "chapters",
    parents: ["folder-id"],
    mimeType: GOOGLE_DRIVE_FOLDER_MIME_TYPE,
  });

  transport.queueJson(200, driveItem("file-3", "新文件.md"));
  const created = await gateway.createFile(
    "新文件.md",
    "folder-id",
    new TextEncoder().encode("# 新文件\n"),
    "text/markdown",
  );
  assert.strictEqual(created.id, "file-3");
  const createFileRequest = transport.requests.at(-1);
  assert.strictEqual(createFileRequest?.method, "POST");
  assert.ok(createFileRequest?.url.includes("uploadType=multipart"));
  assert.ok(createFileRequest?.headers["Content-Type"].startsWith("multipart/related; boundary=ocr2md-drive-"));
  const multipart = requestBodyText(createFileRequest!);
  assert.ok(multipart.includes('"name":"新文件.md"'));
  assert.ok(multipart.includes('"parents":["folder-id"]'));
  assert.ok(multipart.includes("# 新文件\n"));

  transport.queueJson(200, driveItem("file-3", "新文件.md"));
  const updated = await gateway.updateFile(
    "file-3",
    new TextEncoder().encode("# 新文件\n\n已更新。\n"),
    "text/markdown",
  );
  assert.strictEqual(updated.id, "file-3", "update must preserve the Drive file ID");
  const updateRequest = transport.requests.at(-1);
  assert.strictEqual(updateRequest?.method, "PATCH");
  assert.ok(updateRequest?.url.includes("/upload/drive/v3/files/file-3?uploadType=media"));
  assert.strictEqual(updateRequest?.headers["Content-Type"], "text/markdown");
  assert.strictEqual(requestBodyText(updateRequest!), "# 新文件\n\n已更新。\n");

  transport.queueJson(200, driveItem("file-4", "副本.md"));
  await gateway.copyFile("file-3", "副本.md", "folder-2");
  const copyRequest = transport.requests.at(-1);
  assert.ok(copyRequest?.url.includes("/files/file-3/copy"));
  assert.deepStrictEqual(JSON.parse(requestBodyText(copyRequest!)), {
    name: "副本.md",
    parents: ["folder-2"],
  });

  transport.queueJson(200, driveItem("file-4", "已移动.md"));
  await gateway.moveItem("file-4", "已移动.md", "folder-3", "folder-2");
  const moveRequest = transport.requests.at(-1);
  assert.strictEqual(moveRequest?.method, "PATCH");
  const decodedMoveUrl = decodeURIComponent(moveRequest!.url);
  assert.ok(decodedMoveUrl.includes("addParents=folder-3"));
  assert.ok(decodedMoveUrl.includes("removeParents=folder-2"));
  assert.deepStrictEqual(JSON.parse(requestBodyText(moveRequest!)), { name: "已移动.md" });

  transport.queueJson(200, { id: "file-4", trashed: true });
  await gateway.trashItem("file-4");
  assert.deepStrictEqual(JSON.parse(requestBodyText(transport.requests.at(-1)!)), { trashed: true });

  const failingTransport = new RecordingTransport();
  failingTransport.queueJson(403, { error: { message: "Insufficient permissions" } });
  const failingGateway = new GoogleDriveApiGateway(failingTransport, () => "token");
  await assert.rejects(
    () => failingGateway.listChildren("folder-id"),
    (error: unknown) =>
      error instanceof GoogleDriveApiError
      && error.status === 403
      && error.message.includes("Insufficient permissions"),
  );

  const missingTokenGateway = new GoogleDriveApiGateway(new RecordingTransport(), () => "");
  await assert.rejects(
    () => missingTokenGateway.downloadFile("file-1"),
    (error: unknown) => error instanceof GoogleDriveApiError && error.status === 401,
  );

  console.log("googleDriveApiGateway tests passed");
})();

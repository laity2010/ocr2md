import {
  GOOGLE_DRIVE_FOLDER_MIME_TYPE,
  type GoogleDriveFileGateway,
  type GoogleDriveItem,
} from "./googleDriveWorkspaceStorage";

const DRIVE_API_BASE = "https://www.googleapis.com/drive/v3";
const DRIVE_UPLOAD_BASE = "https://www.googleapis.com/upload/drive/v3";
const FILE_FIELDS = "id,name,mimeType,parents,createdTime,modifiedTime,size";

export interface DriveHttpRequest {
  method: "GET" | "POST" | "PATCH";
  url: string;
  headers: Record<string, string>;
  body?: Uint8Array;
}

export interface DriveHttpResponse {
  status: number;
  body: Uint8Array;
}

export interface DriveHttpTransport {
  request(request: DriveHttpRequest): Promise<DriveHttpResponse>;
}

export type GoogleDriveAccessTokenProvider = () => string | Promise<string>;

export class GoogleDriveApiError extends Error {
  constructor(
    readonly status: number,
    readonly operation: string,
    message: string,
  ) {
    super(message);
    this.name = "GoogleDriveApiError";
  }
}

/**
 * Google Drive v3 REST implementation used by GoogleDriveWorkspaceStorage.
 *
 * The access token is requested for every operation and is never persisted.
 * A browser host supplies a fetch-backed transport; unit tests supply a fake.
 */
export class GoogleDriveApiGateway implements GoogleDriveFileGateway {
  private multipartSequence = 0;

  constructor(
    private readonly transport: DriveHttpTransport,
    private readonly accessToken: GoogleDriveAccessTokenProvider,
  ) {}

  async listChildren(parentId: string): Promise<GoogleDriveItem[]> {
    const items: GoogleDriveItem[] = [];
    let pageToken: string | undefined;
    do {
      const query = `'${escapeDriveQueryValue(parentId)}' in parents and trashed = false`;
      const parameters: Record<string, string> = {
        q: query,
        spaces: "drive",
        pageSize: "1000",
        fields: `nextPageToken,files(${FILE_FIELDS})`,
      };
      if (pageToken) parameters.pageToken = pageToken;
      const response = await this.requestJson<{ files?: GoogleDriveItem[]; nextPageToken?: string }>(
        "GET",
        `${DRIVE_API_BASE}/files?${encodeQuery(parameters)}`,
        undefined,
        undefined,
        "list children",
      );
      items.push(...(response.files ?? []));
      pageToken = response.nextPageToken;
    } while (pageToken);
    return items;
  }

  async downloadFile(fileId: string): Promise<Uint8Array> {
    return this.requestBytes(
      "GET",
      `${DRIVE_API_BASE}/files/${encodeURIComponent(fileId)}?alt=media`,
      undefined,
      undefined,
      "download file",
    );
  }

  async createFolder(name: string, parentId: string): Promise<GoogleDriveItem> {
    return this.requestJson(
      "POST",
      `${DRIVE_API_BASE}/files?fields=${encodeURIComponent(FILE_FIELDS)}`,
      jsonBytes({
        name,
        parents: [parentId],
        mimeType: GOOGLE_DRIVE_FOLDER_MIME_TYPE,
      }),
      "application/json; charset=UTF-8",
      "create folder",
    );
  }

  async createFile(name: string, parentId: string, data: Uint8Array, mimeType: string): Promise<GoogleDriveItem> {
    const boundary = `ocr2md-drive-${++this.multipartSequence}`;
    const metadata = JSON.stringify({ name, parents: [parentId], mimeType });
    const body = concatBytes(
      textBytes(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n`),
      textBytes(`--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n`),
      Uint8Array.from(data),
      textBytes(`\r\n--${boundary}--\r\n`),
    );
    return this.requestJson(
      "POST",
      `${DRIVE_UPLOAD_BASE}/files?uploadType=multipart&fields=${encodeURIComponent(FILE_FIELDS)}`,
      body,
      `multipart/related; boundary=${boundary}`,
      "create file",
    );
  }

  async updateFile(fileId: string, data: Uint8Array, mimeType: string): Promise<GoogleDriveItem> {
    return this.requestJson(
      "PATCH",
      `${DRIVE_UPLOAD_BASE}/files/${encodeURIComponent(fileId)}?uploadType=media&fields=${encodeURIComponent(FILE_FIELDS)}`,
      Uint8Array.from(data),
      mimeType,
      "update file",
    );
  }

  async copyFile(fileId: string, name: string, parentId: string): Promise<GoogleDriveItem> {
    return this.requestJson(
      "POST",
      `${DRIVE_API_BASE}/files/${encodeURIComponent(fileId)}/copy?fields=${encodeURIComponent(FILE_FIELDS)}`,
      jsonBytes({ name, parents: [parentId] }),
      "application/json; charset=UTF-8",
      "copy file",
    );
  }

  async moveItem(fileId: string, name: string, parentId: string, previousParentId: string): Promise<GoogleDriveItem> {
    return this.requestJson(
      "PATCH",
      `${DRIVE_API_BASE}/files/${encodeURIComponent(fileId)}?${encodeQuery({
        addParents: parentId,
        removeParents: previousParentId,
        fields: FILE_FIELDS,
      })}`,
      jsonBytes({ name }),
      "application/json; charset=UTF-8",
      "move item",
    );
  }

  async trashItem(fileId: string): Promise<void> {
    await this.requestJson(
      "PATCH",
      `${DRIVE_API_BASE}/files/${encodeURIComponent(fileId)}?fields=id,trashed`,
      jsonBytes({ trashed: true }),
      "application/json; charset=UTF-8",
      "trash item",
    );
  }

  private async requestJson<T>(
    method: DriveHttpRequest["method"],
    url: string,
    body: Uint8Array | undefined,
    contentType: string | undefined,
    operation: string,
  ): Promise<T> {
    const bytes = await this.requestBytes(method, url, body, contentType, operation);
    if (bytes.byteLength === 0) return {} as T;
    try {
      return JSON.parse(new TextDecoder().decode(bytes)) as T;
    } catch {
      throw new GoogleDriveApiError(502, operation, `Google Drive returned invalid JSON during ${operation}`);
    }
  }

  private async requestBytes(
    method: DriveHttpRequest["method"],
    url: string,
    body: Uint8Array | undefined,
    contentType: string | undefined,
    operation: string,
  ): Promise<Uint8Array> {
    const token = (await this.accessToken()).trim();
    if (!token) throw new GoogleDriveApiError(401, operation, "Google Drive access token is unavailable");
    const headers: Record<string, string> = {
      Authorization: `Bearer ${token}`,
    };
    if (contentType) headers["Content-Type"] = contentType;
    const response = await this.transport.request({ method, url, headers, body });
    if (response.status >= 200 && response.status < 300) return response.body;

    const detail = driveErrorMessage(response.body);
    throw new GoogleDriveApiError(
      response.status,
      operation,
      detail ? `Google Drive ${operation} failed (${response.status}): ${detail}` : `Google Drive ${operation} failed (${response.status})`,
    );
  }
}

function encodeQuery(parameters: Record<string, string>): string {
  return Object.entries(parameters)
    .map(([name, value]) => `${encodeURIComponent(name)}=${encodeURIComponent(value)}`)
    .join("&");
}

function escapeDriveQueryValue(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

function textBytes(value: string): Uint8Array {
  return new TextEncoder().encode(value);
}

function jsonBytes(value: unknown): Uint8Array {
  return textBytes(JSON.stringify(value));
}

function concatBytes(...parts: Uint8Array[]): Uint8Array {
  const result = new Uint8Array(parts.reduce((size, part) => size + part.byteLength, 0));
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.byteLength;
  }
  return result;
}

function driveErrorMessage(body: Uint8Array): string | undefined {
  if (body.byteLength === 0) return undefined;
  try {
    const parsed = JSON.parse(new TextDecoder().decode(body)) as {
      error?: { message?: string };
    };
    return parsed.error?.message;
  } catch {
    return undefined;
  }
}

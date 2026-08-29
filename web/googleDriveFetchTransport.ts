import type {
  DriveHttpRequest,
  DriveHttpResponse,
  DriveHttpTransport,
} from "../src/googleDriveApiGateway";

/** Browser transport for GoogleDriveApiGateway. */
export class BrowserFetchDriveTransport implements DriveHttpTransport {
  private readonly fetchImplementation: typeof fetch;

  constructor(fetchImplementation: typeof fetch = globalThis.fetch.bind(globalThis)) {
    this.fetchImplementation = fetchImplementation;
  }

  async request(request: DriveHttpRequest): Promise<DriveHttpResponse> {
    const response = await this.fetchImplementation(request.url, {
      method: request.method,
      headers: request.headers,
      body: request.body ? Uint8Array.from(request.body).buffer : undefined,
      cache: "no-store",
      credentials: "omit",
    });
    return {
      status: response.status,
      body: new Uint8Array(await response.arrayBuffer()),
    };
  }
}

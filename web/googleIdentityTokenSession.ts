const GOOGLE_IDENTITY_SCRIPT_ID = "ocr2md-google-identity-services";
const GOOGLE_IDENTITY_SCRIPT_URL = "https://accounts.google.com/gsi/client";
export const GOOGLE_DRIVE_SCOPE = "https://www.googleapis.com/auth/drive";
const EXPIRY_SAFETY_WINDOW_MS = 60_000;

interface GoogleTokenResponse {
  access_token?: string;
  expires_in?: number;
  error?: string;
  error_description?: string;
}

interface GoogleTokenClient {
  requestAccessToken(options?: { prompt?: string }): void;
}

interface GoogleOauth2 {
  initTokenClient(options: {
    client_id: string;
    scope: string;
    callback: (response: GoogleTokenResponse) => void;
    error_callback?: (error: { type?: string; message?: string }) => void;
  }): GoogleTokenClient;
  revoke(token: string, callback?: () => void): void;
}

type GoogleWindow = Window & {
  google?: {
    accounts?: {
      oauth2?: GoogleOauth2;
    };
  };
};

let scriptLoad: Promise<void> | undefined;

/**
 * Browser-only OAuth token session backed by Google Identity Services.
 *
 * Access tokens live only in this object. They are never written to localStorage,
 * sessionStorage, IndexedDB, cookies, URLs, or the generated HTML.
 */
export class GoogleIdentityTokenSession {
  private accessToken = "";
  private expiresAt = 0;
  private hasAuthorized = false;

  constructor(
    private readonly clientId: string,
    private readonly scope = GOOGLE_DRIVE_SCOPE,
  ) {
    if (!clientId.trim()) throw new Error("Google OAuth client ID is required");
  }

  async prepare(): Promise<void> {
    await loadGoogleIdentityServices();
  }

  async connect(): Promise<void> {
    await this.prepare();
    const oauth2 = googleOauth2();
    await new Promise<void>((resolve, reject) => {
      const client = oauth2.initTokenClient({
        client_id: this.clientId,
        scope: this.scope,
        callback: (response) => {
          if (response.error || !response.access_token) {
            reject(new Error(response.error_description || response.error || "Google login did not return an access token"));
            return;
          }
          const seconds = Math.max(0, Number(response.expires_in ?? 0));
          this.accessToken = response.access_token;
          this.expiresAt = Date.now() + Math.max(0, seconds * 1000 - EXPIRY_SAFETY_WINDOW_MS);
          this.hasAuthorized = true;
          resolve();
        },
        error_callback: (error) => {
          reject(new Error(error.message || error.type || "Google login window was closed"));
        },
      });
      client.requestAccessToken({ prompt: this.hasAuthorized ? "" : "consent" });
    });
  }

  getAccessToken(): string {
    if (!this.accessToken || Date.now() >= this.expiresAt) {
      this.clear();
      throw new Error("Google Drive login has expired. Connect again.");
    }
    return this.accessToken;
  }

  isConnected(): boolean {
    return Boolean(this.accessToken) && Date.now() < this.expiresAt;
  }

  disconnect(): void {
    const token = this.accessToken;
    this.clear();
    this.hasAuthorized = false;
    if (!token) return;
    try {
      googleOauth2().revoke(token);
    } catch {
      // The local token is already cleared; a failed remote revoke is non-fatal.
    }
  }

  private clear(): void {
    this.accessToken = "";
    this.expiresAt = 0;
  }
}

function loadGoogleIdentityServices(): Promise<void> {
  if (googleOauth2OrUndefined()) return Promise.resolve();
  if (scriptLoad) return scriptLoad;

  scriptLoad = new Promise<void>((resolve, reject) => {
    const existing = document.getElementById(GOOGLE_IDENTITY_SCRIPT_ID) as HTMLScriptElement | null;
    const script = existing ?? document.createElement("script");
    const complete = () => {
      if (googleOauth2OrUndefined()) resolve();
      else reject(new Error("Google Identity Services loaded without OAuth support"));
    };
    script.addEventListener("load", complete, { once: true });
    script.addEventListener("error", () => reject(new Error("Could not load Google Identity Services")), { once: true });
    if (!existing) {
      script.id = GOOGLE_IDENTITY_SCRIPT_ID;
      script.src = GOOGLE_IDENTITY_SCRIPT_URL;
      script.async = true;
      script.defer = true;
      document.head.append(script);
    }
  }).catch((error) => {
    scriptLoad = undefined;
    throw error;
  });

  return scriptLoad;
}

function googleOauth2(): GoogleOauth2 {
  const oauth2 = googleOauth2OrUndefined();
  if (!oauth2) throw new Error("Google Identity Services is not ready");
  return oauth2;
}

function googleOauth2OrUndefined(): GoogleOauth2 | undefined {
  return (window as GoogleWindow).google?.accounts?.oauth2;
}

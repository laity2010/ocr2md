import { GoogleDriveApiGateway } from "../../src/googleDriveApiGateway";
import {
  GOOGLE_DRIVE_FOLDER_MIME_TYPE,
  GoogleDriveWorkspaceError,
  GoogleDriveWorkspaceStorage,
  type GoogleDriveItem,
} from "../../src/googleDriveWorkspaceStorage";
import { BrowserFetchDriveTransport } from "../../web/googleDriveFetchTransport";
import { GoogleIdentityTokenSession } from "../../web/googleIdentityTokenSession";

const GOOGLE_DRIVE_FILE_SCOPE = "https://www.googleapis.com/auth/drive.file";
const FILE_CACHE_LIMIT = 12;

type DriveWorkspaceStatusKind = "ready" | "pass" | "fail";

interface DriveLocation {
  id: string;
  name: string;
  path: string;
}

interface CachedFile {
  version: string;
  text: string;
}

export interface GoogleDriveWorkspaceConfig {
  clientId: string;
  rootFolderId: string;
}

export interface GoogleDriveWorkspaceOpenedFile {
  path: string;
  name: string;
  text: string;
}

export interface GoogleDriveWorkspaceHost {
  onOpenFile(file: GoogleDriveWorkspaceOpenedFile): void;
  onActivateCleaningWorkspace(): void;
}

export interface GoogleDriveWorkspaceController {
  prepare(): Promise<void>;
  refresh(): Promise<void>;
}

export function installGoogleDriveWorkspace(
  config: GoogleDriveWorkspaceConfig,
  host: GoogleDriveWorkspaceHost,
): GoogleDriveWorkspaceController {
  const connectButton = requiredElement<HTMLButtonElement>("#gd-connect");
  const disconnectButton = requiredElement<HTMLButtonElement>("#gd-disconnect");
  const upButton = requiredElement<HTMLButtonElement>("#gd-up");
  const refreshButton = requiredElement<HTMLButtonElement>("#gd-refresh");
  const openButton = requiredElement<HTMLButtonElement>("#gd-open");
  const renameButton = requiredElement<HTMLButtonElement>("#gd-rename");
  const breadcrumbs = requiredElement<HTMLElement>("#gd-breadcrumbs");
  const list = requiredElement<HTMLElement>("#gd-list");
  const status = requiredElement<HTMLElement>("#gd-status");
  const selectionStatus = requiredElement<HTMLElement>("#gd-selection-status");

  const session = new GoogleIdentityTokenSession(config.clientId, GOOGLE_DRIVE_FILE_SCOPE);
  const gateway = new GoogleDriveApiGateway(
    new BrowserFetchDriveTransport(),
    () => session.getAccessToken(),
  );
  // Keep the path-oriented storage for operations where its conflict/path semantics
  // are valuable. Browsing and opening use Drive ids directly to avoid N+1 reads.
  const storage = new GoogleDriveWorkspaceStorage(gateway, config.rootFolderId);
  const directoryCache = new Map<string, GoogleDriveItem[]>();
  const fileCache = new Map<string, CachedFile>();

  let locations: DriveLocation[] = [rootLocation()];
  let currentEntries: GoogleDriveItem[] = [];
  let selectedEntry: GoogleDriveItem | undefined;
  let busy = false;

  connectButton.disabled = true;
  disconnectButton.disabled = true;
  upButton.disabled = true;
  refreshButton.disabled = true;
  openButton.disabled = true;
  renameButton.disabled = true;
  renderBreadcrumbs();
  renderMessage("Google Drive 登录组件准备中…");
  setStatus("准备 Google Drive", "ready");

  connectButton.addEventListener("click", () => { void connect(); });
  disconnectButton.addEventListener("click", disconnect);
  upButton.addEventListener("click", () => { void openParent(); });
  refreshButton.addEventListener("click", () => { void refresh(); });
  openButton.addEventListener("click", () => { void openSelected(); });
  renameButton.addEventListener("click", () => { void renameSelected(); });

  async function prepare(): Promise<void> {
    try {
      await session.prepare();
      if (session.isConnected()) {
        directoryCache.clear();
        fileCache.clear();
        locations = [rootLocation()];
        selectedEntry = undefined;
        await loadCurrentDirectory(false);
        setStatus(`Google Drive 会话已恢复 · ${currentEntries.length} 项`, "pass");
        refreshControls();
        return;
      }
      if (session.hasPriorAuthorization()) {
        renderMessage("正在恢复上次 Google Drive 会话…");
        setStatus("正在自动连接 Google Drive…", "ready");
        try {
          await session.connect();
          directoryCache.clear();
          fileCache.clear();
          locations = [rootLocation()];
          selectedEntry = undefined;
          await loadCurrentDirectory(false);
          setStatus(`Google Drive 已自动连接 · ${currentEntries.length} 项`, "pass");
          refreshControls();
          return;
        } catch {
          // Silent reconnect is best effort. Fall back to the explicit connect button.
        }
      }
      connectButton.disabled = false;
      renderMessage("点击“连接”读取 ocr2md 的 Google Drive 工作目录。");
      setStatus("Google Drive 未连接", "ready");
    } catch (error) {
      renderMessage(errorMessage(error));
      setStatus(errorMessage(error), "fail");
    }
  }

  async function connect(): Promise<void> {
    if (busy) return;
    setBusy(true);
    setStatus("正在连接 Google Drive…", "ready");
    try {
      await session.connect();
      directoryCache.clear();
      fileCache.clear();
      locations = [rootLocation()];
      selectedEntry = undefined;
      await loadCurrentDirectory(false);
      setStatus(`Google Drive 已连接 · ${currentEntries.length} 项`, "pass");
    } catch (error) {
      renderMessage(errorMessage(error));
      setStatus(errorMessage(error), "fail");
    } finally {
      setBusy(false);
    }
  }

  function disconnect(): void {
    session.disconnect();
    directoryCache.clear();
    fileCache.clear();
    locations = [rootLocation()];
    currentEntries = [];
    selectedEntry = undefined;
    renderBreadcrumbs();
    renderMessage("已断开。访问令牌已从浏览器内存清除。");
    setStatus("Google Drive 已断开", "ready");
    refreshControls();
  }

  async function refresh(): Promise<void> {
    if (!session.isConnected() || busy) return;
    setBusy(true);
    try {
      await loadCurrentDirectory(true);
      setStatus(`已从远端刷新 · ${displayPath(currentLocation().path)} · ${currentEntries.length} 项`, "pass");
    } catch (error) {
      renderMessage(errorMessage(error));
      setStatus(errorMessage(error), "fail");
    } finally {
      setBusy(false);
    }
  }

  async function loadCurrentDirectory(forceRemote: boolean): Promise<void> {
    const location = currentLocation();
    let entries = !forceRemote ? directoryCache.get(location.id) : undefined;
    const cacheHit = Boolean(entries);
    if (!entries) {
      entries = sortEntries(await gateway.listChildren(location.id));
      directoryCache.set(location.id, entries);
    }
    currentEntries = entries;
    selectedEntry = undefined;
    renderBreadcrumbs();
    renderEntries();
    refreshControls();
    if (cacheHit) setStatus(`已从缓存打开 · ${displayPath(location.path)} · ${entries.length} 项`, "ready");
  }

  async function openParent(): Promise<void> {
    if (locations.length <= 1 || busy) return;
    locations.pop();
    await openCachedOrRemoteDirectory();
  }

  async function openDirectory(entry: GoogleDriveItem): Promise<void> {
    if (!isFolder(entry) || busy) return;
    locations.push({
      id: entry.id,
      name: entry.name,
      path: childPath(currentLocation().path, entry.name),
    });
    await openCachedOrRemoteDirectory();
  }

  async function openCachedOrRemoteDirectory(): Promise<void> {
    if (!session.isConnected()) return;
    setBusy(true);
    const before = performance.now();
    const location = currentLocation();
    const cacheHit = directoryCache.has(location.id);
    try {
      await loadCurrentDirectory(false);
      const elapsed = Math.max(0, Math.round(performance.now() - before));
      setStatus(
        `${cacheHit ? "缓存" : "远端"} · ${displayPath(location.path)} · ${currentEntries.length} 项 · ${elapsed} ms`,
        cacheHit ? "ready" : "pass",
      );
    } catch (error) {
      renderMessage(errorMessage(error));
      setStatus(errorMessage(error), "fail");
    } finally {
      setBusy(false);
    }
  }

  async function openSelected(): Promise<void> {
    const entry = selectedEntry;
    if (!entry || busy) return;
    if (isFolder(entry)) {
      await openDirectory(entry);
      return;
    }
    if (!/\.(?:md|markdown)$/i.test(entry.name)) {
      setStatus("当前只允许把 Markdown 文件打开到清洗工作区", "fail");
      return;
    }

    const path = childPath(currentLocation().path, entry.name);
    const version = driveVersion(entry);
    const cached = fileCache.get(entry.id);
    setBusy(true);
    const before = performance.now();
    setStatus(cached?.version === version ? `正在从缓存打开 · ${entry.name}` : `正在下载 · ${entry.name}`, "ready");
    try {
      let text: string;
      let cacheHit = false;
      if (cached?.version === version) {
        text = cached.text;
        cacheHit = true;
        touchFileCache(entry.id, cached);
      } else {
        const data = await gateway.downloadFile(entry.id);
        text = new TextDecoder("utf-8").decode(data);
        touchFileCache(entry.id, { version, text });
      }
      host.onOpenFile({ path, name: entry.name, text });
      host.onActivateCleaningWorkspace();
      const elapsed = Math.max(0, Math.round(performance.now() - before));
      setStatus(`已打开 · ${entry.name} · ${cacheHit ? "缓存" : "远端"} · ${elapsed} ms`, "pass");
    } catch (error) {
      setStatus(errorMessage(error), "fail");
    } finally {
      setBusy(false);
    }
  }

  async function renameSelected(): Promise<void> {
    const entry = selectedEntry;
    if (!entry || busy) return;
    const nextName = globalThis.prompt("新名称", entry.name)?.trim();
    if (!nextName || nextName === entry.name) return;
    if (nextName.includes("/")) {
      setStatus("名称不能包含 /", "fail");
      return;
    }

    const directory = currentLocation();
    const sourcePath = childPath(directory.path, entry.name);
    const targetPath = childPath(directory.path, nextName);
    setBusy(true);
    setStatus(`正在重命名 · ${entry.name}`, "ready");
    try {
      await storage.rename(sourcePath, targetPath);
      directoryCache.delete(directory.id);
      fileCache.delete(entry.id);
      await loadCurrentDirectory(true);
      const renamed = currentEntries.find((candidate) => candidate.name === nextName);
      if (renamed) selectEntry(renamed);
      setStatus(`已重命名 · ${entry.name} → ${nextName}`, "pass");
    } catch (error) {
      if (error instanceof GoogleDriveWorkspaceError && error.code === "EEXIST") {
        setStatus(`重命名失败：${nextName} 已存在`, "fail");
      } else {
        setStatus(errorMessage(error), "fail");
      }
    } finally {
      setBusy(false);
    }
  }

  function renderBreadcrumbs(): void {
    breadcrumbs.replaceChildren();
    locations.forEach((location, index) => {
      if (index > 0) {
        const separator = document.createElement("span");
        separator.className = "gd-breadcrumb-separator";
        separator.textContent = "/";
        breadcrumbs.append(separator);
      }
      breadcrumbs.append(breadcrumbButton(location.name, index));
    });
  }

  function breadcrumbButton(label: string, index: number): HTMLButtonElement {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "gd-breadcrumb";
    button.textContent = label;
    button.disabled = index === locations.length - 1 || !session.isConnected() || busy;
    button.addEventListener("click", () => {
      if (busy || index === locations.length - 1) return;
      locations = locations.slice(0, index + 1);
      void openCachedOrRemoteDirectory();
    });
    return button;
  }

  function renderEntries(): void {
    list.replaceChildren();
    if (!currentEntries.length) {
      renderMessage("当前目录为空，或 drive.file 尚未获准访问其中的文件。");
      return;
    }
    for (const entry of currentEntries) {
      const row = document.createElement("button");
      row.type = "button";
      row.className = "gd-entry";
      row.dataset.entryId = entry.id;
      row.setAttribute("role", "row");

      const icon = document.createElement("span");
      icon.className = "gd-entry-icon";
      icon.textContent = isFolder(entry) ? "▸" : "";
      const name = document.createElement("span");
      name.className = "gd-entry-name";
      name.textContent = entry.name;
      const type = document.createElement("span");
      type.className = "gd-entry-type";
      type.textContent = isFolder(entry) ? "文件夹" : "文件";
      row.append(icon, name, type);
      row.addEventListener("click", () => selectEntry(entry));
      row.addEventListener("dblclick", () => {
        selectEntry(entry);
        void openSelected();
      });
      list.append(row);
    }
  }

  function renderMessage(message: string): void {
    const node = document.createElement("div");
    node.className = "gd-message";
    node.textContent = message;
    list.replaceChildren(node);
  }

  function selectEntry(entry: GoogleDriveItem): void {
    selectedEntry = entry;
    for (const row of Array.from(list.querySelectorAll<HTMLElement>(".gd-entry"))) {
      row.classList.toggle("is-selected", row.dataset.entryId === entry.id);
    }
    selectionStatus.textContent = `${isFolder(entry) ? "文件夹" : "文件"} · ${entry.name}`;
    refreshControls();
  }

  function setBusy(nextBusy: boolean): void {
    busy = nextBusy;
    refreshControls();
    renderBreadcrumbs();
  }

  function refreshControls(): void {
    const connected = session.isConnected();
    connectButton.disabled = busy || connected;
    disconnectButton.disabled = busy || !connected;
    upButton.disabled = busy || !connected || locations.length <= 1;
    refreshButton.disabled = busy || !connected;
    openButton.disabled = busy || !connected || !selectedEntry;
    renameButton.disabled = busy || !connected || !selectedEntry;
    selectionStatus.textContent = selectedEntry
      ? `${isFolder(selectedEntry) ? "文件夹" : "文件"} · ${selectedEntry.name}`
      : connected ? `未选择 · ${currentEntries.length} 项` : "未连接";
  }

  function setStatus(text: string, kind: DriveWorkspaceStatusKind): void {
    status.textContent = text;
    status.dataset.kind = kind;
  }

  function currentLocation(): DriveLocation {
    return locations[locations.length - 1];
  }

  function rootLocation(): DriveLocation {
    return { id: config.rootFolderId, name: "GD", path: "/" };
  }

  function touchFileCache(fileId: string, cached: CachedFile): void {
    fileCache.delete(fileId);
    fileCache.set(fileId, cached);
    while (fileCache.size > FILE_CACHE_LIMIT) {
      const oldest = fileCache.keys().next().value as string | undefined;
      if (!oldest) break;
      fileCache.delete(oldest);
    }
  }

  return { prepare, refresh };
}

function requiredElement<T extends Element>(selector: string): T {
  const node = document.querySelector<T>(selector);
  if (!node) throw new Error(`missing Google Drive workspace DOM: ${selector}`);
  return node;
}

function sortEntries(entries: GoogleDriveItem[]): GoogleDriveItem[] {
  return [...entries].sort((left, right) => {
    const folderOrder = Number(isFolder(right)) - Number(isFolder(left));
    return folderOrder || left.name.localeCompare(right.name, "zh-CN", { numeric: true });
  });
}

function isFolder(item: GoogleDriveItem): boolean {
  return item.mimeType === GOOGLE_DRIVE_FOLDER_MIME_TYPE;
}

function driveVersion(item: GoogleDriveItem): string {
  return JSON.stringify([
    item.headRevisionId ?? "",
    item.md5Checksum ?? "",
    item.modifiedTime ?? "",
    item.size ?? "",
  ]);
}

function childPath(parent: string, name: string): string {
  const cleanParent = parent === "/" ? "" : parent.replace(/\/$/, "");
  return `${cleanParent}/${name}`.replace(/\/{2,}/g, "/");
}

function displayPath(path: string): string {
  return path === "/" ? "GD /" : `GD ${path}`;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

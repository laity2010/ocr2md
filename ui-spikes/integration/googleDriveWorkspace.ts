import { GoogleDriveApiGateway } from "../../src/googleDriveApiGateway";
import { ChapterWorkspaceApplication, type LoadedChapterSidecar } from "../../src/chapterWorkspaceApplication";
import { candidatesFromSidecar } from "../../src/sidecar";
import { markdownFileKind } from "../../src/workspaceFiles";
import type { AnnotationPair, Candidate } from "../../src/types";
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

export interface GoogleDriveWorkspaceOpenedChapter {
  path: string;
  name: string;
  originalText: string;
  workingPath: string;
  workingText: string;
  sidecar: LoadedChapterSidecar;
}

export interface GoogleDriveWorkspaceHost {
  onOpenFile(file: GoogleDriveWorkspaceOpenedFile): void;
  onOpenChapter(chapter: GoogleDriveWorkspaceOpenedChapter): void;
  onActivateCleaningWorkspace(): void;
  onActivateGoogleDriveWorkspace(): void;
}

export interface GoogleDriveWorkspaceController {
  prepare(): Promise<void>;
  refresh(): Promise<void>;
  saveChapterReview(input: {
    filePath: string;
    workingPath: string;
    workingText: string;
    rows: Candidate[];
    annotationPairs: AnnotationPair[];
  }): Promise<{ sidecarPath: string }>;
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
  const setWorkdirButton = requiredElement<HTMLButtonElement>("#gd-set-workdir");
  const breadcrumbs = requiredElement<HTMLElement>("#gd-breadcrumbs");
  const list = requiredElement<HTMLElement>("#gd-list");
  const status = requiredElement<HTMLElement>("#gd-status");
  const selectionStatus = requiredElement<HTMLElement>("#gd-selection-status");
  const workspaceRootPicker = requiredElement<HTMLElement>(".workspace-root-picker");
  const workspaceRootButton = requiredElement<HTMLButtonElement>("#workspace-root-button");
  const workspaceRootMenu = requiredElement<HTMLElement>("#workspace-root-menu");
  const workspaceRootTree = requiredElement<HTMLElement>("#workspace-root-tree");

  const session = new GoogleIdentityTokenSession(config.clientId, GOOGLE_DRIVE_FILE_SCOPE);
  const gateway = new GoogleDriveApiGateway(
    new BrowserFetchDriveTransport(),
    () => session.getAccessToken(),
  );
  // Keep the path-oriented storage for operations where its conflict/path semantics
  // are valuable. Browsing and opening use Drive ids directly to avoid N+1 reads.
  const storage = new GoogleDriveWorkspaceStorage(gateway, config.rootFolderId);
  const chapterWorkspace = new ChapterWorkspaceApplication(storage);
  const directoryCache = new Map<string, GoogleDriveItem[]>();
  const fileCache = new Map<string, CachedFile>();
  const workingDirectoryStorageKey = `ocr2md.integration.gd-workdir.${config.rootFolderId}`;

  let locations: DriveLocation[] = [rootLocation()];
  let currentEntries: GoogleDriveItem[] = [];
  let selectedEntry: GoogleDriveItem | undefined;
  let workingDirectory = loadWorkingDirectory();
  let busy = false;

  connectButton.disabled = true;
  disconnectButton.disabled = true;
  upButton.disabled = true;
  refreshButton.disabled = true;
  openButton.disabled = true;
  renameButton.disabled = true;
  setWorkdirButton.disabled = true;
  renderBreadcrumbs();
  renderMessage("Google Drive 登录组件准备中…");
  renderWorkingDirectoryControl();
  setStatus("准备 Google Drive", "ready");

  connectButton.addEventListener("click", () => { void connect(true); });
  disconnectButton.addEventListener("click", disconnect);
  upButton.addEventListener("click", () => { void openParent(); });
  refreshButton.addEventListener("click", () => { void refresh(); });
  setWorkdirButton.addEventListener("click", () => { void chooseCurrentDirectoryAsWorkingDirectory(); });
  openButton.addEventListener("click", () => { void openSelected(); });
  renameButton.addEventListener("click", () => { void renameSelected(); });
  workspaceRootButton.addEventListener("click", () => { void toggleWorkingDirectoryMenu(); });
  document.addEventListener("pointerdown", (event) => {
    if (workspaceRootMenu.hidden) return;
    const target = event.target;
    if (target instanceof Node && !workspaceRootPicker.contains(target)) workspaceRootMenu.hidden = true;
  });

  async function prepare(): Promise<void> {
    try {
      await session.prepare();
      if (session.isConnected()) {
        directoryCache.clear();
        fileCache.clear();
        locations = [rootLocation()];
        selectedEntry = undefined;
        await loadCurrentDirectory(false);
        await warmWorkingDirectoryStructure();
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
          await warmWorkingDirectoryStructure();
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

  async function connect(fromUserGesture = false): Promise<void> {
    if (busy) return;
    setBusy(true);
    setStatus("正在连接 Google Drive…", "ready");
    try {
      await (fromUserGesture ? session.connectFromUserGesture() : session.connect());
      directoryCache.clear();
      fileCache.clear();
      locations = [rootLocation()];
      selectedEntry = undefined;
      await loadCurrentDirectory(false);
      await warmWorkingDirectoryStructure();
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

  async function chooseCurrentDirectoryAsWorkingDirectory(): Promise<void> {
    if (!session.isConnected() || busy) return;
    const location = currentLocation();
    workingDirectory = { ...location };
    saveWorkingDirectory(workingDirectory);
    workspaceRootMenu.hidden = true;
    renderWorkingDirectoryControl();
    setStatus(`工作目录已选择 · ${displayPath(location.path)} · 正在缓存目录结构…`, "ready");
    try {
      await warmWorkingDirectoryStructure();
      setStatus(`工作目录已选择并缓存 · ${displayPath(location.path)}`, "pass");
    } catch (error) {
      setStatus(`工作目录已选择 · 目录缓存失败：${errorMessage(error)}`, "fail");
    }
  }

  async function toggleWorkingDirectoryMenu(): Promise<void> {
    if (!session.isConnected()) {
      await connect(true);
      if (!session.isConnected()) return;
      workspaceRootMenu.hidden = false;
    } else {
      workspaceRootMenu.hidden = !workspaceRootMenu.hidden;
      if (workspaceRootMenu.hidden) return;
    }
    if (!workingDirectory) {
      workspaceRootMenu.hidden = true;
      host.onActivateGoogleDriveWorkspace();
      setStatus("请选择工作目录", "ready");
      return;
    }
    await renderWorkingDirectoryTree();
  }

  function renderWorkingDirectoryControl(): void {
    workspaceRootButton.disabled = false;
    if (!workingDirectory) {
      workspaceRootButton.textContent = session.isConnected()
        ? "工作目录 · 未选择 ▾"
        : "工作目录 · 未连接 GD ▾";
      workspaceRootButton.title = session.isConnected()
        ? "尚未选择工作目录"
        : "Google Drive 尚未连接";
      workspaceRootTree.replaceChildren();
      return;
    }
    workspaceRootButton.textContent = `工作目录 · ${workingDirectory.name} ▾`;
    workspaceRootButton.title = displayPath(workingDirectory.path);
  }

  function renderWorkingDirectoryMessage(message: string): void {
    workspaceRootTree.replaceChildren();
    const note = document.createElement("div");
    note.className = "workspace-tree-note";
    note.textContent = message;
    workspaceRootTree.append(note);
  }

  async function renderWorkingDirectoryTree(): Promise<void> {
    workspaceRootTree.replaceChildren();
    if (!workingDirectory) {
      renderWorkingDirectoryMessage("尚未选择工作目录");
      return;
    }
    try {
      await appendTreeNode(workspaceRootTree, workingDirectory, 0, true);
    } catch (error) {
      renderWorkingDirectoryMessage(`目录树读取失败：${errorMessage(error)}`);
    }
  }

  async function appendTreeNode(
    parent: HTMLElement,
    location: DriveLocation,
    depth: number,
    expandInitially = false,
  ): Promise<void> {
    const row = document.createElement("div");
    row.className = "workspace-tree-row";
    row.style.setProperty("--tree-depth", String(depth));

    const toggle = document.createElement("button");
    toggle.type = "button";
    toggle.className = "workspace-tree-toggle";
    toggle.textContent = "▸";
    toggle.title = "展开目录";

    const name = document.createElement("button");
    name.type = "button";
    name.className = "workspace-tree-name";
    name.textContent = location.name;
    name.title = displayPath(location.path);

    const children = document.createElement("div");
    children.hidden = true;
    let loaded = false;

    const toggleChildren = async (): Promise<void> => {
      if (children.hidden) {
        children.hidden = false;
        toggle.textContent = "▾";
        toggle.title = "收起目录";
        if (!loaded) {
          loaded = true;
          toggle.disabled = true;
          const folders = await childFolders(location);
          if (!folders.length) {
            const note = document.createElement("div");
            note.className = "workspace-tree-note";
            note.style.marginLeft = `${(depth + 1) * 16}px`;
            note.textContent = "无子目录";
            children.append(note);
          } else {
            for (const child of folders) await appendTreeNode(children, child, depth + 1);
          }
          toggle.disabled = false;
        }
      } else {
        children.hidden = true;
        toggle.textContent = "▸";
        toggle.title = "展开目录";
      }
    };

    toggle.addEventListener("click", () => { void toggleChildren(); });
    name.addEventListener("click", () => {
      if (isChapterDirectory(location)) void openChapterDirectoryFromTree(location);
      else void toggleChildren();
    });
    row.append(toggle, name);
    parent.append(row, children);
    if (expandInitially) await toggleChildren();
  }

  async function childFolders(location: DriveLocation): Promise<DriveLocation[]> {
    let entries = directoryCache.get(location.id);
    if (!entries) {
      entries = sortEntries(await gateway.listChildren(location.id));
      directoryCache.set(location.id, entries);
    }
    return entries
      .filter(isFolder)
      .map((entry) => ({
        id: entry.id,
        name: entry.name,
        path: childPath(location.path, entry.name),
      }));
  }

  function isChapterDirectory(location: DriveLocation): boolean {
    if (!workingDirectory) return false;
    const chaptersPath = childPath(workingDirectory.path, "chapters");
    return parentPath(location.path) === chaptersPath;
  }

  async function openChapterDirectoryFromTree(location: DriveLocation): Promise<void> {
    if (!workingDirectory || !session.isConnected() || busy) return;
    setBusy(true);
    workspaceRootMenu.hidden = true;
    setStatus(`正在打开章节 · ${location.name}`, "ready");
    try {
      const entries = await storage.readDirectory(location.path);
      const markdownNames = entries
        .filter((entry) => entry.type === "file" && /\.(?:md|markdown)$/i.test(entry.name))
        .map((entry) => entry.name)
        .filter((name) => !/\.(?:working|baseline)\.(?:md|markdown)$/i.test(name))
        .filter((name) => !/\.annotation\.working\.(?:md|markdown)$/i.test(name));
      const exactName = `${location.name}.md`;
      const orderedNames = [...markdownNames].sort((left, right) =>
        Number(right === exactName) - Number(left === exactName)
        || left.localeCompare(right, "zh-CN", { numeric: true }));

      let originalPath = "";
      let originalText = "";
      for (const name of orderedNames) {
        const candidatePath = childPath(location.path, name);
        const text = new TextDecoder("utf-8").decode(await storage.readFile(candidatePath));
        if (name !== exactName && markdownFileKind(text) !== "chapter") continue;
        originalPath = candidatePath;
        originalText = text;
        break;
      }
      if (!originalPath) throw new Error(`章节目录中没有可识别的章节 Markdown：${location.name}`);

      const working = await chapterWorkspace.ensureChapterWorkingCopy({
        workspaceRoot: workingDirectory.path,
        filePath: originalPath,
        originalText,
      });
      const sidecar = await loadChapterSidecarCompat(originalPath, working.workingPath);
      host.onOpenChapter({
        path: originalPath,
        name: originalPath.split("/").pop() ?? location.name,
        originalText,
        workingPath: working.workingPath,
        workingText: working.workingText,
        sidecar,
      });
      host.onActivateCleaningWorkspace();
      setStatus(`已打开章节清洗 · ${location.name} · 标定 ${sidecar.rows.length} 行`, "pass");
    } catch (error) {
      setStatus(errorMessage(error), "fail");
    } finally {
      setBusy(false);
    }
  }

  async function loadChapterSidecarCompat(originalPath: string, workingPath: string): Promise<LoadedChapterSidecar> {
    const loaded = await chapterWorkspace.loadSidecar({
      workspaceRoot: workingDirectory?.path ?? "/",
      filePath: originalPath,
      workingPath,
    });
    if (!loaded.sidecarPath || loaded.rows.length || loaded.annotationPairs.length) return loaded;

    try {
      const raw = new TextDecoder("utf-8").decode(await storage.readFile(loaded.sidecarPath));
      const legacy = candidatesFromSidecar(JSON.parse(raw));
      if (!legacy.rows.length && !legacy.annotationPairs.length) return loaded;
      const sourceLabel = originalPath.replace(/^\//, "");
      return {
        rows: legacy.rows.map((row) => ({
          ...row,
          sourcePath: originalPath,
          workingCopyPath: workingPath,
          sourceLabel,
        })),
        annotationPairs: legacy.annotationPairs.map((pair) => ({ ...pair, sourcePath: originalPath })),
        sidecarPath: loaded.sidecarPath,
      };
    } catch {
      return loaded;
    }
  }

  async function warmWorkingDirectoryStructure(): Promise<void> {
    if (!workingDirectory || !session.isConnected()) return;
    const walk = async (location: DriveLocation, depth: number): Promise<void> => {
      const folders = await childFolders(location);
      if (depth >= 2) return;
      await Promise.all(folders.map((folder) => walk(folder, depth + 1)));
    };
    await walk(workingDirectory, 0);
  }

  function loadWorkingDirectory(): DriveLocation | undefined {
    try {
      const raw = localStorage.getItem(workingDirectoryStorageKey);
      if (!raw) return undefined;
      const parsed = JSON.parse(raw) as Partial<DriveLocation>;
      if (typeof parsed.id !== "string" || typeof parsed.name !== "string" || typeof parsed.path !== "string") return undefined;
      return { id: parsed.id, name: parsed.name, path: parsed.path };
    } catch {
      return undefined;
    }
  }

  function saveWorkingDirectory(location: DriveLocation): void {
    try {
      localStorage.setItem(workingDirectoryStorageKey, JSON.stringify(location));
    } catch {
      // Working-directory persistence is best effort; the active session still keeps the selection.
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
    const folders = currentEntries.filter(isFolder);
    if (!folders.length) {
      renderMessage("当前目录没有子文件夹。可直接将当前目录设为工作目录。");
      return;
    }
    for (const entry of folders) {
      const row = document.createElement("button");
      row.type = "button";
      row.className = "gd-entry";
      row.dataset.entryId = entry.id;
      row.setAttribute("role", "row");

      const icon = document.createElement("span");
      icon.className = "gd-entry-icon";
      icon.textContent = "▸";
      const name = document.createElement("span");
      name.className = "gd-entry-name";
      name.textContent = entry.name;
      const type = document.createElement("span");
      type.className = "gd-entry-type";
      type.textContent = "文件夹";
      row.append(icon, name, type);
      row.addEventListener("click", () => selectEntry(entry));
      row.addEventListener("dblclick", () => {
        selectEntry(entry);
        void openDirectory(entry);
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
    setWorkdirButton.disabled = busy || !connected;
    openButton.disabled = busy || !connected || !selectedEntry;
    renameButton.disabled = busy || !connected || !selectedEntry;
    selectionStatus.textContent = selectedEntry
      ? `文件夹 · ${selectedEntry.name}`
      : connected ? `当前目录 · ${currentEntries.filter(isFolder).length} 个子文件夹` : "未连接";
    renderWorkingDirectoryControl();
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

  async function saveChapterReview(input: {
    filePath: string;
    workingPath: string;
    workingText: string;
    rows: Candidate[];
    annotationPairs: AnnotationPair[];
  }): Promise<{ sidecarPath: string }> {
    if (!session.isConnected()) throw new Error("Google Drive 未连接");
    await storage.writeFile(input.workingPath, new TextEncoder().encode(input.workingText));
    const sidecarPath = await chapterWorkspace.saveSidecar({
      filePath: input.filePath,
      rows: input.rows,
      annotationPairs: input.annotationPairs,
    });
    return { sidecarPath };
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

  return { prepare, refresh, saveChapterReview };
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

function parentPath(targetPath: string): string {
  const normalized = targetPath === "/" ? "/" : targetPath.replace(/\/+$/, "");
  const index = normalized.lastIndexOf("/");
  return index <= 0 ? "/" : normalized.slice(0, index);
}

function displayPath(path: string): string {
  return path === "/" ? "GD /" : `GD ${path}`;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

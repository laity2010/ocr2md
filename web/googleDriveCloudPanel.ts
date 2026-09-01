import { GoogleDriveApiGateway } from "../src/googleDriveApiGateway";
import {
  GOOGLE_DRIVE_FOLDER_MIME_TYPE,
  GoogleDriveWorkspaceError,
  GoogleDriveWorkspaceStorage,
  type GoogleDriveItem,
} from "../src/googleDriveWorkspaceStorage";
import type { WorkspaceDirectoryEntry } from "../src/workspaceStorage";
import { BrowserFetchDriveTransport } from "./googleDriveFetchTransport";
import { GoogleIdentityTokenSession } from "./googleIdentityTokenSession";

export interface GoogleDriveCloudConfig {
  clientId: string;
  /** Optional deployment default. Users can replace it from the browser UI. */
  rootFolderId?: string;
}

export type CloudDriveStatusReporter = (
  text: string,
  kind: "ready" | "pass" | "fail",
) => void;

export interface GoogleDriveOpenedFile {
  path: string;
  name: string;
  text: string;
}

export type CloudDriveFileOpenedHandler = (file: GoogleDriveOpenedFile) => void;
export type CloudDriveFileSavedHandler = (file: GoogleDriveOpenedFile) => void;
export type CloudDriveSaveTextProvider = (path: string) => string | undefined;

const DRIVE_ROOT_ID = "root";
const DRIVE_WORKSPACE_BINDING_KEY = "ocr2md-google-drive-workspace-v1";

interface DriveWorkspaceBinding {
  id: string;
  name: string;
}

interface DriveBrowseLocation {
  id: string;
  name: string;
}

interface DriveConflictState {
  path: string;
  name: string;
}

/**
 * Mounts the Google Drive smoke panel. Directory browsing and file opening are
 * read-only; the only exposed write action is an explicit save of the currently
 * opened file. Delete, move, rename, and folder writes stay unavailable.
 */
export function installGoogleDriveCloudPanel(
  config: GoogleDriveCloudConfig,
  reportStatus: CloudDriveStatusReporter,
  onFileOpened?: CloudDriveFileOpenedHandler,
  getSaveText?: CloudDriveSaveTextProvider,
  onFileSaved?: CloudDriveFileSavedHandler,
): void {
  const session = new GoogleIdentityTokenSession(config.clientId);
  const gateway = new GoogleDriveApiGateway(
    new BrowserFetchDriveTransport(),
    () => session.getAccessToken(),
  );
  let binding = loadWorkspaceBinding() ?? deploymentDefaultBinding(config.rootFolderId);
  let storage = binding ? new GoogleDriveWorkspaceStorage(gateway, binding.id) : undefined;
  let currentDirectory = "/";
  let browseStack: DriveBrowseLocation[] = [{ id: DRIVE_ROOT_ID, name: "我的云端硬盘" }];
  let selectingWorkspace = false;
  let openedFile: Pick<GoogleDriveOpenedFile, "path" | "name"> | undefined;
  let conflictState: DriveConflictState | undefined;

  const panel = element("aside", "cloud-smoke-drive");
  panel.setAttribute("aria-label", "Google Drive connection");
  const header = element("div", "cloud-smoke-drive__header");
  const title = element("strong");
  title.textContent = "Google Drive";
  const connection = element("span", "cloud-smoke-drive__connection");
  connection.textContent = "准备中";
  connection.dataset.connected = "false";
  header.append(title, connection);

  const note = element("p", "cloud-smoke-drive__note");
  note.textContent = "工作目录可从 Google Drive 中直接选择；只允许原位保存当前文件。保存前检查远端版本，检测到外部更新时拒绝覆盖。";

  const actions = element("div", "cloud-smoke-drive__actions");
  const connectButton = button("连接 Google Drive");
  const chooseWorkspaceButton = button(binding ? "更换工作目录" : "选择工作目录");
  const useWorkspaceButton = button("使用此目录");
  const cancelWorkspaceButton = button("取消选择");
  const upButton = button("上级");
  const refreshButton = button("刷新目录");
  const saveButton = button("保存当前文件");
  const disconnectButton = button("断开");
  connectButton.disabled = true;
  chooseWorkspaceButton.disabled = true;
  useWorkspaceButton.hidden = true;
  cancelWorkspaceButton.hidden = true;
  upButton.disabled = true;
  refreshButton.disabled = true;
  saveButton.disabled = true;
  disconnectButton.disabled = true;
  actions.append(connectButton, chooseWorkspaceButton, useWorkspaceButton, cancelWorkspaceButton, upButton, refreshButton, saveButton, disconnectButton);

  const pathLabel = element("div", "cloud-smoke-drive__path");
  pathLabel.textContent = currentDirectory;

  const list = element("ul", "cloud-smoke-drive__list");
  renderMessage(list, "正在准备 Google 登录…");

  const conflictPanel = element("section", "cloud-smoke-drive__conflict");
  conflictPanel.hidden = true;
  const conflictTitle = element("strong");
  conflictTitle.textContent = "版本冲突";
  const conflictMessage = element("p", "cloud-smoke-drive__conflict-message");
  const conflictActions = element("div", "cloud-smoke-drive__actions");
  const viewRemoteButton = button("查看远端版本");
  const viewLocalButton = button("查看当前工作台版本");
  const reloadRemoteButton = button("重新载入远端…");
  const saveConflictCopyButton = button("另存冲突副本");
  conflictActions.append(viewRemoteButton, viewLocalButton, reloadRemoteButton, saveConflictCopyButton);
  conflictPanel.append(conflictTitle, conflictMessage, conflictActions);

  const preview = element("section", "cloud-smoke-drive__preview");
  preview.hidden = true;
  const previewHeader = element("div", "cloud-smoke-drive__preview-header");
  const previewTitle = element("strong");
  const closePreviewButton = button("关闭预览");
  const previewContent = element("pre", "cloud-smoke-drive__preview-content");
  previewHeader.append(previewTitle, closePreviewButton);
  preview.append(previewHeader, previewContent);

  panel.append(header, note, actions, pathLabel, list, conflictPanel, preview);
  document.body.append(panel);

  connectButton.addEventListener("click", () => {
    void connect();
  });
  chooseWorkspaceButton.addEventListener("click", () => {
    void beginWorkspaceSelection();
  });
  useWorkspaceButton.addEventListener("click", () => {
    void bindCurrentBrowseLocation();
  });
  cancelWorkspaceButton.addEventListener("click", () => {
    cancelWorkspaceSelection();
  });
  upButton.addEventListener("click", () => {
    if (selectingWorkspace) {
      if (browseStack.length <= 1) return;
      browseStack.pop();
      void refreshWorkspaceBrowser();
      return;
    }
    if (currentDirectory === "/") return;
    currentDirectory = parentPath(currentDirectory);
    void refreshDirectory();
  });
  refreshButton.addEventListener("click", () => {
    if (selectingWorkspace) void refreshWorkspaceBrowser();
    else void refreshDirectory();
  });
  saveButton.addEventListener("click", () => {
    void saveOpenedFile();
  });
  viewRemoteButton.addEventListener("click", () => {
    void viewConflictRemote();
  });
  viewLocalButton.addEventListener("click", () => {
    viewConflictLocal();
  });
  reloadRemoteButton.addEventListener("click", () => {
    void reloadConflictRemote();
  });
  saveConflictCopyButton.addEventListener("click", () => {
    void saveConflictCopy();
  });
  disconnectButton.addEventListener("click", () => {
    session.disconnect();
    openedFile = undefined;
    clearConflict();
    setConnected(false);
    closePreview();
    renderMessage(list, "已断开。访问令牌已从浏览器内存清除。");
    reportStatus("Google Drive 已断开", "ready");
  });
  closePreviewButton.addEventListener("click", closePreview);

  void session.prepare().then(() => {
    connectButton.disabled = false;
    connection.textContent = "未连接";
    renderMessage(list, "点击“连接 Google Drive”读取同步文件夹。");
  }).catch((error) => {
    connection.textContent = "加载失败";
    renderMessage(list, errorMessage(error));
    reportStatus(errorMessage(error), "fail");
  });

  async function connect(): Promise<void> {
    setBusy(true);
    connection.textContent = "正在登录";
    try {
      await session.connect();
      setConnected(true);
      if (binding) await refreshDirectory();
      else await beginWorkspaceSelection();
    } catch (error) {
      setConnected(false);
      renderMessage(list, errorMessage(error));
      reportStatus(errorMessage(error), "fail");
    } finally {
      setBusy(false);
    }
  }

  async function refreshDirectory(): Promise<void> {
    if (!storage || !binding) {
      await beginWorkspaceSelection();
      return;
    }
    if (!session.isConnected()) {
      setConnected(false);
      renderMessage(list, "登录已失效，请重新连接 Google Drive。");
      return;
    }
    setBusy(true);
    connection.textContent = "正在读取";
    try {
      const entries = await storage.readDirectory(currentDirectory);
      renderEntries(list, entries, openEntry, openDirectory);
      pathLabel.textContent = currentDirectory;
      connection.textContent = "已连接";
      reportStatus(`Google Drive 已读取 · ${binding.name}${currentDirectory === "/" ? "" : currentDirectory} · ${entries.length} 项`, "pass");
    } catch (error) {
      connection.textContent = session.isConnected() ? "读取失败" : "未连接";
      renderMessage(list, errorMessage(error));
      reportStatus(errorMessage(error), "fail");
    } finally {
      setBusy(false);
    }
  }

  async function beginWorkspaceSelection(): Promise<void> {
    if (!session.isConnected()) return;
    selectingWorkspace = true;
    browseStack = [{ id: DRIVE_ROOT_ID, name: "我的云端硬盘" }];
    openedFile = undefined;
    clearConflict();
    closePreview();
    chooseWorkspaceButton.hidden = true;
    useWorkspaceButton.hidden = false;
    cancelWorkspaceButton.hidden = !binding;
    saveButton.disabled = true;
    await refreshWorkspaceBrowser();
  }

  async function refreshWorkspaceBrowser(): Promise<void> {
    if (!session.isConnected()) return;
    setBusy(true);
    connection.textContent = "正在浏览";
    try {
      const current = browseStack[browseStack.length - 1];
      const folders = (await gateway.listChildren(current.id))
        .filter((item) => item.mimeType === GOOGLE_DRIVE_FOLDER_MIME_TYPE)
        .sort((left, right) => left.name.localeCompare(right.name, "zh-CN", { numeric: true }));
      renderDriveFolders(list, folders, async (folder) => {
        browseStack.push({ id: folder.id, name: folder.name });
        await refreshWorkspaceBrowser();
      });
      pathLabel.textContent = `/ ${browseStack.map((item) => item.name).join(" / ")}`;
      connection.textContent = "选择目录";
      reportStatus(`请选择 Google Drive 工作目录 · ${folders.length} 个子文件夹`, "ready");
    } catch (error) {
      connection.textContent = "浏览失败";
      renderMessage(list, errorMessage(error));
      reportStatus(errorMessage(error), "fail");
    } finally {
      setBusy(false);
    }
  }

  async function bindCurrentBrowseLocation(): Promise<void> {
    if (!session.isConnected() || !browseStack.length) return;
    const current = browseStack[browseStack.length - 1];
    binding = { id: current.id, name: current.name };
    saveWorkspaceBinding(binding);
    storage = new GoogleDriveWorkspaceStorage(gateway, binding.id);
    selectingWorkspace = false;
    currentDirectory = "/";
    chooseWorkspaceButton.textContent = "更换工作目录";
    chooseWorkspaceButton.hidden = false;
    useWorkspaceButton.hidden = true;
    cancelWorkspaceButton.hidden = true;
    reportStatus(`Google Drive 工作目录已绑定 · ${binding.name}`, "pass");
    await refreshDirectory();
  }

  function cancelWorkspaceSelection(): void {
    if (!binding) return;
    selectingWorkspace = false;
    chooseWorkspaceButton.hidden = false;
    useWorkspaceButton.hidden = true;
    cancelWorkspaceButton.hidden = true;
    currentDirectory = "/";
    void refreshDirectory();
  }

  async function openDirectory(entry: WorkspaceDirectoryEntry): Promise<void> {
    if (entry.type !== "directory") return;
    currentDirectory = childPath(currentDirectory, entry.name);
    closePreview();
    await refreshDirectory();
  }

  async function openEntry(entry: WorkspaceDirectoryEntry): Promise<void> {
    if (entry.type !== "file") return;
    setBusy(true);
    preview.hidden = false;
    previewTitle.textContent = entry.name;
    previewContent.textContent = "正在读取…";
    try {
      const path = childPath(currentDirectory, entry.name);
      if (!storage) throw new Error("请先选择 Google Drive 工作目录");
      const data = await storage.readFile(path);
      const text = new TextDecoder("utf-8").decode(data);
      openedFile = { path, name: entry.name };
      clearConflict();
      previewContent.textContent = text;
      onFileOpened?.({ path, name: entry.name, text });
      reportStatus(`Google Drive 已读取 · ${entry.name}`, "pass");
    } catch (error) {
      previewContent.textContent = errorMessage(error);
      reportStatus(errorMessage(error), "fail");
    } finally {
      setBusy(false);
    }
  }

  async function saveOpenedFile(): Promise<void> {
    if (!session.isConnected()) {
      setConnected(false);
      reportStatus("登录已失效，请重新连接 Google Drive。", "fail");
      return;
    }
    if (!openedFile) {
      reportStatus("请先打开一个 Google Drive 文件。", "fail");
      return;
    }
    const text = getSaveText?.(openedFile.path);
    if (text === undefined) {
      reportStatus("当前工作台没有可保存的 Drive 文件内容。", "fail");
      return;
    }

    setBusy(true);
    connection.textContent = "正在保存";
    try {
      if (!storage) throw new Error("请先选择 Google Drive 工作目录");
      await storage.writeFile(openedFile.path, new TextEncoder().encode(text));
      const verifiedData = await storage.readFile(openedFile.path);
      const verifiedText = new TextDecoder("utf-8").decode(verifiedData);
      if (verifiedText !== text) throw new Error("Google Drive 保存后回读内容不一致");
      preview.hidden = false;
      previewTitle.textContent = openedFile.name;
      previewContent.textContent = verifiedText;
      clearConflict();
      onFileSaved?.({ ...openedFile, text: verifiedText });
      reportStatus(`Google Drive 已保存并回读验证 · ${openedFile.name}`, "pass");
    } catch (error) {
      if (error instanceof GoogleDriveWorkspaceError && error.code === "ESTALE") {
        showConflict(openedFile);
        reportStatus("保存已停止：Google Drive 文件已在其他位置更新。请使用冲突处理入口查看双方版本、重新载入或另存副本。", "fail");
      } else {
        reportStatus(errorMessage(error), "fail");
      }
    } finally {
      setBusy(false);
    }
  }

  function showConflict(file: Pick<GoogleDriveOpenedFile, "path" | "name">): void {
    conflictState = { path: file.path, name: file.name };
    conflictPanel.hidden = false;
    conflictMessage.textContent = "远端文件已在当前页面打开后发生变化。原文件尚未被当前工作台覆盖。请选择如何处理。";
    refreshConflictControls();
  }

  function clearConflict(): void {
    conflictState = undefined;
    conflictPanel.hidden = true;
    conflictMessage.textContent = "";
    refreshConflictControls();
  }

  function refreshConflictControls(): void {
    const enabled = session.isConnected() && Boolean(conflictState) && panel.dataset.busy !== "true";
    viewRemoteButton.disabled = !enabled;
    viewLocalButton.disabled = !enabled;
    reloadRemoteButton.disabled = !enabled;
    saveConflictCopyButton.disabled = !enabled;
  }

  async function viewConflictRemote(): Promise<void> {
    if (!conflictState || !storage) return;
    setBusy(true);
    try {
      const data = await storage.readFileWithoutBaseline(conflictState.path);
      preview.hidden = false;
      previewTitle.textContent = `远端版本 · ${conflictState.name}`;
      previewContent.textContent = new TextDecoder("utf-8").decode(data);
      reportStatus(`正在查看远端版本 · ${conflictState.name} · 保存基线未改变`, "ready");
    } catch (error) {
      reportStatus(errorMessage(error), "fail");
    } finally {
      setBusy(false);
    }
  }

  function viewConflictLocal(): void {
    if (!conflictState) return;
    const text = getSaveText?.(conflictState.path);
    if (text === undefined) {
      reportStatus("当前工作台内容已不可用，无法预览。", "fail");
      return;
    }
    preview.hidden = false;
    previewTitle.textContent = `当前工作台版本 · ${conflictState.name}`;
    previewContent.textContent = text;
    reportStatus(`正在查看当前工作台版本 · ${conflictState.name}`, "ready");
  }

  async function reloadConflictRemote(): Promise<void> {
    if (!conflictState || !storage) return;
    const state = conflictState;
    const accepted = globalThis.confirm("重新载入远端版本会放弃当前工作台中尚未保存的内容。确定继续吗？");
    if (!accepted) return;
    setBusy(true);
    try {
      const data = await storage.readFile(state.path);
      const text = new TextDecoder("utf-8").decode(data);
      openedFile = { path: state.path, name: state.name };
      preview.hidden = false;
      previewTitle.textContent = state.name;
      previewContent.textContent = text;
      onFileOpened?.({ path: state.path, name: state.name, text });
      clearConflict();
      reportStatus(`已重新载入远端版本 · ${state.name}`, "pass");
    } catch (error) {
      reportStatus(errorMessage(error), "fail");
    } finally {
      setBusy(false);
    }
  }

  async function saveConflictCopy(): Promise<void> {
    if (!conflictState || !storage) return;
    const state = conflictState;
    const text = getSaveText?.(state.path);
    if (text === undefined) {
      reportStatus("当前工作台内容已不可用，无法另存冲突副本。", "fail");
      return;
    }
    setBusy(true);
    try {
      const copyPath = await writeUniqueConflictCopy(storage, state.path, new TextEncoder().encode(text));
      conflictMessage.textContent = `当前工作台版本已另存为 ${fileName(copyPath)}。远端原文件仍保持不变；你可以继续查看双方版本或重新载入远端。`;
      if (parentPath(copyPath) === currentDirectory) await refreshDirectory();
      reportStatus(`冲突副本已保存 · ${copyPath}`, "pass");
    } catch (error) {
      reportStatus(errorMessage(error), "fail");
    } finally {
      setBusy(false);
    }
  }

  function closePreview(): void {
    preview.hidden = true;
    previewTitle.textContent = "";
    previewContent.textContent = "";
  }

  function setConnected(connected: boolean): void {
    connection.dataset.connected = String(connected);
    connection.textContent = connected ? "已连接" : "未连接";
    connectButton.disabled = connected;
    chooseWorkspaceButton.disabled = !connected;
    upButton.disabled = !connected || (selectingWorkspace ? browseStack.length <= 1 : currentDirectory === "/");
    refreshButton.disabled = !connected;
    saveButton.disabled = !connected || !openedFile || !getSaveText || Boolean(conflictState);
    disconnectButton.disabled = !connected;
    refreshConflictControls();
  }

  function setBusy(busy: boolean): void {
    panel.dataset.busy = String(busy);
    if (busy) {
      connectButton.disabled = true;
      chooseWorkspaceButton.disabled = true;
      useWorkspaceButton.disabled = true;
      cancelWorkspaceButton.disabled = true;
      upButton.disabled = true;
      refreshButton.disabled = true;
      saveButton.disabled = true;
      disconnectButton.disabled = true;
      viewRemoteButton.disabled = true;
      viewLocalButton.disabled = true;
      reloadRemoteButton.disabled = true;
      saveConflictCopyButton.disabled = true;
      return;
    }
    useWorkspaceButton.disabled = false;
    cancelWorkspaceButton.disabled = false;
    setConnected(session.isConnected());
  }
}

function deploymentDefaultBinding(rootFolderId: string | undefined): DriveWorkspaceBinding | undefined {
  const id = rootFolderId?.trim();
  return id ? { id, name: "默认工作目录" } : undefined;
}

function loadWorkspaceBinding(): DriveWorkspaceBinding | undefined {
  try {
    const raw = localStorage.getItem(DRIVE_WORKSPACE_BINDING_KEY);
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as Partial<DriveWorkspaceBinding>;
    if (typeof parsed.id !== "string" || !parsed.id.trim()) return undefined;
    return { id: parsed.id, name: typeof parsed.name === "string" && parsed.name.trim() ? parsed.name : "已绑定目录" };
  } catch {
    return undefined;
  }
}

function saveWorkspaceBinding(binding: DriveWorkspaceBinding): void {
  localStorage.setItem(DRIVE_WORKSPACE_BINDING_KEY, JSON.stringify(binding));
}

function renderDriveFolders(
  list: HTMLUListElement,
  folders: GoogleDriveItem[],
  openFolder: (folder: GoogleDriveItem) => Promise<void>,
): void {
  list.replaceChildren();
  if (!folders.length) {
    renderMessage(list, "当前目录没有子文件夹。可以直接使用此目录。");
    return;
  }
  for (const folder of folders) {
    const item = element("li", "cloud-smoke-drive__item");
    const icon = element("span", "cloud-smoke-drive__icon");
    icon.textContent = "📁";
    const name = button(folder.name);
    name.className = "cloud-smoke-drive__file";
    name.addEventListener("click", () => { void openFolder(folder); });
    item.append(icon, name);
    list.append(item);
  }
}

function renderEntries(
  list: HTMLUListElement,
  entries: WorkspaceDirectoryEntry[],
  openEntry: (entry: WorkspaceDirectoryEntry) => Promise<void>,
  openDirectory: (entry: WorkspaceDirectoryEntry) => Promise<void>,
): void {
  list.replaceChildren();
  if (!entries.length) {
    renderMessage(list, "同步文件夹为空，或当前应用尚未获准访问其中的文件。");
    return;
  }
  for (const entry of entries) {
    const item = element("li", "cloud-smoke-drive__item");
    const icon = element("span", "cloud-smoke-drive__icon");
    icon.textContent = entry.type === "directory" ? "📁" : "📄";
    item.append(icon);
    if (entry.type === "file") {
      const name = button(entry.name);
      name.className = "cloud-smoke-drive__file";
      name.addEventListener("click", () => {
        void openEntry(entry);
      });
      item.append(name);
    } else if (entry.type === "directory") {
      const name = button(entry.name);
      name.className = "cloud-smoke-drive__file";
      name.addEventListener("click", () => {
        void openDirectory(entry);
      });
      item.append(name);
    } else {
      const name = element("span");
      name.textContent = entry.name;
      item.append(name);
    }
    list.append(item);
  }
}

function renderMessage(list: HTMLUListElement, message: string): void {
  const item = element("li", "cloud-smoke-drive__message");
  item.textContent = message;
  list.replaceChildren(item);
}

function button(label: string): HTMLButtonElement {
  const node = document.createElement("button");
  node.type = "button";
  node.textContent = label;
  return node;
}

function element<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  return node;
}

async function writeUniqueConflictCopy(
  storage: GoogleDriveWorkspaceStorage,
  sourcePath: string,
  data: Uint8Array,
): Promise<string> {
  const directory = parentPath(sourcePath);
  const name = fileName(sourcePath);
  const dot = name.lastIndexOf(".");
  const stem = dot > 0 ? name.slice(0, dot) : name;
  const extension = dot > 0 ? name.slice(dot) : "";
  const stamp = timestampForFileName(new Date());
  for (let sequence = 1; sequence <= 99; sequence += 1) {
    const suffix = sequence === 1 ? "" : `-${sequence}`;
    const candidate = childPath(directory, `${stem}.conflict-${stamp}${suffix}${extension}`);
    try {
      await storage.createFileExclusive(candidate, data);
      return candidate;
    } catch (error) {
      if (error instanceof GoogleDriveWorkspaceError && error.code === "EEXIST") continue;
      throw error;
    }
  }
  throw new Error("无法生成唯一的冲突副本文件名");
}

function timestampForFileName(date: Date): string {
  const part = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}${part(date.getMonth() + 1)}${part(date.getDate())}-${part(date.getHours())}${part(date.getMinutes())}${part(date.getSeconds())}`;
}

function fileName(targetPath: string): string {
  const normalized = targetPath.replace(/\/+$/, "");
  return normalized.slice(normalized.lastIndexOf("/") + 1);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function childPath(parent: string, name: string): string {
  const cleanParent = parent === "/" ? "" : parent.replace(/\/$/, "");
  return `${cleanParent}/${name}`.replace(/\/{2,}/g, "/");
}

function parentPath(target: string): string {
  const normalized = target.replace(/\/+$/, "");
  const slash = normalized.lastIndexOf("/");
  return slash <= 0 ? "/" : normalized.slice(0, slash);
}

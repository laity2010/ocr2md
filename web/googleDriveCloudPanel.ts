import { GoogleDriveApiGateway } from "../src/googleDriveApiGateway";
import { GoogleDriveWorkspaceStorage } from "../src/googleDriveWorkspaceStorage";
import type { WorkspaceDirectoryEntry } from "../src/workspaceStorage";
import { BrowserFetchDriveTransport } from "./googleDriveFetchTransport";
import { GoogleIdentityTokenSession } from "./googleIdentityTokenSession";

export interface GoogleDriveCloudConfig {
  clientId: string;
  rootFolderId: string;
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
  const storage = new GoogleDriveWorkspaceStorage(gateway, config.rootFolderId);
  let openedFile: Pick<GoogleDriveOpenedFile, "path" | "name"> | undefined;

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
  note.textContent = "受控写入验证：只允许原位保存当前文件；不会删除、移动或重命名。";

  const actions = element("div", "cloud-smoke-drive__actions");
  const connectButton = button("连接 Google Drive");
  const refreshButton = button("刷新目录");
  const saveButton = button("保存当前文件");
  const disconnectButton = button("断开");
  connectButton.disabled = true;
  refreshButton.disabled = true;
  saveButton.disabled = true;
  disconnectButton.disabled = true;
  actions.append(connectButton, refreshButton, saveButton, disconnectButton);

  const list = element("ul", "cloud-smoke-drive__list");
  renderMessage(list, "正在准备 Google 登录…");

  const preview = element("section", "cloud-smoke-drive__preview");
  preview.hidden = true;
  const previewHeader = element("div", "cloud-smoke-drive__preview-header");
  const previewTitle = element("strong");
  const closePreviewButton = button("关闭预览");
  const previewContent = element("pre", "cloud-smoke-drive__preview-content");
  previewHeader.append(previewTitle, closePreviewButton);
  preview.append(previewHeader, previewContent);

  panel.append(header, note, actions, list, preview);
  document.body.append(panel);

  connectButton.addEventListener("click", () => {
    void connect();
  });
  refreshButton.addEventListener("click", () => {
    void refreshDirectory();
  });
  saveButton.addEventListener("click", () => {
    void saveOpenedFile();
  });
  disconnectButton.addEventListener("click", () => {
    session.disconnect();
    openedFile = undefined;
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
      await refreshDirectory();
    } catch (error) {
      setConnected(false);
      renderMessage(list, errorMessage(error));
      reportStatus(errorMessage(error), "fail");
    } finally {
      setBusy(false);
    }
  }

  async function refreshDirectory(): Promise<void> {
    if (!session.isConnected()) {
      setConnected(false);
      renderMessage(list, "登录已失效，请重新连接 Google Drive。");
      return;
    }
    setBusy(true);
    connection.textContent = "正在读取";
    try {
      const entries = await storage.readDirectory("/");
      renderEntries(list, entries, openEntry);
      connection.textContent = "已连接";
      reportStatus(`Google Drive 已读取 · ${entries.length} 项`, "pass");
    } catch (error) {
      connection.textContent = session.isConnected() ? "读取失败" : "未连接";
      renderMessage(list, errorMessage(error));
      reportStatus(errorMessage(error), "fail");
    } finally {
      setBusy(false);
    }
  }

  async function openEntry(entry: WorkspaceDirectoryEntry): Promise<void> {
    if (entry.type !== "file") return;
    setBusy(true);
    preview.hidden = false;
    previewTitle.textContent = entry.name;
    previewContent.textContent = "正在读取…";
    try {
      const path = `/${entry.name}`;
      const data = await storage.readFile(path);
      const text = new TextDecoder("utf-8").decode(data);
      openedFile = { path, name: entry.name };
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
      await storage.writeFile(openedFile.path, new TextEncoder().encode(text));
      const verifiedData = await storage.readFile(openedFile.path);
      const verifiedText = new TextDecoder("utf-8").decode(verifiedData);
      if (verifiedText !== text) throw new Error("Google Drive 保存后回读内容不一致");
      preview.hidden = false;
      previewTitle.textContent = openedFile.name;
      previewContent.textContent = verifiedText;
      onFileSaved?.({ ...openedFile, text: verifiedText });
      reportStatus(`Google Drive 已保存并回读验证 · ${openedFile.name}`, "pass");
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
    refreshButton.disabled = !connected;
    saveButton.disabled = !connected || !openedFile || !getSaveText;
    disconnectButton.disabled = !connected;
  }

  function setBusy(busy: boolean): void {
    panel.dataset.busy = String(busy);
    if (busy) {
      connectButton.disabled = true;
      refreshButton.disabled = true;
      saveButton.disabled = true;
      disconnectButton.disabled = true;
      return;
    }
    setConnected(session.isConnected());
  }
}

function renderEntries(
  list: HTMLUListElement,
  entries: WorkspaceDirectoryEntry[],
  openEntry: (entry: WorkspaceDirectoryEntry) => Promise<void>,
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

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

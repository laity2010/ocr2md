import { GoogleDriveApiGateway } from "../../src/googleDriveApiGateway";
import { mergeSequenceMarkdown } from "../../src/chapterBoundary";
import {
  GOOGLE_DRIVE_FOLDER_MIME_TYPE,
  type GoogleDriveItem,
} from "../../src/googleDriveWorkspaceStorage";
import { markdownFileKind } from "../../src/workspaceFiles";
import { BrowserFetchDriveTransport } from "../../web/googleDriveFetchTransport";
import { GoogleIdentityTokenSession } from "../../web/googleIdentityTokenSession";
import type { GoogleDriveWorkspaceOpenedFile } from "./googleDriveWorkspace";

const GOOGLE_DRIVE_FILE_SCOPE = "https://www.googleapis.com/auth/drive.file";
const FILE_CACHE_LIMIT = 12;

type StatusKind = "ready" | "pass" | "fail";
type FileExplorerEntry = {
  id: string;
  name: string;
  type: "folder" | "file";
  hash: string;
  size?: number;
  tooltip?: string;
  driveItem?: GoogleDriveItem;
};

type FileExplorerPathItem = [string, string, Record<string, unknown>?];

type FileExplorerFolder = {
  GetPath(): FileExplorerPathItem[];
  GetPathIDs(): string[];
  SetEntries(entries: FileExplorerEntry[]): void;
};

type FileExplorerInstance = {
  RefreshFolders(forceCurrentFolder?: boolean): void;
  SetSelectedItems(ids: string[], keepPrevious?: boolean, skipUiUpdate?: boolean): void;
  OpenSelectedItems(): void;
  GetCurrentFolder(): FileExplorerFolder;
  Destroy(): void;
};

type FileExplorerConstructor = new (
  host: HTMLElement,
  options: {
    initpath: FileExplorerPathItem[];
    capturebrowser?: boolean;
    tools?: Record<string, boolean>;
    onrefresh?: (this: FileExplorerInstance, folder: FileExplorerFolder, required: boolean) => void;
    onopenfile?: (this: FileExplorerInstance, folder: FileExplorerFolder, entry: FileExplorerEntry) => void;
    onselchanged?: (this: FileExplorerInstance, folder: FileExplorerFolder, selectedItems: unknown, count: number) => void;
    onnewfolder?: (created: (entryOrError: FileExplorerEntry | string | false) => void, folder: FileExplorerFolder) => void;
    onrename?: (
      renamed: (entryOrError: FileExplorerEntry | string | false) => void,
      folder: FileExplorerFolder,
      entry: FileExplorerEntry,
      newName: string,
    ) => void;
    ondelete?: (
      deleted: (successOrError: true | string | false) => void,
      folder: FileExplorerFolder,
      ids: string[],
      entries: FileExplorerEntry[],
      recycle: boolean,
    ) => void;
    oncopy?: (
      copied: (successOrError: true | string | false, entries?: FileExplorerEntry[]) => void,
      sourcePath: FileExplorerPathItem[],
      sourceIds: string[],
      destinationFolder: FileExplorerFolder,
    ) => void;
  },
) => FileExplorerInstance;

type FileExplorerWindow = Window & { FileExplorer?: FileExplorerConstructor };

export interface GoogleDriveFileExplorerSpikeConfig {
  clientId: string;
  rootFolderId: string;
}

export interface GoogleDriveFileExplorerSpikeHost {
  onOpenFile(file: GoogleDriveWorkspaceOpenedFile): void;
  onOpenBoundary(file: GoogleDriveWorkspaceOpenedFile): void;
  onActivateCleaningWorkspace(): void;
}

export interface GoogleDriveFileExplorerSpikeController {
  activate(): Promise<void>;
}

export function installGoogleDriveFileExplorerSpike(
  config: GoogleDriveFileExplorerSpikeConfig,
  host: GoogleDriveFileExplorerSpikeHost,
): GoogleDriveFileExplorerSpikeController {
  const explorerHost = requiredElement<HTMLElement>("#gd-jsfe-host");
  const connectButton = requiredElement<HTMLButtonElement>("#gd-jsfe-connect");
  const disconnectButton = requiredElement<HTMLButtonElement>("#gd-jsfe-disconnect");
  const status = requiredElement<HTMLElement>("#gd-jsfe-status");
  const selection = requiredElement<HTMLElement>("#gd-jsfe-selection");

  let session: GoogleIdentityTokenSession | undefined;
  let gateway: GoogleDriveApiGateway | undefined;
  let explorer: FileExplorerInstance | undefined;
  let prepared = false;
  let busy = false;
  const directoryCache = new Map<string, GoogleDriveItem[]>();
  const fileCache = new Map<string, { version: string; text: string }>();

  connectButton.disabled = true;
  disconnectButton.disabled = true;
  connectButton.addEventListener("click", () => { void connect(false); });
  disconnectButton.addEventListener("click", disconnect);

  async function activate(): Promise<void> {
    if (!prepared) await prepare();
  }

  async function prepare(): Promise<void> {
    prepared = true;
    const FileExplorer = (window as FileExplorerWindow).FileExplorer;
    if (!FileExplorer) {
      setStatus("js-fileexplorer 脚本未加载", "fail");
      return;
    }

    session = new GoogleIdentityTokenSession(config.clientId, GOOGLE_DRIVE_FILE_SCOPE);
    gateway = new GoogleDriveApiGateway(
      new BrowserFetchDriveTransport(),
      () => requireSession().getAccessToken(),
    );

    setStatus("正在准备 js-fileexplorer…", "ready");
    try {
      await session.prepare();
      if (session.isConnected()) {
        createExplorer(FileExplorer);
        refreshControls();
        setStatus("Google Drive 会话已恢复 · JSFE", "pass");
        return;
      }
      if (session.hasPriorAuthorization()) {
        const connected = await connect(true);
        if (connected) {
          createExplorer(FileExplorer);
          return;
        }
        connectButton.disabled = false;
        setStatus("JSFE 已就绪 · 点击连接 Google Drive", "ready");
      } else {
        connectButton.disabled = false;
        setStatus("JSFE 已就绪 · 点击连接 Google Drive", "ready");
      }
    } catch (error) {
      connectButton.disabled = false;
      setStatus(errorMessage(error), "fail");
    }
  }

  function createExplorer(FileExplorer: FileExplorerConstructor): void {
    if (explorer) return;
    explorer = new FileExplorer(explorerHost, {
      capturebrowser: false,
      initpath: [[config.rootFolderId, "GD", { canmodify: true }]],
      tools: { item_checkboxes: true },
      onrefresh(folder, required) {
        void refreshFolder(folder, required);
      },
      onopenfile(folder, entry) {
        void openFile(folder, entry);
      },
      onselchanged(_folder, _selectedItems, count) {
        selection.textContent = count ? `已选 ${count}` : "";
      },
      onnewfolder(created, folder) {
        void createFolder(folder, created);
      },
      onrename(renamed, folder, entry, newName) {
        void renameEntry(folder, entry, newName, renamed);
      },
      ondelete(deleted, folder, ids, entries) {
        void deleteEntries(folder, ids, entries, deleted);
      },
      oncopy(copied, sourcePath, sourceIds, destinationFolder) {
        void copyEntries(sourcePath, sourceIds, destinationFolder, copied);
      },
    });
    explorerHost.addEventListener("click", openFolderFromIconClick);
  }

  function openFolderFromIconClick(event: MouseEvent): void {
    void handleFolderIconClick(event);
  }

  async function handleFolderIconClick(event: MouseEvent): Promise<void> {
    if (!explorer || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const target = event.target;
    if (!(target instanceof Element)) return;
    const folderIcon = target.closest(".fe_fileexplorer_item_icon_folder");
    if (!folderIcon || !explorerHost.contains(folderIcon)) return;
    const itemNode = folderIcon.closest<HTMLElement>(".fe_fileexplorer_item_wrap");
    const id = itemNode?.dataset.feid;
    if (!id) return;

    const currentFolder = explorer.GetCurrentFolder();
    const parentId = currentFolderId(currentFolder);
    const entry = (directoryCache.get(parentId) ?? []).find((candidate) => candidate.id === id);
    if (!entry || entry.mimeType !== GOOGLE_DRIVE_FOLDER_MIME_TYPE) return;

    const currentPath = currentFolder.GetPath();
    const parentName = currentPath[currentPath.length - 1]?.[1] ?? "";
    if (entry.name.toLowerCase() === "ocr") {
      await openOcrBoundaryFolder(currentFolder, entry);
      return;
    }
    if (parentName.toLowerCase() === "chapters") {
      await openChapterDirectory(currentFolder, entry);
      return;
    }

    explorer.SetSelectedItems([id]);
    explorer.OpenSelectedItems();
  }

  async function openOcrBoundaryFolder(parentFolder: FileExplorerFolder, ocrFolder: GoogleDriveItem): Promise<void> {
    if (!gateway || !session?.isConnected()) {
      setStatus("请先连接 Google Drive", "fail");
      return;
    }
    setStatus(`正在合并 OCR · ${ocrFolder.name}`, "ready");
    try {
      const children = await getFolderItems(ocrFolder.id);
      const markdownItems = children.filter((item) =>
        item.mimeType !== GOOGLE_DRIVE_FOLDER_MIME_TYPE && /\.(?:md|markdown)$/i.test(item.name));
      const inputs = (await Promise.all(markdownItems.map(async (item) => {
        const data = await gateway!.downloadFile(item.id);
        const text = new TextDecoder("utf-8").decode(data);
        return { path: item.name, text };
      }))).filter((input) => markdownFileKind(input.text) === "ocr");
      if (!inputs.length) {
        setStatus("ocr 目录中没有未完成章节定界的 Markdown", "fail");
        return;
      }
      const merged = mergeSequenceMarkdown(inputs);
      const projectPath = folderPath(parentFolder);
      const workingPath = `${projectPath}/.ocr2md-merged.working.md`.replace(/\/{2,}/g, "/");
      host.onOpenBoundary({
        path: workingPath,
        name: ".ocr2md-merged.working.md",
        text: merged,
      });
      host.onActivateCleaningWorkspace();
      setStatus(`章节定界 · 已合并 ${inputs.length} 个 OCR Markdown`, "pass");
    } catch (error) {
      setStatus(errorMessage(error), "fail");
    }
  }

  async function openChapterDirectory(parentFolder: FileExplorerFolder, chapterFolder: GoogleDriveItem): Promise<void> {
    if (!gateway || !session?.isConnected()) {
      setStatus("请先连接 Google Drive", "fail");
      return;
    }
    setStatus(`正在打开章节 · ${chapterFolder.name}`, "ready");
    try {
      const children = await getFolderItems(chapterFolder.id);
      const markdownItems = children.filter((item) =>
        item.mimeType !== GOOGLE_DRIVE_FOLDER_MIME_TYPE
        && /\.(?:md|markdown)$/i.test(item.name)
        && !/\.working\.(?:md|markdown)$/i.test(item.name));
      const exactName = `${chapterFolder.name}.md`;
      const ordered = [...markdownItems].sort((left, right) =>
        Number(right.name === exactName) - Number(left.name === exactName));
      let opened: GoogleDriveWorkspaceOpenedFile | undefined;
      for (const item of ordered) {
        const data = await gateway.downloadFile(item.id);
        const text = new TextDecoder("utf-8").decode(data);
        if (item.name !== exactName && markdownFileKind(text) !== "chapter") continue;
        opened = {
          path: `${folderPath(parentFolder)}/${chapterFolder.name}/${item.name}`.replace(/\/{2,}/g, "/"),
          name: item.name,
          text,
        };
        break;
      }
      if (!opened) {
        setStatus(`章节目录中没有可识别的章节 Markdown · ${chapterFolder.name}`, "fail");
        return;
      }
      host.onOpenFile(opened);
      host.onActivateCleaningWorkspace();
      setStatus(`已打开章节清洗 · ${opened.name}`, "pass");
    } catch (error) {
      setStatus(errorMessage(error), "fail");
    }
  }

  async function connect(silent: boolean): Promise<boolean> {
    if (busy || !session) return false;
    setBusy(true);
    setStatus(silent ? "正在自动恢复 Google Drive…" : "正在连接 Google Drive…", "ready");
    try {
      await session.connect();
      directoryCache.clear();
      fileCache.clear();
      const FileExplorer = (window as FileExplorerWindow).FileExplorer;
      if (!explorer && FileExplorer) createExplorer(FileExplorer);
      else explorer?.RefreshFolders(true);
      setStatus(silent ? "Google Drive 已自动连接 · JSFE" : "Google Drive 已连接 · JSFE", "pass");
      return true;
    } catch (error) {
      if (silent) {
        setStatus("自动连接未成功 · 点击连接", "ready");
      } else {
        setStatus(errorMessage(error), "fail");
      }
      return false;
    } finally {
      setBusy(false);
    }
  }

  function disconnect(): void {
    session?.disconnect();
    directoryCache.clear();
    fileCache.clear();
    selection.textContent = "";
    explorer?.RefreshFolders(true);
    setStatus("Google Drive 已断开", "ready");
    refreshControls();
  }

  async function refreshFolder(folder: FileExplorerFolder, required: boolean): Promise<void> {
    if (!session?.isConnected() || !gateway) {
      return;
    }
    const ids = folder.GetPathIDs();
    const folderId = ids[ids.length - 1] || config.rootFolderId;
    const cached = directoryCache.get(folderId);
    if (!required && cached) {
      folder.SetEntries(cached.map(toExplorerEntry));
      return;
    }

    const started = performance.now();
    try {
      const items = await gateway.listChildren(folderId);
      directoryCache.set(folderId, items);
      folder.SetEntries(items.map(toExplorerEntry));
      const elapsed = Math.max(0, Math.round(performance.now() - started));
      setStatus(`JSFE 远端目录 · ${items.length} 项 · ${elapsed} ms`, "pass");
    } catch (error) {
      if (required) folder.SetEntries([]);
      setStatus(errorMessage(error), "fail");
    }
  }

  async function createFolder(
    folder: FileExplorerFolder,
    created: (entryOrError: FileExplorerEntry | string | false) => void,
  ): Promise<void> {
    if (!session?.isConnected() || !gateway) {
      created("请先连接 Google Drive");
      return;
    }
    const folderId = currentFolderId(folder);
    const existing = directoryCache.get(folderId) ?? [];
    const name = uniqueNewFolderName(existing);
    setStatus(`正在新建文件夹 · ${name}`, "ready");
    try {
      const item = await gateway.createFolder(name, folderId);
      directoryCache.set(folderId, [...existing, item]);
      created(toExplorerEntry(item));
      setStatus(`已新建文件夹 · ${name}`, "pass");
    } catch (error) {
      const message = errorMessage(error);
      created(message);
      setStatus(message, "fail");
    }
  }

  async function renameEntry(
    folder: FileExplorerFolder,
    entry: FileExplorerEntry,
    newName: string,
    renamed: (entryOrError: FileExplorerEntry | string | false) => void,
  ): Promise<void> {
    if (!session?.isConnected() || !gateway) {
      renamed("请先连接 Google Drive");
      return;
    }
    const cleanName = newName.trim();
    if (!cleanName || cleanName.includes("/")) {
      renamed("名称不能为空，也不能包含 /");
      return;
    }
    const folderId = currentFolderId(folder);
    const siblings = directoryCache.get(folderId) ?? [];
    if (siblings.some((item) => item.id !== entry.id && item.name === cleanName)) {
      renamed(`同名项目已存在：${cleanName}`);
      return;
    }

    setStatus(`正在重命名 · ${entry.name} → ${cleanName}`, "ready");
    try {
      const item = await gateway.renameItem(entry.id, cleanName);
      directoryCache.set(folderId, siblings.map((candidate) => candidate.id === item.id ? item : candidate));
      renamed(toExplorerEntry(item));
      setStatus(`已重命名 · ${entry.name} → ${cleanName}`, "pass");
    } catch (error) {
      const message = errorMessage(error);
      renamed(message);
      setStatus(message, "fail");
    }
  }

  async function deleteEntries(
    folder: FileExplorerFolder,
    ids: string[],
    entries: FileExplorerEntry[],
    deleted: (successOrError: true | string | false) => void,
  ): Promise<void> {
    if (!session?.isConnected() || !gateway) {
      deleted("请先连接 Google Drive");
      return;
    }
    if (!ids.length) {
      deleted(false);
      return;
    }
    const names = entries.map((entry) => entry.name).join("、");
    const accepted = globalThis.confirm(`移到 Google Drive 垃圾桶？\n\n${names}`);
    if (!accepted) {
      deleted(false);
      return;
    }

    const folderId = currentFolderId(folder);
    setStatus(`正在删除 · ${ids.length} 项`, "ready");
    try {
      await Promise.all(ids.map((id) => gateway!.trashItem(id)));
      const idSet = new Set(ids);
      const cached = directoryCache.get(folderId) ?? [];
      directoryCache.set(folderId, cached.filter((item) => !idSet.has(item.id)));
      for (const id of ids) fileCache.delete(id);
      deleted(true);
      setStatus(`已移到垃圾桶 · ${ids.length} 项`, "pass");
    } catch (error) {
      const message = errorMessage(error);
      deleted(message);
      setStatus(message, "fail");
    }
  }

  async function copyEntries(
    sourcePath: FileExplorerPathItem[],
    sourceIds: string[],
    destinationFolder: FileExplorerFolder,
    copied: (successOrError: true | string | false, entries?: FileExplorerEntry[]) => void,
  ): Promise<void> {
    if (!session?.isConnected() || !gateway) {
      copied("请先连接 Google Drive");
      return;
    }
    if (!sourceIds.length) {
      copied(false);
      return;
    }

    const drive = gateway;
    const sourceFolderId = sourcePath[sourcePath.length - 1]?.[0] || config.rootFolderId;
    const destinationFolderId = currentFolderId(destinationFolder);
    setStatus(`正在复制 · ${sourceIds.length} 项`, "ready");

    try {
      const [sourceItems, destinationItems] = await Promise.all([
        getFolderItems(sourceFolderId),
        getFolderItems(destinationFolderId),
      ]);
      const sourceById = new Map(sourceItems.map((item) => [item.id, item]));
      const selected = sourceIds.map((id) => sourceById.get(id)).filter((item): item is GoogleDriveItem => Boolean(item));
      if (selected.length !== sourceIds.length) {
        throw new Error("部分复制源已不在当前 Google Drive 目录，请刷新后重试");
      }

      const usedNames = new Set(destinationItems.map((item) => item.name));
      const topLevelCopies: GoogleDriveItem[] = [];
      for (const item of selected) {
        const copiedItem = await copyDriveItemRecursive(drive, item, destinationFolderId, usedNames);
        topLevelCopies.push(copiedItem);
        usedNames.add(copiedItem.name);
      }

      directoryCache.set(destinationFolderId, [...destinationItems, ...topLevelCopies]);
      copied(true, topLevelCopies.map(toExplorerEntry));
      setStatus(`复制完成 · ${topLevelCopies.length} 项`, "pass");
    } catch (error) {
      const message = errorMessage(error);
      copied(message);
      setStatus(message, "fail");
    }
  }

  async function getFolderItems(folderId: string): Promise<GoogleDriveItem[]> {
    const cached = directoryCache.get(folderId);
    if (cached) return cached;
    if (!gateway) throw new Error("Google Drive gateway is not ready");
    const items = await gateway.listChildren(folderId);
    directoryCache.set(folderId, items);
    return items;
  }

  async function copyDriveItemRecursive(
    drive: GoogleDriveApiGateway,
    item: GoogleDriveItem,
    destinationFolderId: string,
    usedNames: Set<string>,
  ): Promise<GoogleDriveItem> {
    const targetName = uniqueCopyName(item.name, usedNames);
    if (item.mimeType !== GOOGLE_DRIVE_FOLDER_MIME_TYPE) {
      return drive.copyFile(item.id, targetName, destinationFolderId);
    }

    const newFolder = await drive.createFolder(targetName, destinationFolderId);
    const sourceChildren = await getFolderItems(item.id);
    const childNames = new Set<string>();
    const copiedChildren: GoogleDriveItem[] = [];
    for (const child of sourceChildren) {
      const copiedChild = await copyDriveItemRecursive(drive, child, newFolder.id, childNames);
      copiedChildren.push(copiedChild);
      childNames.add(copiedChild.name);
    }
    directoryCache.set(newFolder.id, copiedChildren);
    return newFolder;
  }

  async function openFile(folder: FileExplorerFolder, entry: FileExplorerEntry): Promise<void> {
    if (!session?.isConnected() || !gateway) {
      setStatus("请先连接 Google Drive", "fail");
      return;
    }
    if (!/\.(?:md|markdown)$/i.test(entry.name)) {
      setStatus("当前只把 Markdown 打开到清洗工作区", "fail");
      return;
    }

    const item = entry.driveItem;
    if (!item) {
      setStatus("JSFE 条目缺少 Drive 元数据", "fail");
      return;
    }
    const version = driveVersion(item);
    const cached = fileCache.get(item.id);
    const started = performance.now();
    setStatus(cached?.version === version ? `正在从缓存打开 · ${entry.name}` : `正在下载 · ${entry.name}`, "ready");
    try {
      let text: string;
      let cacheHit = false;
      if (cached?.version === version) {
        text = cached.text;
        cacheHit = true;
        touchFileCache(item.id, cached);
      } else {
        const data = await gateway.downloadFile(item.id);
        text = new TextDecoder("utf-8").decode(data);
        touchFileCache(item.id, { version, text });
      }
      const path = `${folderPath(folder)}/${entry.name}`.replace(/\/{2,}/g, "/");
      host.onOpenFile({ path, name: entry.name, text });
      host.onActivateCleaningWorkspace();
      const elapsed = Math.max(0, Math.round(performance.now() - started));
      setStatus(`已打开 · ${entry.name} · ${cacheHit ? "缓存" : "远端"} · ${elapsed} ms`, "pass");
    } catch (error) {
      setStatus(errorMessage(error), "fail");
    }
  }

  function folderPath(folder: FileExplorerFolder): string {
    const names = folder.GetPath().slice(1).map((part) => part[1]).filter(Boolean);
    return `/${names.join("/")}`.replace(/\/{2,}/g, "/");
  }

  function currentFolderId(folder: FileExplorerFolder): string {
    const ids = folder.GetPathIDs();
    return ids[ids.length - 1] || config.rootFolderId;
  }

  function setBusy(nextBusy: boolean): void {
    busy = nextBusy;
    refreshControls();
  }

  function refreshControls(): void {
    const connected = Boolean(session?.isConnected());
    connectButton.disabled = busy || connected || !session;
    disconnectButton.disabled = busy || !connected;
  }

  function setStatus(text: string, kind: StatusKind): void {
    status.textContent = text;
    status.dataset.kind = kind;
  }

  function requireSession(): GoogleIdentityTokenSession {
    if (!session) throw new Error("Google Drive session is not ready");
    return session;
  }

  function touchFileCache(fileId: string, cached: { version: string; text: string }): void {
    fileCache.delete(fileId);
    fileCache.set(fileId, cached);
    while (fileCache.size > FILE_CACHE_LIMIT) {
      const oldest = fileCache.keys().next().value as string | undefined;
      if (!oldest) break;
      fileCache.delete(oldest);
    }
  }

  return { activate };
}

function toExplorerEntry(item: GoogleDriveItem): FileExplorerEntry {
  const folder = item.mimeType === GOOGLE_DRIVE_FOLDER_MIME_TYPE;
  return {
    id: item.id,
    name: item.name,
    type: folder ? "folder" : "file",
    hash: driveVersion(item) || item.id,
    ...(item.size ? { size: Number(item.size) } : {}),
    ...(item.modifiedTime ? { tooltip: `修改时间: ${item.modifiedTime}` } : {}),
    driveItem: item,
  };
}

function uniqueNewFolderName(items: GoogleDriveItem[]): string {
  const names = new Set(items.map((item) => item.name));
  if (!names.has("新建文件夹")) return "新建文件夹";
  for (let index = 2; index < 1000; index += 1) {
    const candidate = `新建文件夹 ${index}`;
    if (!names.has(candidate)) return candidate;
  }
  return `新建文件夹 ${Date.now()}`;
}

function uniqueCopyName(name: string, usedNames: Set<string>): string {
  if (!usedNames.has(name)) return name;
  const dot = name.lastIndexOf(".");
  const hasExtension = dot > 0 && dot < name.length - 1;
  const stem = hasExtension ? name.slice(0, dot) : name;
  const extension = hasExtension ? name.slice(dot) : "";
  const first = `${stem} 副本${extension}`;
  if (!usedNames.has(first)) return first;
  for (let index = 2; index < 1000; index += 1) {
    const candidate = `${stem} 副本 ${index}${extension}`;
    if (!usedNames.has(candidate)) return candidate;
  }
  return `${stem} 副本 ${Date.now()}${extension}`;
}

function driveVersion(item: GoogleDriveItem): string {
  return JSON.stringify([
    item.headRevisionId ?? "",
    item.md5Checksum ?? "",
    item.modifiedTime ?? "",
    item.size ?? "",
  ]);
}

function requiredElement<T extends Element>(selector: string): T {
  const node = document.querySelector<T>(selector);
  if (!node) throw new Error(`missing js-fileexplorer spike DOM: ${selector}`);
  return node;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

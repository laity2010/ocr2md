import * as vscode from "vscode";
import type { WorkspaceEntryType, WorkspaceFileStat, WorkspaceStorage } from "./workspaceStorage";

export class VsCodeWorkspaceStorage implements WorkspaceStorage {
  async readFile(filePath: string): Promise<Uint8Array> {
    return vscode.workspace.fs.readFile(vscode.Uri.file(filePath));
  }

  async writeFile(filePath: string, data: Uint8Array): Promise<void> {
    await vscode.workspace.fs.writeFile(vscode.Uri.file(filePath), data);
  }

  async exists(targetPath: string): Promise<boolean> {
    try {
      await vscode.workspace.fs.stat(vscode.Uri.file(targetPath));
      return true;
    } catch {
      return false;
    }
  }

  async readDirectory(directoryPath: string) {
    const entries = await vscode.workspace.fs.readDirectory(vscode.Uri.file(directoryPath));
    return entries.map(([name, type]) => ({ name, type: entryType(type) }));
  }

  async createDirectory(directoryPath: string): Promise<void> {
    await vscode.workspace.fs.createDirectory(vscode.Uri.file(directoryPath));
  }

  async copy(sourcePath: string, targetPath: string, options: { overwrite?: boolean } = {}): Promise<void> {
    await vscode.workspace.fs.copy(vscode.Uri.file(sourcePath), vscode.Uri.file(targetPath), {
      overwrite: options.overwrite ?? false,
    });
  }

  async rename(sourcePath: string, targetPath: string, options: { overwrite?: boolean } = {}): Promise<void> {
    await vscode.workspace.fs.rename(vscode.Uri.file(sourcePath), vscode.Uri.file(targetPath), {
      overwrite: options.overwrite ?? false,
    });
  }

  async delete(targetPath: string, options: { recursive?: boolean } = {}): Promise<void> {
    await vscode.workspace.fs.delete(vscode.Uri.file(targetPath), {
      recursive: options.recursive ?? false,
      useTrash: false,
    });
  }

  async stat(targetPath: string): Promise<WorkspaceFileStat> {
    const stat = await vscode.workspace.fs.stat(vscode.Uri.file(targetPath));
    return {
      type: entryType(stat.type),
      ctime: stat.ctime,
      mtime: stat.mtime,
      size: stat.size,
    };
  }
}

function entryType(type: vscode.FileType): WorkspaceEntryType {
  if ((type & vscode.FileType.File) !== 0) return "file";
  if ((type & vscode.FileType.Directory) !== 0) return "directory";
  return "unknown";
}

import type { SidebarState } from "./types";
import {
  ANNOTATION_EXTRA_COLUMNS,
  CHAPTER_BOUNDARY_EXTRA_COLUMNS,
  EMBED_EXTRA_COLUMNS,
  TABLE_COLUMNS,
  moduleRows,
  renderReviewUi,
} from "./reviewUi";

export {
  ANNOTATION_EXTRA_COLUMNS,
  CHAPTER_BOUNDARY_EXTRA_COLUMNS,
  EMBED_EXTRA_COLUMNS,
  TABLE_COLUMNS,
  moduleRows,
};

/**
 * VS Code is only a host adapter. The review UI itself lives in reviewUi.ts
 * and communicates through window.ocr2mdHost, which a browser/cloud host can
 * implement without changing the UI.
 */
export const VSCODE_REVIEW_UI_BOOTSTRAP = `
    const vscodeApi = acquireVsCodeApi();
    window.ocr2mdHost = {
      postMessage(message) { vscodeApi.postMessage(message); },
      getState() { return vscodeApi.getState(); },
      setState(value) { vscodeApi.setState(value); },
      onState(listener) {
        window.addEventListener("message", (event) => {
          const data = event.data;
          if (!data || data.command !== "setState" || !data.state) return;
          listener(data.state);
        });
      },
    };
`;

export const VSCODE_REVIEW_UI_THEME = `
    :root {
      --ocr-foreground: var(--vscode-foreground);
      --ocr-background: var(--vscode-editor-background);
      --ocr-input-foreground: var(--vscode-input-foreground);
      --ocr-input-background: var(--vscode-input-background);
      --ocr-border: var(--vscode-input-border, var(--vscode-panel-border));
      --ocr-button-background: var(--vscode-button-background);
      --ocr-button-foreground: var(--vscode-button-foreground);
      --ocr-button-secondary-background: var(--vscode-button-secondaryBackground);
      --ocr-description-foreground: var(--vscode-descriptionForeground);
      --ocr-editor-font-family: var(--vscode-editor-font-family);
      --ocr-font-family: var(--vscode-font-family);
      --ocr-focus-border: var(--vscode-focusBorder);
      --ocr-hover-background: var(--vscode-list-hoverBackground);
      --ocr-header-background: var(--vscode-sideBarSectionHeader-background);
      --ocr-failed: var(--vscode-testing-iconFailed, #f14c4c);
      --ocr-passed: var(--vscode-testing-iconPassed, #89d185);
      --ocr-link: var(--vscode-textLink-foreground);
    }
`;

export function renderSidebar(state: SidebarState): string {
  return renderReviewUi(state, VSCODE_REVIEW_UI_BOOTSTRAP, VSCODE_REVIEW_UI_THEME);
}

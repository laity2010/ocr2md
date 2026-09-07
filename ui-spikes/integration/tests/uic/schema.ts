export type UiAutomationLevel = "browser" | "core" | "manual-external";

export type UiContractStep =
  | {
      action: "clickSourceLine";
      line: number;
      note?: string;
    }
  | {
      action: "clickControl";
      controlId: string;
      note?: string;
    }
  | {
      action: "moveLines";
      startLine: number;
      endLine: number;
      beforeLine: number;
      note?: string;
    }
  | {
      action: "replaceInLine";
      line: number;
      search: string;
      replace: string;
      note?: string;
    }
  | {
      action: "selectModule";
      module: string;
      note?: string;
    }
  | {
      action: "setRowLineType";
      module: string;
      line: number;
      value: string;
      note?: string;
    }
  | {
      action: "pressShortcut";
      keys: string;
      note?: string;
    };

export type UiExpectation =
  | {
      kind: "workingEqualsMovedSource";
      startLine: number;
      endLine: number;
      beforeLine: number;
      note?: string;
    }
  | {
      kind: "sourceLineActive";
      line: number;
      note?: string;
    }
  | {
      kind: "controlState";
      controlId: string;
      visible?: boolean;
      disabled?: boolean;
      text?: string;
      note?: string;
    }
  | {
      kind: "workingEqualsSource";
      note?: string;
    }
  | {
      kind: "workingContains";
      text: string;
      note?: string;
    }
  | {
      kind: "moduleActive";
      module: string;
      note?: string;
    }
  | {
      kind: "moduleNotice";
      module: string;
      text: string;
      flashing?: boolean;
      note?: string;
    }
  | {
      kind: "moduleNoticeCleared";
      module: string;
      note?: string;
    }
  | {
      kind: "lineTypeOptionAvailable";
      module: string;
      value: string;
      note?: string;
    }
  | {
      kind: "reviewRowState";
      module?: string;
      line: number;
      text: string;
      lineType?: string;
      owner?: string;
      note?: string;
    }
  | {
      kind: "gridLineAbsent";
      module: string;
      line: number;
      note?: string;
    }
  | {
      kind: "gridRow";
      module: string;
      line: number;
      text: string;
      change?: "新增" | "修改" | "删除";
      lineType?: string;
      owner?: "未归类" | "章节标题" | "注释" | "嵌入块" | "非法断行";
      changed?: boolean;
      deletedStyle?: boolean;
      navigable?: boolean;
      nonNavigable?: boolean;
      note?: string;
    }
  | {
      kind: "featureDebugProgress";
      state: "running" | "passed" | "failed";
      visible?: boolean;
      completedSteps?: number;
      title?: string;
      note?: string;
    }
  | {
      kind: "workspaceVisible";
      workspace: "cleaning" | "gd";
      note?: string;
    };

export interface UiInteractionContract {
  id: string;
  title: string;
  area: string;
  intent: string;
  automation: UiAutomationLevel;
  fixture: {
    mode: "ui-test" | "production-debug";
    source: "source.md";
    baseline: "source";
  };
  preconditions: string[];
  steps: UiContractStep[];
  expectations: UiExpectation[];
  invariants: string[];
  evidence: {
    coreTest?: string;
    browserTest?: string;
  };
  tags: string[];
}

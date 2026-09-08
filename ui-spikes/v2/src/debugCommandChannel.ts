import {
  getDebugClientId,
  getPageLoadedAtIso,
  type DebugStateReport,
} from "./debugStateReporter";

export type DebugCommandAction =
  | "open-chapter"
  | "open-boundary"
  | "assign-boundary-sequence"
  | "export-boundary"
  | "edit"
  | "select-review-module"
  | "focus-first-calibration"
  | "ignore-first-calibration"
  | "demote-first-heading"
  | "toggle-heading-numbering"
  | "undo"
  | "redo"
  | "save"
  | "close"
  | "leave-cancel"
  | "leave-discard"
  | "leave-save"
  | "enter-debug"
  | "exit-debug";

export type DebugCommand = {
  commandId: string;
  commandSequence: number;
  action: DebugCommandAction;
  chapterId?: string;
  reviewModule?: string;
};

export function startDebugCommandPolling(
  onCommand: (command: DebugCommand) => void,
  onCommandSettled?: (
    command: DebugCommand,
  ) => Promise<DebugStateReport | undefined> | DebugStateReport | undefined,
  intervalMs = 350,
): () => void {
  let stopped = false;
  let timer: number | undefined;
  let lastExecutedCommandSequence = 0;

  const acknowledge = async (
    clientId: string,
    commandId: string,
    commandSequence: number,
    stateReport?: DebugStateReport,
  ): Promise<void> => {
    const body = JSON.stringify({
      clientId,
      commandId,
      commandSequence,
      pageLoadedAt: getPageLoadedAtIso(),
      stateReport,
    });

    try {
      await fetch("/__debug/ack", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body,
      });
    } catch {
      // The server retains unacknowledged commands, so the next poll retries.
    }
  };

  const waitForProjectionPaint = async (): Promise<void> => {
    await Promise.race([
      new Promise<void>((resolve) => {
        window.requestAnimationFrame(() => {
          window.requestAnimationFrame(() => resolve());
        });
      }),
      new Promise<void>((resolve) => {
        window.setTimeout(resolve, 100);
      }),
    ]);
  };

  const poll = async () => {
    try {
      const clientId = getDebugClientId();
      const response = await fetch(
        `/__debug/command?clientId=${encodeURIComponent(clientId)}`,
        { cache: "no-store" },
      );
      if (response.ok) {
        const payload = await response.json() as { command?: DebugCommand | null };
        if (payload.command) {
          let stateReport: DebugStateReport | undefined;
          const shouldExecute =
            payload.command.commandSequence > lastExecutedCommandSequence;
          if (shouldExecute) {
            lastExecutedCommandSequence = payload.command.commandSequence;
            try {
              onCommand(payload.command);
            } catch (error) {
              console.error("Remote debug command projection failed", error);
            }
          }
          try {
            // Remote control must not outrun the UI projection of the XState
            // result. Two animation frames establish a clear command boundary
            // before ACK and before the next poll can consume another command.
            await waitForProjectionPaint();
            stateReport = await onCommandSettled?.(payload.command);
          } catch (error) {
            console.error("Remote debug command settlement failed", error);
          }
          await acknowledge(
            clientId,
            payload.command.commandId,
            payload.command.commandSequence,
            stateReport,
          );
        }
      }
    } catch {
      // Development command polling is best-effort only.
    } finally {
      if (!stopped) timer = window.setTimeout(poll, intervalMs);
    }
  };

  void poll();

  return () => {
    stopped = true;
    if (timer !== undefined) window.clearTimeout(timer);
  };
}

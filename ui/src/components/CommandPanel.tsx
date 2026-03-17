import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { CommandButton } from "@/hooks/useSigil";

interface Props {
  commands: CommandButton[];
  onCommand: (command: string, project?: string) => Promise<void>;
}

const fallbackCommands: CommandButton[] = [
  { label: "Health", command: "health", icon: "\u{1F48A}" },
  { label: "Pause", command: "pause_all", icon: "\u270B", confirm: true },
];

export function CommandPanel({ commands, onCommand }: Props) {
  const [confirmTarget, setConfirmTarget] = useState<CommandButton | null>(null);
  const [executing, setExecuting] = useState<string | null>(null);
  const cmds = commands.length > 0 ? commands : fallbackCommands;

  async function handleClick(cmd: CommandButton) {
    if (cmd.confirm) {
      setConfirmTarget(cmd);
      return;
    }
    setExecuting(cmd.command);
    await onCommand(cmd.command, cmd.project);
    setTimeout(() => setExecuting(null), 1000);
  }

  async function confirmAction() {
    if (confirmTarget) {
      setExecuting(confirmTarget.command);
      await onCommand(confirmTarget.command, confirmTarget.project);
      setTimeout(() => setExecuting(null), 1000);
    }
    setConfirmTarget(null);
  }

  return (
    <>
      <div className="px-4 pb-4 pt-2 border-t border-border/50 bg-[var(--sigil-surface)]">
        <div className="flex gap-2 overflow-x-auto">
          {cmds.map((cmd) => (
            <Button
              key={cmd.label}
              variant={cmd.confirm ? "destructive" : "outline"}
              size="sm"
              className={`text-[11px] h-8 px-3 shrink-0 border-border/50 ${
                executing === cmd.command
                  ? "text-[var(--sigil-ok)] border-[var(--sigil-ok)]"
                  : cmd.confirm
                    ? ""
                    : "hover:border-[var(--sigil-ok)] hover:text-[var(--sigil-ok)]"
              } transition-colors`}
              onClick={() => handleClick(cmd)}
              disabled={executing === cmd.command}
            >
              {cmd.icon ? `${cmd.icon} ` : ""}{cmd.label}
            </Button>
          ))}
        </div>
      </div>

      <Dialog
        open={confirmTarget !== null}
        onOpenChange={(open) => !open && setConfirmTarget(null)}
      >
        <DialogContent className="max-w-xs bg-[var(--sigil-surface-raised)] border-[var(--sigil-error)]/30">
          <DialogHeader>
            <DialogTitle className="text-sm font-medium">
              {confirmTarget?.icon} {confirmTarget?.label}
            </DialogTitle>
            <DialogDescription className="text-[11px]">
              This will execute immediately. Confirm?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              size="sm"
              className="text-[11px] h-8"
              onClick={() => setConfirmTarget(null)}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              size="sm"
              className="text-[11px] h-8"
              onClick={confirmAction}
            >
              Execute
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

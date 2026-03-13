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
import type { CommandButton } from "@/hooks/useBridge";

interface Props {
  commands: CommandButton[];
  onCommand: (command: string, project?: string) => Promise<void>;
}

// Default commands shown when bridge hasn't connected yet
const fallbackCommands: CommandButton[] = [
  { label: "Start PACO", command: "start", project: "paco", icon: "\u{1F680}" },
  { label: "Start Cortex", command: "start", project: "cortex", icon: "\u{1F9E0}" },
  { label: "Start Site", command: "start", project: "site", icon: "\u{1F310}" },
  { label: "Health Check", command: "health", icon: "\u{1F48A}" },
  { label: "Pause All", command: "pause_all", icon: "\u270B", confirm: true },
];

export function CommandPanel({ commands, onCommand }: Props) {
  const [confirmTarget, setConfirmTarget] = useState<CommandButton | null>(null);
  const cmds = commands.length > 0 ? commands : fallbackCommands;

  function handleClick(cmd: CommandButton) {
    if (cmd.confirm) {
      setConfirmTarget(cmd);
      return;
    }
    onCommand(cmd.command, cmd.project);
  }

  function confirmAction() {
    if (confirmTarget) {
      onCommand(confirmTarget.command, confirmTarget.project);
    }
    setConfirmTarget(null);
  }

  return (
    <>
      <div className="px-3 pb-3 pt-2 border-t border-border">
        <div className="grid grid-cols-3 gap-2">
          {cmds.map((cmd) => (
            <Button
              key={cmd.label}
              variant={cmd.confirm ? "destructive" : "default"}
              size="sm"
              className="text-xs h-9"
              onClick={() => handleClick(cmd)}
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
        <DialogContent className="max-w-xs">
          <DialogHeader>
            <DialogTitle>Confirm: {confirmTarget?.label}</DialogTitle>
            <DialogDescription>
              This action cannot be undone. Are you sure?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setConfirmTarget(null)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={confirmAction}>
              Confirm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

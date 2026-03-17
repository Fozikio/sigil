import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import type { CommandButton } from "@/hooks/useSigil";

interface Props {
  commands: CommandButton[];
  onCommand: (command: string, project?: string) => Promise<void>;
}

// Visual treatment per command type
const commandStyle: Record<string, string> = {
  start: "border-[var(--sigil-ok)]/30 text-[var(--sigil-ok)] hover:bg-[var(--sigil-ok)]/10 hover:border-[var(--sigil-ok)]/60",
  restart: "border-[var(--sigil-warn)]/30 text-[var(--sigil-warn)] hover:bg-[var(--sigil-warn)]/10 hover:border-[var(--sigil-warn)]/60",
  health: "border-border/40 text-muted-foreground hover:bg-secondary/50 hover:text-foreground",
  pause_all: "border-[var(--sigil-error)]/30 text-[var(--sigil-error)] hover:bg-[var(--sigil-error)]/10 hover:border-[var(--sigil-error)]/60",
};

export function CommandPanel({ commands, onCommand }: Props) {
  const [confirmTarget, setConfirmTarget] = useState<CommandButton | null>(null);
  const [executing, setExecuting] = useState<string | null>(null);

  if (commands.length === 0) return null;

  async function handleClick(cmd: CommandButton) {
    if (cmd.confirm) {
      setConfirmTarget(cmd);
      return;
    }
    execute(cmd);
  }

  async function execute(cmd: CommandButton) {
    const key = `${cmd.command}-${cmd.project ?? ''}`;
    setExecuting(key);
    try {
      await onCommand(cmd.command, cmd.project);
    } finally {
      setTimeout(() => setExecuting(null), 2000);
    }
  }

  async function confirmAction() {
    if (confirmTarget) await execute(confirmTarget);
    setConfirmTarget(null);
  }

  // Group: primary actions (start/restart) vs secondary (health, pause)
  const primary = commands.filter(c => c.command === 'start' || c.command === 'restart');
  const secondary = commands.filter(c => c.command !== 'start' && c.command !== 'restart');

  return (
    <>
      <div className="px-4 pb-4 pt-3 border-t border-border/40 bg-[var(--sigil-surface)] space-y-2">
        {/* Primary actions — full width, prominent */}
        {primary.length > 0 && (
          <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${Math.min(primary.length, 3)}, 1fr)` }}>
            {primary.map((cmd) => {
              const key = `${cmd.command}-${cmd.project ?? ''}`;
              const isExecuting = executing === key;
              const style = commandStyle[cmd.command] ?? commandStyle.health;

              return (
                <button
                  key={key}
                  onClick={() => handleClick(cmd)}
                  disabled={isExecuting}
                  className={`flex items-center justify-center gap-2 px-3 py-2.5 rounded-md border text-[12px] font-medium transition-all duration-200 ${
                    isExecuting
                      ? "border-[var(--sigil-ok)] bg-[var(--sigil-ok)]/10 text-[var(--sigil-ok)]"
                      : style
                  } disabled:opacity-50 active:scale-[0.97]`}
                >
                  {isExecuting ? (
                    <span className="sigil-pulse">Dispatching...</span>
                  ) : (
                    <>
                      {cmd.icon && <span className="text-sm">{cmd.icon}</span>}
                      <span>{cmd.label}</span>
                    </>
                  )}
                </button>
              );
            })}
          </div>
        )}

        {/* Secondary actions — smaller, row */}
        {secondary.length > 0 && (
          <div className="flex gap-2">
            {secondary.map((cmd) => {
              const key = `${cmd.command}-${cmd.project ?? ''}`;
              const isExecuting = executing === key;
              const style = commandStyle[cmd.command] ?? commandStyle.health;

              return (
                <button
                  key={key}
                  onClick={() => handleClick(cmd)}
                  disabled={isExecuting}
                  className={`flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-md border text-[11px] transition-all duration-200 ${
                    isExecuting
                      ? "border-[var(--sigil-ok)] text-[var(--sigil-ok)]"
                      : style
                  } disabled:opacity-50 active:scale-[0.97]`}
                >
                  {cmd.icon && <span>{cmd.icon}</span>}
                  <span>{cmd.label}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Confirmation dialog */}
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

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

const commandStyle: Record<string, { border: string; text: string; hover: string; activeBg: string }> = {
  start:     { border: "border-[var(--sigil-ok)]/25",   text: "text-[var(--sigil-ok)]",   hover: "hover:bg-[var(--sigil-ok)]/8 hover:border-[var(--sigil-ok)]/50",   activeBg: "bg-[var(--sigil-ok)]/10" },
  restart:   { border: "border-[var(--sigil-warn)]/25",  text: "text-[var(--sigil-warn)]",  hover: "hover:bg-[var(--sigil-warn)]/8 hover:border-[var(--sigil-warn)]/50",  activeBg: "bg-[var(--sigil-warn)]/10" },
  health:    { border: "border-border/30",               text: "text-muted-foreground",     hover: "hover:bg-secondary/30 hover:text-foreground hover:border-border/50",               activeBg: "bg-secondary/20" },
  pause_all: { border: "border-[var(--sigil-error)]/25", text: "text-[var(--sigil-error)]", hover: "hover:bg-[var(--sigil-error)]/8 hover:border-[var(--sigil-error)]/50", activeBg: "bg-[var(--sigil-error)]/10" },
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

  const primary = commands.filter(c => c.command === 'start' || c.command === 'restart');
  const secondary = commands.filter(c => c.command !== 'start' && c.command !== 'restart');

  return (
    <>
      <div className="px-3 pb-3 pt-2.5 border-t border-border/30 bg-[var(--sigil-surface)]">
        {/* Primary: launchers / restart */}
        {primary.length > 0 && (
          <div className="grid gap-1.5 mb-1.5" style={{ gridTemplateColumns: `repeat(${Math.min(primary.length, 3)}, 1fr)` }}>
            {primary.map((cmd) => {
              const key = `${cmd.command}-${cmd.project ?? ''}`;
              const isExec = executing === key;
              const s = commandStyle[cmd.command] ?? commandStyle.health;
              return (
                <button
                  key={key}
                  onClick={() => handleClick(cmd)}
                  disabled={isExec}
                  className={`flex items-center justify-center gap-2 px-3 py-3 rounded border text-[12px] font-medium transition-all duration-150 active:scale-[0.97] ${
                    isExec ? `${s.activeBg} ${s.border} ${s.text} sigil-pulse` : `${s.border} ${s.text} ${s.hover}`
                  } disabled:opacity-40`}
                >
                  {isExec ? (
                    <span>Dispatching...</span>
                  ) : (
                    <>
                      {cmd.icon && <span className="text-base leading-none">{cmd.icon}</span>}
                      <span>{cmd.label}</span>
                    </>
                  )}
                </button>
              );
            })}
          </div>
        )}

        {/* Secondary: health, stop */}
        {secondary.length > 0 && (
          <div className="flex gap-1.5">
            {secondary.map((cmd) => {
              const key = `${cmd.command}-${cmd.project ?? ''}`;
              const isExec = executing === key;
              const s = commandStyle[cmd.command] ?? commandStyle.health;
              return (
                <button
                  key={key}
                  onClick={() => handleClick(cmd)}
                  disabled={isExec}
                  className={`flex-1 flex items-center justify-center gap-1.5 px-2 py-2 rounded border text-[11px] transition-all duration-150 active:scale-[0.97] ${
                    isExec ? `${s.activeBg} ${s.text}` : `${s.border} ${s.text} ${s.hover}`
                  } disabled:opacity-40`}
                >
                  {cmd.icon && <span>{cmd.icon}</span>}
                  <span>{cmd.label}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      <Dialog open={confirmTarget !== null} onOpenChange={(open) => !open && setConfirmTarget(null)}>
        <DialogContent className="max-w-[280px] bg-[var(--sigil-surface-raised)] border-[var(--sigil-error)]/20">
          <DialogHeader>
            <DialogTitle className="text-[13px] font-medium">
              {confirmTarget?.icon} {confirmTarget?.label}
            </DialogTitle>
            <DialogDescription className="text-[11px] text-muted-foreground/60">
              Execute immediately?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" size="sm" className="text-[11px] h-8 border-border/30" onClick={() => setConfirmTarget(null)}>
              Cancel
            </Button>
            <Button variant="destructive" size="sm" className="text-[11px] h-8" onClick={confirmAction}>
              Execute
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

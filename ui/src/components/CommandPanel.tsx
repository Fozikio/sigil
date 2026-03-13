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

interface Command {
  label: string;
  variant?: "default" | "secondary" | "destructive" | "outline";
  confirm?: boolean;
}

const commands: Command[] = [
  { label: "Start PACO" },
  { label: "Start Cortex" },
  { label: "Start Site" },
  { label: "Health Check", variant: "secondary" },
  { label: "Pause All", variant: "destructive", confirm: true },
];

export function CommandPanel() {
  const [confirmTarget, setConfirmTarget] = useState<string | null>(null);

  function handleCommand(cmd: Command) {
    if (cmd.confirm) {
      setConfirmTarget(cmd.label);
      return;
    }
    // TODO: dispatch command
    console.log(`Command: ${cmd.label}`);
  }

  function confirmAction() {
    // TODO: dispatch confirmed command
    console.log(`Confirmed: ${confirmTarget}`);
    setConfirmTarget(null);
  }

  return (
    <>
      <div className="px-3 pb-3 pt-2 border-t border-border">
        <div className="grid grid-cols-3 gap-2">
          {commands.map((cmd) => (
            <Button
              key={cmd.label}
              variant={cmd.variant ?? "default"}
              size="sm"
              className="text-xs h-9"
              onClick={() => handleCommand(cmd)}
            >
              {cmd.label}
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
            <DialogTitle>Confirm: {confirmTarget}</DialogTitle>
            <DialogDescription>
              This will pause all running services. Are you sure?
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

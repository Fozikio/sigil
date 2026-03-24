import type { ScheduleCard, ScheduleSession } from "@/hooks/useSigil";

interface Props {
  schedule: ScheduleCard;
  halted: boolean;
  onSkip: (seed: string) => void;
  onStop: (seed: string) => void;
  onHalt: () => void;
  onResume: () => void;
}

const statusIcon: Record<ScheduleSession["status"], string> = {
  queued: "\u23f3",
  running: "\ud83d\udd04",
  finished: "\u2705",
  skipped: "\u23ed\ufe0f",
  stopped: "\u26d4",
};

const statusLabel: Record<ScheduleSession["status"], string> = {
  queued: "Queued",
  running: "Running",
  finished: "Finished",
  skipped: "Skipped",
  stopped: "Stopped",
};

function formatTime(unix: number): string {
  return new Date(unix * 1000).toLocaleString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

function formatCost(cost?: number): string {
  if (cost == null) return "";
  return `$${cost.toFixed(2)}`;
}

export function ScheduleTimeline({
  schedule,
  halted,
  onSkip,
  onStop,
  onHalt,
  onResume,
}: Props) {
  const { sessions } = schedule;
  if (sessions.length === 0) return null;

  // Time range for header
  const first = sessions[0];
  const last = sessions[sessions.length - 1];
  const timeRange = `${formatTime(first.time_unix)} - ${formatTime(last.time_unix)}`;

  return (
    <div className="border-b border-border/50">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-border/30">
        <div className="flex items-center gap-2">
          <span className="text-[10px] tracking-[0.15em] uppercase text-muted-foreground/60">
            Schedule
          </span>
          <span className="text-[10px] text-muted-foreground/40 tabular-nums">
            {timeRange}
          </span>
          {halted && (
            <span className="text-[9px] px-1.5 py-0.5 rounded bg-[var(--sigil-error)]/15 text-[var(--sigil-error)] font-medium">
              HALTED
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          {halted ? (
            <button
              onClick={onResume}
              className="text-[9px] px-2 py-0.5 rounded border border-[var(--sigil-ok)]/30 text-[var(--sigil-ok)] hover:bg-[var(--sigil-ok)]/10 transition-colors"
            >
              Resume
            </button>
          ) : (
            <button
              onClick={onHalt}
              className="text-[9px] px-2 py-0.5 rounded border border-[var(--sigil-error)]/30 text-[var(--sigil-error)]/70 hover:bg-[var(--sigil-error)]/10 hover:text-[var(--sigil-error)] transition-colors"
            >
              Halt All
            </button>
          )}
        </div>
      </div>

      {/* Timeline */}
      <div className="relative">
        {sessions.map((session, idx) => (
          <SessionRow
            key={`${session.seed}-${idx}`}
            session={session}
            isLast={idx === sessions.length - 1}
            onSkip={() => onSkip(session.seed)}
            onStop={() => onStop(session.seed)}
            halted={halted}
          />
        ))}

        {/* Next planner indicator */}
        {schedule.next_planner > 0 && (
          <div className="flex items-center gap-3 px-4 py-1.5 text-[10px] text-muted-foreground/40">
            <span className="w-4 text-center">{"\ud83d\udccb"}</span>
            <span className="tabular-nums">{formatTime(schedule.next_planner)}</span>
            <span>Next review</span>
          </div>
        )}
      </div>
    </div>
  );
}

function SessionRow({
  session,
  isLast,
  onSkip,
  onStop,
  halted,
}: {
  session: ScheduleSession;
  isLast: boolean;
  onSkip: () => void;
  onStop: () => void;
  halted: boolean;
}) {
  const isDone = session.status === "finished" || session.status === "skipped" || session.status === "stopped";
  const isRunning = session.status === "running";
  const isQueued = session.status === "queued";

  return (
    <div
      className={`relative flex items-start gap-3 px-4 py-2 text-[11px] transition-colors ${
        isDone ? "opacity-50" : ""
      } ${isRunning ? "bg-[var(--sigil-surface-raised)]" : "hover:bg-[var(--sigil-surface-raised)]"}`}
    >
      {/* Timeline connector line */}
      {!isLast && (
        <div className="absolute left-[1.55rem] top-[1.25rem] bottom-0 w-px bg-border/30" />
      )}

      {/* Status icon */}
      <span className={`w-4 text-center shrink-0 relative z-10 ${isRunning ? "sigil-pulse" : ""}`}>
        {statusIcon[session.status]}
      </span>

      {/* Time */}
      <span className="tabular-nums text-muted-foreground shrink-0 w-[4.5rem]">
        {session.time || formatTime(session.time_unix)}
      </span>

      {/* Seed name */}
      <span className={`font-medium min-w-[70px] ${isRunning ? "text-[var(--sigil-ok)]" : "text-foreground"}`}>
        {session.seed}
      </span>

      {/* Status label */}
      <span className="text-muted-foreground">
        {statusLabel[session.status]}
      </span>

      {/* Metrics (finished sessions) */}
      {session.cost_usd != null && (
        <span className="text-muted-foreground/60 tabular-nums">
          {formatCost(session.cost_usd)}
        </span>
      )}
      {session.turns != null && (
        <span className="text-muted-foreground/60 tabular-nums">
          {session.turns}t
        </span>
      )}

      {/* Action buttons — right aligned */}
      <div className="ml-auto flex items-center gap-1.5 shrink-0">
        {isRunning && !halted && (
          <button
            onClick={onStop}
            className="text-[9px] px-1.5 py-0.5 rounded border border-[var(--sigil-error)]/30 text-[var(--sigil-error)]/70 hover:bg-[var(--sigil-error)]/10 hover:text-[var(--sigil-error)] transition-colors"
          >
            stop
          </button>
        )}
        {isQueued && !halted && (
          <button
            onClick={onSkip}
            className="text-[9px] px-1.5 py-0.5 rounded border border-border/40 text-muted-foreground/50 hover:bg-[var(--sigil-surface-raised)] hover:text-foreground/70 transition-colors"
          >
            skip
          </button>
        )}
      </div>

      {/* Intent text (running sessions) */}
      {isRunning && session.intent && (
        <div className="absolute left-[3.55rem] top-[1.75rem] text-[10px] text-muted-foreground/50 italic truncate max-w-[calc(100%-5rem)]">
          {"\u2192"} {session.intent}
        </div>
      )}
    </div>
  );
}

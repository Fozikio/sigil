import { useEffect, useState } from "react";

const BASE_URL = import.meta.env.VITE_SIGIL_URL ?? "";

interface ServiceStatus {
  name: string;
  ok: boolean;
}

export function StatusFooter({ connected }: { connected: boolean }) {
  const [services, setServices] = useState<ServiceStatus[]>([]);

  useEffect(() => {
    const check = async () => {
      try {
        // Hit sigil's health endpoint which gives us basic info
        const r = await fetch(`${BASE_URL}/health`);
        const data = await r.json();
        const results: ServiceStatus[] = [
          { name: 'sigil', ok: data.healthy },
        ];

        // Check cortex
        try {
          const cortex = await fetch(`${BASE_URL}/sigil/health-services`, {
            credentials: 'include',
            signal: AbortSignal.timeout(5000),
          });
          if (cortex.ok) {
            const svc = await cortex.json();
            results.push(...svc);
          }
        } catch { /* no service health endpoint yet */ }

        setServices(results);
      } catch {
        setServices([{ name: 'sigil', ok: false }]);
      }
    };
    check();
    const interval = setInterval(check, 30_000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="px-4 py-1.5 border-t border-border/15 flex items-center gap-2 text-[9px] tabular-nums">
      {services.map(s => (
        <span key={s.name} className={s.ok ? 'text-[var(--sigil-ok)]/40' : 'text-[var(--sigil-error)]/50'}>
          {s.ok ? '●' : '○'} {s.name}
        </span>
      ))}
      {services.length === 0 && (
        <span className={connected ? 'text-[var(--sigil-ok)]/40' : 'text-[var(--sigil-error)]/40'}>
          {connected ? '● connected' : '○ disconnected'}
        </span>
      )}
      <span className="ml-auto text-muted-foreground/20">sigil v0.1</span>
    </div>
  );
}

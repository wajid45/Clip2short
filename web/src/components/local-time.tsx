import { useEffect, useState } from "react";

/** Renders times in the viewer's own time zone (server renders UTC until hydrated). */
function useMounted() {
  const [m, setM] = useState(false);
  useEffect(() => setM(true), []);
  return m;
}

export function LocalTime({ iso }: { iso: string }) {
  const mounted = useMounted();
  const d = new Date(iso);
  return (
    <time dateTime={iso} suppressHydrationWarning>
      {mounted ? d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : d.toISOString().slice(11, 16)}
    </time>
  );
}

export function LocalDayHeading({ iso }: { iso: string }) {
  const mounted = useMounted();
  const d = new Date(iso);
  let label = d.toISOString().slice(0, 10);
  let sub = "";
  if (mounted) {
    const today = new Date();
    const startOf = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
    const diff = Math.round((startOf(d) - startOf(today)) / 864e5);
    label = diff === 0 ? "Today" : diff === 1 ? "Tomorrow" : diff === -1 ? "Yesterday" : d.toLocaleDateString([], { weekday: "long" });
    sub = d.toLocaleDateString([], { month: "short", day: "numeric", year: d.getFullYear() !== today.getFullYear() ? "numeric" : undefined });
  }
  return (
    <div suppressHydrationWarning>
      <p className="text-sm font-medium text-text">{label}</p>
      {sub && <p className="text-xs text-faint">{sub}</p>}
    </div>
  );
}

export function LocalDateTime({ iso }: { iso: string }) {
  const mounted = useMounted();
  const d = new Date(iso);
  return (
    <time dateTime={iso} suppressHydrationWarning>
      {mounted ? d.toLocaleString([], { dateStyle: "medium", timeStyle: "short" }) : `${d.toISOString().slice(0, 16).replace("T", " ")} UTC`}
    </time>
  );
}

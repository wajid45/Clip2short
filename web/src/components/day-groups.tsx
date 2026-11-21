import { useEffect, useState, type ReactNode } from "react";
import { LocalDayHeading } from "./local-time";

/**
 * Groups queue rows into days in the viewer's time zone.
 * Before hydration it groups by UTC date so server and client markup match.
 */
export function DayGroups({ items }: { items: { id: string; at: string; node: ReactNode }[] }) {
  const [local, setLocal] = useState(false);
  useEffect(() => setLocal(true), []);
  const keyOf = (iso: string) => {
    if (!local) return iso.slice(0, 10);
    const d = new Date(iso);
    return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
  };
  const groups = new Map<string, typeof items>();
  for (const it of items) groups.set(keyOf(it.at), [...(groups.get(keyOf(it.at)) ?? []), it]);

  return (
    <div className="space-y-8">
      {[...groups.entries()].map(([key, list]) => (
        <section key={key} className="grid gap-3 md:grid-cols-[160px_minmax(0,1fr)]">
          <div className="md:pt-3">
            <LocalDayHeading iso={list[0].at} />
          </div>
          <ul className="divide-y divide-line rounded-xl border border-line bg-surface">
            {list.map((it) => (
              <li key={it.id}>{it.node}</li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

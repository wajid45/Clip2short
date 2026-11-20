import { useRef } from "react";

/** Six boxes for an authenticator code. Typing moves forward, Backspace moves back, paste fills all. */
export function OtpInput({ value, onChange, onComplete, autoFocus }: { value: string; onChange: (v: string) => void; onComplete?: (v: string) => void; autoFocus?: boolean }) {
  const refs = useRef<(HTMLInputElement | null)[]>([]);
  const digits = value.padEnd(6, " ").slice(0, 6).split("");

  const set = (next: string) => {
    const clean = next.replace(/\D/g, "").slice(0, 6);
    onChange(clean);
    if (clean.length === 6) onComplete?.(clean);
    refs.current[Math.min(clean.length, 5)]?.focus();
  };

  return (
    <div className="flex justify-between gap-2" role="group" aria-label="6-digit code">
      {digits.map((d, i) => (
        <input
          key={i}
          ref={(el) => {
            refs.current[i] = el;
          }}
          inputMode="numeric"
          autoComplete={i === 0 ? "one-time-code" : "off"}
          autoFocus={autoFocus && i === 0}
          aria-label={`Digit ${i + 1}`}
          maxLength={6}
          value={d.trim()}
          onChange={(e) => {
            const typed = e.target.value.replace(/\D/g, "");
            if (!typed) return;
            if (typed.length > 1) return set(typed); // paste or autofill
            set((value.slice(0, i) + typed).slice(0, 6));
          }}
          onKeyDown={(e) => {
            if (e.key === "Backspace") {
              e.preventDefault();
              const cut = value.slice(0, value.length - 1);
              onChange(cut);
              refs.current[Math.max(0, cut.length)]?.focus();
            }
          }}
          onPaste={(e) => {
            e.preventDefault();
            set(e.clipboardData.getData("text"));
          }}
          className="tc h-14 w-full min-w-0 rounded-xl border border-line-strong bg-surface text-center text-[22px] text-text transition-[border-color,box-shadow] hover:border-faint focus:border-signal focus:ring-3 focus:ring-signal/20 focus:outline-none dark:border-[#47474f] dark:bg-surface-2"
        />
      ))}
    </div>
  );
}

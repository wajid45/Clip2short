import clsx from "clsx";
import { createElement, useEffect, useRef, type CSSProperties } from "react";

/**
 * Headline whose letters rise out of their own line, one after another, the first time it
 * scrolls into view. Server-rendered as real text (screen readers get the whole sentence
 * through aria-label); the hidden start state only applies once JS has marked <html class="js">.
 *
 * `parts` is a list of segments. A plain string is split into letters; a segment with a
 * className (the gradient word, the accent full stop) rises as one piece so its styling
 * stays continuous. "\n" inside a string starts a new line.
 */

export type SplitPart = string | { text: string; className?: string; letters?: boolean };

interface Props {
  parts: SplitPart[];
  as?: "h1" | "h2" | "h3" | "p" | "span";
  className?: string;
  /** Extra delay before the first letter, in ms. */
  delay?: number;
  /** Letter stagger in ms. */
  stagger?: number;
  style?: CSSProperties;
}

export function SplitRise({ parts, as = "h2", className, delay = 0, stagger = 18, style }: Props) {
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          el.classList.add("is-in");
          io.disconnect();
        }
      },
      { rootMargin: "0px 0px -8% 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const label = parts
    .map((p) => (typeof p === "string" ? p : p.text))
    .join("")
    .replace(/\n/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  let i = 0;
  const lines: React.ReactNode[][] = [[]];
  parts.forEach((part, pi) => {
    const seg = typeof part === "string" ? { text: part, className: undefined, letters: true } : { letters: false, ...part };
    seg.text.split("\n").forEach((chunk, ci) => {
      if (ci > 0) lines.push([]);
      const line = lines[lines.length - 1];
      if (!seg.letters) {
        if (!chunk) return;
        line.push(
          <span key={`${pi}-${ci}`} className="split-w">
            <span className={clsx("split-l", seg.className)} style={{ "--i": i++ } as CSSProperties}>
              {chunk}
            </span>
          </span>,
        );
        return;
      }
      // Words stay unbroken; spaces between them are real spaces so lines wrap naturally.
      chunk.split(/(\s+)/).forEach((word, wi) => {
        if (!word) return;
        if (/^\s+$/.test(word)) {
          line.push(" ");
          return;
        }
        line.push(
          <span key={`${pi}-${ci}-${wi}`} className={clsx("split-w", seg.className)}>
            {[...word].map((ch, k) => (
              <span key={k} className="split-l" style={{ "--i": i++ } as CSSProperties}>
                {ch}
              </span>
            ))}
          </span>,
        );
      });
    });
  });

  return createElement(
    as,
    {
      ref,
      className: clsx("split", className),
      "aria-label": label,
      style: { "--d": `${delay}ms`, "--s": `${stagger}ms`, ...style } as CSSProperties,
    },
    lines.map((l, k) => (
      <span key={k} className="block" aria-hidden="true">
        {l}
      </span>
    )),
  );
}

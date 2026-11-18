import { StrictMode } from "react";
import { renderToString } from "react-dom/server";
import { Landing } from "./Landing";

/** Used at build time by prerender.mjs to write the landing page as static HTML. */
export function render(): string {
  return renderToString(
    <StrictMode>
      <Landing />
    </StrictMode>,
  );
}

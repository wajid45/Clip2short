/**
 * Page names in the address bar are opaque tokens: /app/7isaim1p8n rather than /app/billing.
 * The code (links, redirects, the API's emails and Stripe return URLs) keeps the readable
 * names; they are translated here, at the address bar. Readable addresses still work and are
 * replaced with the token form, so old links and bookmarks never break.
 *
 * This hides which page is which from a glance at the URL. It is not access control: every
 * page's data is still checked by the API.
 */

export const PAGE_TOKENS: Record<string, string> = {
  overview: "kzrdmgzr8r",
  videos: "3gg6lx3iiz",
  clips: "pg7dsz2nbd",
  moments: "aeqleysfs9",
  library: "bcllj0acf5",
  queue: "ijzudxa2zw",
  analytics: "2kwk9pztkd",
  accounts: "of5369rycv",
  billing: "7isaim1p8n",
  settings: "tbcvdeb1mo",
  help: "apgn88usqi",
};

const NAME_OF: Record<string, string> = Object.fromEntries(Object.entries(PAGE_TOKENS).map(([name, token]) => [token, name]));

function swapFirstSegment(path: string, table: Record<string, string>): string {
  const m = /^\/app\/([^/?#]+)(.*)$/s.exec(path);
  if (!m) return path;
  const swapped = table[m[1]];
  return swapped ? `/app/${swapped}${m[2]}` : path;
}

/** /app/billing?x=1 -> /app/7isaim1p8n?x=1 (anything else is returned as it is). */
export const toPublic = (path: string) => swapFirstSegment(path, PAGE_TOKENS);

/** /app/7isaim1p8n -> /app/billing, for code that compares the current path with readable names. */
export const toInternal = (path: string) => swapFirstSegment(path, NAME_OF);

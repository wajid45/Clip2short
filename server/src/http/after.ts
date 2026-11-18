/**
 * Runs work after the response has been sent (video processing, analysis, publishing).
 * Errors are logged, never thrown back into the request.
 */
export function after(fn: () => unknown): void {
  setImmediate(() => {
    Promise.resolve()
      .then(fn)
      .catch((e) => console.error("[after] background task failed", e));
  });
}

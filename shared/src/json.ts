/** The shape a value takes after JSON.stringify/parse: Dates become ISO strings. Used to type API page data. */
export type Jsonify<T> = T extends Date
  ? string
  : T extends (...args: never[]) => unknown
    ? never
    : T extends ReadonlyArray<infer U>
      ? Jsonify<U>[]
      : T extends object
        ? { [K in keyof T]: Jsonify<T[K]> }
        : T;

import { ZodError, type ZodType } from "zod";
import { getCurrentUser, type CurrentUser } from "./auth";

export class HttpError extends Error {
  constructor(public status: number, message: string, public code?: string) {
    super(message);
  }
}

export function json<T>(data: T, init?: number | ResponseInit) {
  return Response.json(data, typeof init === "number" ? { status: init } : init);
}

/** Wraps a route handler with consistent error responses. */
export function handle<A extends unknown[]>(fn: (...args: A) => Promise<Response>) {
  return async (...args: A): Promise<Response> => {
    try {
      return await fn(...args);
    } catch (err) {
      if (err instanceof HttpError) return json({ error: err.message, code: err.code }, err.status);
      if (err instanceof ZodError) {
        const first = err.issues[0];
        return json({ error: first ? `${first.path.join(".") || "input"}: ${first.message}` : "Invalid input" }, 400);
      }
      console.error("[api] unhandled error", err);
      return json({ error: "Something went wrong on our side. Please try again." }, 500);
    }
  };
}

export async function apiUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) throw new HttpError(401, "Please sign in.");
  return user;
}

export async function apiSubscriber(): Promise<CurrentUser> {
  const user = await apiUser();
  const { hasAccess } = await import("./usage");
  if (!(await hasAccess(user)))
    throw new HttpError(402, "You're out of credits. Buy credits or choose a plan in Billing.", "no_credits");
  return user;
}

export async function parseBody<T>(req: Request, schema: ZodType<T>): Promise<T> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    throw new HttpError(400, "Request body must be JSON.");
  }
  return schema.parse(body);
}

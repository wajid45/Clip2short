import { db } from "./db";
import { readSessionUserId } from "./session";
import { env } from "./env";
import { requestCache } from "../http/context";
import { HttpError } from "./api";

export const getCurrentUser = () =>
  requestCache("currentUser", async () => {
    const id = await readSessionUserId();
    if (!id) return null;
    return db.user.findUnique({ where: { id } });
  });

export type CurrentUser = NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>;

/** For page data: the signed-in user, or 401 (the web app sends the visitor to sign in). */
export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) throw new HttpError(401, "Please sign in.", "unauthenticated");
  return user;
}

/** For workspace page data: an active plan or unexpired credits, else 402 (the web app opens Billing). */
export async function requireSubscriber(): Promise<CurrentUser> {
  const user = await requireUser();
  const { hasAccess } = await import("./usage");
  if (!(await hasAccess(user))) throw new HttpError(402, "You're out of credits.", "no_credits");
  return user;
}

export function isAdmin(user: { email: string }): boolean {
  return env.adminEmails.includes(user.email.toLowerCase());
}

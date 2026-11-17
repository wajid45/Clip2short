import "server-only";
import { redirect } from "next/navigation";
import { cache } from "react";
import { db } from "./db";
import { readSessionUserId } from "./session";
import { env } from "./env";

export const getCurrentUser = cache(async () => {
  const id = await readSessionUserId();
  if (!id) return null;
  return db.user.findUnique({ where: { id } });
});

export type CurrentUser = NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>;

/** For pages: signed-in user or redirect to login. */
export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

/** For workspace pages: an active plan or unexpired credits, else the billing page. */
export async function requireSubscriber(): Promise<CurrentUser> {
  const user = await requireUser();
  const { hasAccess } = await import("./usage");
  if (!(await hasAccess(user))) redirect("/app/billing?required=1");
  return user;
}

export function isAdmin(user: { email: string }): boolean {
  return env.adminEmails.includes(user.email.toLowerCase());
}

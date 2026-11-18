import { db } from "@server/lib/db";
import { apiUser, handle, HttpError, json } from "@server/lib/api";

type Ctx = { params: Promise<{ id: string }> };

/** Disconnects an account. Its pending posts are canceled; published history is kept with the account removed. */
export const DELETE = handle(async (_req: Request, { params }: Ctx) => {
  const user = await apiUser();
  const { id } = await params;
  const acc = await db.socialAccount.findFirst({ where: { id, userId: user.id } });
  if (!acc) throw new HttpError(404, "Account not found.");
  await db.$transaction([
    db.post.updateMany({
      where: { accountId: id, status: { in: ["queued", "scheduled"] } },
      data: { status: "canceled", error: "Account disconnected." },
    }),
    db.socialAccount.delete({ where: { id } }),
  ]);
  return json({ ok: true });
});

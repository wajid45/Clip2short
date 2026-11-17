import { z } from "zod";
import { db } from "@/lib/db";
import { apiUser, handle, json, parseBody } from "@/lib/api";
import { CLIP_STATUSES } from "@/lib/clips";

const Body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("status"), ids: z.array(z.string()).min(1).max(1000), status: z.enum(CLIP_STATUSES) }),
  z.object({ action: z.literal("delete"), ids: z.array(z.string()).min(1).max(1000) }),
]);

export const POST = handle(async (req: Request) => {
  const user = await apiUser();
  const body = await parseBody(req, Body);
  const where = { id: { in: body.ids }, userId: user.id };
  if (body.action === "delete") {
    const { count } = await db.clip.deleteMany({ where });
    return json({ count });
  }
  const { count } = await db.clip.updateMany({ where, data: { status: body.status } });
  return json({ count });
});

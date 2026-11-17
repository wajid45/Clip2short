import { z } from "zod";
import { db } from "@/lib/db";
import { apiUser, handle, HttpError, json, parseBody } from "@/lib/api";
import { isAdmin } from "@/lib/auth";
import { encrypt } from "@/lib/crypto";
import { INTEGRATIONS, loadIntegrations } from "@/lib/integrations";

const ids = INTEGRATIONS.map((i) => i.id) as [string, ...string[]];

const Save = z.object({
  id: z.enum(ids),
  clientId: z.string().trim().min(3, "Enter the client/app ID").max(300),
  /** Omit or leave empty to keep the stored secret. */
  clientSecret: z.string().trim().max(500).optional(),
});
const Remove = z.object({ id: z.enum(ids) });

async function admin() {
  const user = await apiUser();
  if (!isAdmin(user)) throw new HttpError(404, "Not found");
}

export const POST = handle(async (req: Request) => {
  await admin();
  const body = await parseBody(req, Save);
  const existing = await db.integrationSetting.findUnique({ where: { id: body.id } });
  const info = INTEGRATIONS.find((i) => i.id === body.id)!;
  const secretEnc = body.clientSecret ? encrypt(body.clientSecret) : (existing?.clientSecretEnc ?? null);
  if (!secretEnc && !info.secretOptional) throw new HttpError(400, `Enter the ${info.secretLabel.toLowerCase()}.`);
  await db.integrationSetting.upsert({
    where: { id: body.id },
    create: { id: body.id, clientId: body.clientId, clientSecretEnc: secretEnc },
    update: { clientId: body.clientId, clientSecretEnc: secretEnc },
  });
  await loadIntegrations(true);
  return json({ ok: true });
});

export const DELETE = handle(async (req: Request) => {
  await admin();
  const { id } = await parseBody(req, Remove);
  await db.integrationSetting.deleteMany({ where: { id } });
  await loadIntegrations(true);
  return json({ ok: true });
});

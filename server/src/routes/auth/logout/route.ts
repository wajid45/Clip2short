import { destroySession } from "@server/lib/session";
import { json } from "@server/lib/api";

export async function POST() {
  await destroySession();
  return json({ ok: true });
}

import { SignJWT, jwtVerify } from "jose";
import { deleteCookie, getCookie, setCookie } from "../http/context";
import { requireSecret, env } from "./env";

export const SESSION_COOKIE = "sl_session";
const MAX_AGE = 60 * 60 * 24 * 30; // 30 days

function secret() {
  return new TextEncoder().encode(requireSecret("sessionSecret"));
}

export async function createSession(userId: string) {
  const token = await new SignJWT({ sub: userId })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE}s`)
    .sign(secret());
  setCookie(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: env.isProd,
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE,
  });
}

export async function destroySession() {
  deleteCookie(SESSION_COOKIE);
}

export async function readSessionUserId(): Promise<string | null> {
  const token = getCookie(SESSION_COOKIE);
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret(), { algorithms: ["HS256"] });
    return typeof payload.sub === "string" ? payload.sub : null;
  } catch {
    return null;
  }
}

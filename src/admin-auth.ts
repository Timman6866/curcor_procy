import { createHmac, timingSafeEqual } from "node:crypto";

const SESSION_COOKIE = "admin_session";
const SESSION_TTL_MS = 24 * 60 * 60 * 1000;

export interface AdminSession {
  username: string;
  expiresAt: number;
}

function encodeBase64Url(value: string): string {
  return Buffer.from(value, "utf8").toString("base64url");
}

function decodeBase64Url(value: string): string {
  return Buffer.from(value, "base64url").toString("utf8");
}

function signPayload(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

export function createSessionToken(
  username: string,
  secret: string,
  now = Date.now(),
): string {
  const session: AdminSession = {
    username,
    expiresAt: now + SESSION_TTL_MS,
  };
  const payload = encodeBase64Url(JSON.stringify(session));
  return `${payload}.${signPayload(payload, secret)}`;
}

export function verifySessionToken(
  token: string | undefined,
  secret: string,
  now = Date.now(),
): AdminSession | null {
  if (!token) return null;

  const [payload, signature] = token.split(".");
  if (!payload || !signature) return null;

  const expected = signPayload(payload, secret);
  const actual = Buffer.from(signature, "utf8");
  const expectedBuf = Buffer.from(expected, "utf8");
  if (actual.length !== expectedBuf.length || !timingSafeEqual(actual, expectedBuf)) {
    return null;
  }

  try {
    const session = JSON.parse(decodeBase64Url(payload)) as AdminSession;
    if (
      typeof session.username !== "string" ||
      typeof session.expiresAt !== "number" ||
      session.expiresAt <= now
    ) {
      return null;
    }
    return session;
  } catch {
    return null;
  }
}

export function sessionCookieOptions(secure: boolean) {
  return {
    path: "/admin",
    httpOnly: true,
    sameSite: "lax" as const,
    secure,
    maxAge: SESSION_TTL_MS / 1000,
  };
}

export function readSessionCookie(cookieHeader: string | undefined): string | undefined {
  if (!cookieHeader) return undefined;
  for (const part of cookieHeader.split(";")) {
    const [name, ...rest] = part.trim().split("=");
    if (name === SESSION_COOKIE) {
      return decodeURIComponent(rest.join("="));
    }
  }
  return undefined;
}

export function sessionCookieName(): string {
  return SESSION_COOKIE;
}

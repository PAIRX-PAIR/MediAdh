import "server-only";
import { jwtVerify, SignJWT } from "jose";
import { cookies } from "next/headers";
import { isProduction, sessionSecret } from "../env";

/** `__Host-` binds the cookie to this exact origin over HTTPS with Path=/. */
export const SESSION_COOKIE = isProduction ? "__Host-smi_session" : "smi_session";
const SESSION_DAYS = 30;
/** Tokens older than this are re-issued on activity (sliding expiration). */
const RENEW_AFTER_SECONDS = 7 * 24 * 3600;
const ISSUER = "smi-taller";
const AUDIENCE = "smi-taller-app";

export interface SessionClaims {
  sub: string;
  /** Must match the user's sessionVersion; bumping it revokes all sessions. */
  sv: number;
  iat: number;
  exp: number;
}

export async function createSessionToken(userId: string, sessionVersion: number): Promise<string> {
  return new SignJWT({ sv: sessionVersion })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject(userId)
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DAYS}d`)
    .sign(sessionSecret());
}

export async function verifySessionToken(token: string): Promise<SessionClaims | null> {
  try {
    const { payload } = await jwtVerify(token, sessionSecret(), {
      algorithms: ["HS256"],
      issuer: ISSUER,
      audience: AUDIENCE,
      requiredClaims: ["sub", "exp", "iat", "sv"],
      maxTokenAge: `${SESSION_DAYS}d`,
    });
    if (typeof payload.sub !== "string" || typeof payload.sv !== "number") return null;
    return { sub: payload.sub, sv: payload.sv, iat: payload.iat!, exp: payload.exp! };
  } catch {
    return null;
  }
}

export function shouldRenew(claims: SessionClaims): boolean {
  return Math.floor(Date.now() / 1000) - claims.iat > RENEW_AFTER_SECONDS;
}

export async function setSessionCookie(token: string) {
  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: isProduction,
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_DAYS * 24 * 3600,
    priority: "high",
  });
}

export async function clearSessionCookie() {
  const store = await cookies();
  store.set(SESSION_COOKIE, "", {
    httpOnly: true,
    secure: isProduction,
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
}

export async function readSessionToken(): Promise<string | null> {
  const store = await cookies();
  return store.get(SESSION_COOKIE)?.value ?? null;
}

/**
 * "Trusted browser": a signed cookie set at every successful login. While an
 * account is locked by failed attempts (anyone can trigger that by guessing its
 * username), the real owner can still sign in from a browser that has it. The
 * password is always verified, so this only lifts the lockout.
 */
export const TRUST_COOKIE = isProduction ? "__Host-smi_trust" : "smi_trust";
const TRUST_DAYS = 90;
const TRUST_AUDIENCE = "smi-taller-trust";

export async function setTrustCookie(userId: string) {
  const token = await new SignJWT({})
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject(userId)
    .setIssuer(ISSUER)
    .setAudience(TRUST_AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(`${TRUST_DAYS}d`)
    .sign(sessionSecret());
  const store = await cookies();
  store.set(TRUST_COOKIE, token, { httpOnly: true, secure: isProduction, sameSite: "lax", path: "/", maxAge: TRUST_DAYS * 24 * 3600 });
}

export async function isTrustedFor(userId: string): Promise<boolean> {
  try {
    const raw = (await cookies()).get(TRUST_COOKIE)?.value;
    if (!raw) return false;
    const { payload } = await jwtVerify(raw, sessionSecret(), { algorithms: ["HS256"], issuer: ISSUER, audience: TRUST_AUDIENCE });
    return payload.sub === userId;
  } catch {
    // No request context (tests) or an invalid cookie.
    return false;
  }
}

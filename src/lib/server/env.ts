import "server-only";

/**
 * Server configuration. Values are read lazily so `next build` works without
 * secrets; a missing secret fails the request that needs it with a clear message.
 */

export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfigError";
  }
}

export type DataBackend = "github" | "file" | "memory";

export const isProduction = process.env.NODE_ENV === "production";

export function dataBackend(): DataBackend {
  const explicit = process.env.DATA_BACKEND?.trim();
  if (explicit === "github" || explicit === "file" || explicit === "memory") return explicit;
  if (process.env.GITHUB_DATA_TOKEN) return "github";
  return isProduction ? "memory" : "file";
}

/** Demo mode: in-memory data seeded with sample records, public demo credentials. */
export function isDemoMode(): boolean {
  return dataBackend() === "memory" && process.env.DEMO_SEED !== "off";
}

export function githubConfig() {
  const repoSpec = process.env.GITHUB_DATA_REPO?.trim();
  const token = process.env.GITHUB_DATA_TOKEN?.trim();
  if (!repoSpec || !token) {
    throw new ConfigError("Faltan GITHUB_DATA_REPO (dueño/repositorio) o GITHUB_DATA_TOKEN.");
  }
  const [owner, repo, ...rest] = repoSpec.split("/");
  if (!owner || !repo || rest.length > 0) {
    throw new ConfigError("GITHUB_DATA_REPO debe tener la forma dueño/repositorio.");
  }
  return {
    owner,
    repo,
    token,
    branch: process.env.GITHUB_DATA_BRANCH?.trim() || "main",
  };
}

let devSecretWarned = false;
const devSecret = "dev-only-insecure-session-secret-change-me-0123456789";

/** HMAC key for session tokens. Must be >= 32 random bytes in production. */
export function sessionSecret(): Uint8Array {
  const value = process.env.SESSION_SECRET?.trim();
  if (value && value.length >= 32) return new TextEncoder().encode(value);
  if (isProduction) {
    throw new ConfigError("SESSION_SECRET no está configurado (mínimo 32 caracteres aleatorios).");
  }
  if (!devSecretWarned) {
    devSecretWarned = true;
    console.warn("[smi] SESSION_SECRET no configurado: usando un secreto de desarrollo inseguro.");
  }
  return new TextEncoder().encode(devSecret);
}

export function vapidConfig() {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim() || process.env.VAPID_PUBLIC_KEY?.trim();
  const privateKey = process.env.VAPID_PRIVATE_KEY?.trim();
  const subject = process.env.VAPID_SUBJECT?.trim();
  if (!publicKey || !privateKey || !subject) return null;
  if (!/^(mailto:|https:\/\/)/.test(subject)) return null;
  return { publicKey, privateKey, subject };
}

/**
 * Origins allowed to send state-changing requests. Defaults to the request's
 * own origin; APP_ORIGINS adds extra ones (comma separated), e.g. a custom domain.
 */
export function extraAllowedOrigins(): string[] {
  return (process.env.APP_ORIGINS ?? "")
    .split(",")
    .map((s) => s.trim().replace(/\/$/, ""))
    .filter(Boolean);
}

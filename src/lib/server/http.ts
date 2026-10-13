import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { ConfigError, extraAllowedOrigins } from "./env";
import { StoreUnavailableError } from "./store/raw";

export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly code: string = "error",
    readonly retryAfterSeconds?: number,
  ) {
    super(message);
    this.name = "HttpError";
  }
}

export const badRequest = (message: string, code = "bad_request") => new HttpError(400, message, code);
export const unauthorized = (message = "Inicia sesión para continuar.", code = "unauthorized") => new HttpError(401, message, code);
export const forbidden = (message = "No tienes permiso para esta acción.", code = "forbidden") => new HttpError(403, message, code);
export const notFound = (message = "No encontrado.") => new HttpError(404, message, "not_found");
export const conflict = (message: string, code = "conflict") => new HttpError(409, message, code);
export const tooMany = (retryAfterSeconds: number, message = "Demasiados intentos. Espera un momento.") =>
  new HttpError(429, message, "rate_limited", retryAfterSeconds);

const MAX_BODY_BYTES = 64 * 1024;

const NO_STORE = { "Cache-Control": "no-store, max-age=0", "X-Content-Type-Options": "nosniff" };

export function json<T>(data: T, init: { status?: number; headers?: Record<string, string> } = {}) {
  return NextResponse.json(data, { status: init.status ?? 200, headers: { ...NO_STORE, ...init.headers } });
}

/**
 * CSRF defence for Route Handlers (Next.js gives them none): state-changing
 * requests must come from our own origin according to Fetch Metadata, falling
 * back to the Origin header, and must carry a JSON body.
 */
export function assertSameOrigin(req: NextRequest) {
  const site = req.headers.get("sec-fetch-site");
  if (site && site !== "same-origin") throw forbidden("Solicitud bloqueada por seguridad (origen cruzado).", "csrf");

  const origin = req.headers.get("origin");
  if (!origin) {
    if (site === "same-origin") return;
    throw forbidden("Solicitud bloqueada por seguridad (sin origen).", "csrf");
  }
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  const proto = req.headers.get("x-forwarded-proto") ?? req.nextUrl.protocol.replace(":", "");
  const allowed = new Set([`${proto}://${host}`, req.nextUrl.origin, ...extraAllowedOrigins()]);
  if (!allowed.has(origin.replace(/\/$/, ""))) {
    throw forbidden("Solicitud bloqueada por seguridad (origen no permitido).", "csrf");
  }
}

export async function readJson<S extends z.ZodTypeAny>(req: NextRequest, schema: S): Promise<z.infer<S>> {
  const type = req.headers.get("content-type") ?? "";
  if (!type.toLowerCase().startsWith("application/json")) {
    throw new HttpError(415, "El cuerpo debe ser JSON.", "unsupported_media_type");
  }
  const length = Number(req.headers.get("content-length") ?? "0");
  if (length > MAX_BODY_BYTES) throw new HttpError(413, "Solicitud demasiado grande.", "too_large");

  const text = await req.text();
  if (text.length > MAX_BODY_BYTES) throw new HttpError(413, "Solicitud demasiado grande.", "too_large");
  let body: unknown;
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    throw badRequest("JSON inválido.");
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const field = issue?.path.join(".");
    throw new HttpError(422, field ? `${field}: ${issue?.message}` : (issue?.message ?? "Datos inválidos."), "validation");
  }
  return parsed.data;
}

export function errorResponse(error: unknown) {
  if (error instanceof HttpError) {
    const headers: Record<string, string> = {};
    if (error.retryAfterSeconds) headers["Retry-After"] = String(error.retryAfterSeconds);
    return json({ error: error.message, code: error.code }, { status: error.status, headers });
  }
  if (error instanceof StoreUnavailableError) {
    console.error("[smi] store", error.message);
    const headers: Record<string, string> = {};
    if (error.retryAfterSeconds) headers["Retry-After"] = String(error.retryAfterSeconds);
    return json(
      { error: "La base de datos no está disponible en este momento. Intenta de nuevo.", code: "store_unavailable" },
      { status: 503, headers },
    );
  }
  if (error instanceof ConfigError) {
    console.error("[smi] config", error.message);
    return json({ error: "La aplicación no está configurada correctamente.", code: "config" }, { status: 500 });
  }
  console.error("[smi] unexpected", error);
  return json({ error: "Error inesperado.", code: "internal" }, { status: 500 });
}

/** Common string validators for user input. */
export const text = (max: number) =>
  z
    .string()
    .transform((s) => s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").trim())
    .pipe(z.string().max(max, `Máximo ${max} caracteres`));

export const requiredText = (max: number) => text(max).pipe(z.string().min(1, "Campo obligatorio"));

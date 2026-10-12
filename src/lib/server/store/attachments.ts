import "server-only";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { dataBackend, githubConfig, isDemoMode } from "../env";
import { StoreUnavailableError } from "./raw";

/**
 * Binary files (drawings, photos, PDFs). Kept apart from the JSON documents so
 * a future move to Vercel Blob or S3 only means another implementation.
 */
export interface AttachmentStore {
  readonly kind: "github" | "file" | "memory";
  /** Stores `bytes` at `filePath`; returns a backend reference used to read it back. */
  put(filePath: string, bytes: Uint8Array, message: string): Promise<{ ref: string | null }>;
  get(filePath: string, ref: string | null): Promise<Uint8Array | null>;
  remove(filePath: string, ref: string | null, message: string): Promise<void>;
}

const API_VERSION = "2022-11-28";
const TIMEOUT_MS = 30_000;

/**
 * Same private data repository, through the Contents API (one commit per
 * file). Reads go through the immutable git blob, so they are never stale.
 */
export class GitHubAttachmentStore implements AttachmentStore {
  readonly kind = "github" as const;
  constructor(
    private readonly cfg: { owner: string; repo: string; branch: string; token: string },
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  private url(p: string) {
    return `https://api.github.com/repos/${encodeURIComponent(this.cfg.owner)}/${encodeURIComponent(this.cfg.repo)}${p}`;
  }

  private headers(extra: Record<string, string> = {}) {
    return {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${this.cfg.token}`,
      "X-GitHub-Api-Version": API_VERSION,
      "User-Agent": "smi-taller-app",
      ...extra,
    };
  }

  async put(filePath: string, bytes: Uint8Array, message: string) {
    const res = await this.fetchImpl(this.url(`/contents/${filePath.split("/").map(encodeURIComponent).join("/")}`), {
      method: "PUT",
      headers: this.headers({ "Content-Type": "application/json" }),
      body: JSON.stringify({
        message,
        content: Buffer.from(bytes).toString("base64"),
        branch: this.cfg.branch,
        committer: { name: "SMI Taller", email: "taller-bot@users.noreply.github.com" },
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    }).catch((error: Error) => {
      throw new StoreUnavailableError(`No se pudo subir el archivo: ${error.message}`);
    });
    if (!res.ok) throw new StoreUnavailableError(`GitHub respondió ${res.status} al guardar el archivo.`, res.status === 429 ? 60 : null);
    const body = (await res.json()) as { content?: { sha?: string } };
    return { ref: body.content?.sha ?? null };
  }

  async get(_filePath: string, ref: string | null) {
    if (!ref) return null;
    const res = await this.fetchImpl(this.url(`/git/blobs/${encodeURIComponent(ref)}`), {
      headers: this.headers(),
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    }).catch((error: Error) => {
      throw new StoreUnavailableError(`No se pudo leer el archivo: ${error.message}`);
    });
    if (res.status === 404) return null;
    if (!res.ok) throw new StoreUnavailableError(`GitHub respondió ${res.status} al leer el archivo.`);
    const body = (await res.json()) as { content: string; encoding: string };
    return new Uint8Array(Buffer.from(body.content, body.encoding === "base64" ? "base64" : "utf8"));
  }

  async remove(filePath: string, ref: string | null, message: string) {
    if (!ref) return;
    const res = await this.fetchImpl(this.url(`/contents/${filePath.split("/").map(encodeURIComponent).join("/")}`), {
      method: "DELETE",
      headers: this.headers({ "Content-Type": "application/json" }),
      body: JSON.stringify({ message, sha: ref, branch: this.cfg.branch }),
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    // Already gone is fine; anything else is logged by the caller.
    if (!res.ok && res.status !== 404) throw new StoreUnavailableError(`GitHub respondió ${res.status} al borrar el archivo.`);
  }
}

/** Local development: files under .data/. */
export class FileAttachmentStore implements AttachmentStore {
  readonly kind = "file" as const;
  constructor(private readonly root: string) {}

  private resolve(p: string) {
    const full = path.resolve(this.root, p);
    if (!full.startsWith(path.resolve(this.root) + path.sep)) throw new Error("Ruta inválida");
    return full;
  }

  async put(filePath: string, bytes: Uint8Array) {
    const full = this.resolve(filePath);
    await mkdir(path.dirname(full), { recursive: true });
    await writeFile(full, bytes);
    return { ref: null };
  }

  async get(filePath: string) {
    try {
      return new Uint8Array(await readFile(this.resolve(filePath)));
    } catch {
      return null;
    }
  }

  async remove(filePath: string) {
    await rm(this.resolve(filePath), { force: true });
  }
}

/** Demo/tests: capped in-memory storage. */
export class MemoryAttachmentStore implements AttachmentStore {
  readonly kind = "memory" as const;
  private files = new Map<string, Uint8Array>();
  constructor(private readonly maxBytes = 40 * 1024 * 1024) {}

  private used() {
    let total = 0;
    for (const f of this.files.values()) total += f.byteLength;
    return total;
  }

  async put(filePath: string, bytes: Uint8Array) {
    if (this.used() + bytes.byteLength > this.maxBytes) {
      throw new StoreUnavailableError("La demostración llegó a su límite de archivos. Se reinicia con el servidor.");
    }
    this.files.set(filePath, bytes);
    return { ref: null };
  }

  async get(filePath: string) {
    return this.files.get(filePath) ?? null;
  }

  async remove(filePath: string) {
    this.files.delete(filePath);
  }
}

const globalForFiles = globalThis as unknown as { __smiFiles?: AttachmentStore };

export function getAttachmentStore(): AttachmentStore {
  if (globalForFiles.__smiFiles) return globalForFiles.__smiFiles;
  const backend = dataBackend();
  let store: AttachmentStore;
  if (backend === "github") store = new GitHubAttachmentStore(githubConfig());
  else if (backend === "file") store = new FileAttachmentStore(path.join(process.cwd(), ".data"));
  else store = new MemoryAttachmentStore(isDemoMode() ? 40 * 1024 * 1024 : 200 * 1024 * 1024);
  globalForFiles.__smiFiles = store;
  return store;
}

export function setAttachmentStoreForTests(store: AttachmentStore | undefined) {
  globalForFiles.__smiFiles = store;
}

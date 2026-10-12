import { gitBlobSha } from "./hash";
import { ConflictError, StoreUnavailableError, type RawEntry, type RawSnapshot, type RawStore } from "./raw";

export interface GitHubStoreConfig {
  owner: string;
  repo: string;
  branch: string;
  token: string;
  /** Committer shown in the data repository history. */
  committerName?: string;
  committerEmail?: string;
  apiBase?: string;
  fetchImpl?: typeof fetch;
}

const API_VERSION = "2022-11-28";
/**
 * Reuse a verified branch head for this long before revalidating. Conditional
 * requests answered with 304 do not count against the primary rate limit.
 */
const HEAD_TTL_MS = 3000;
/** GitHub recommends at most ~6 pushes per minute per repository and >=1 s between writes. */
const MIN_WRITE_SPACING_MS = 1000;
const MAX_SUPERSEDED = 200;
const REQUEST_TIMEOUT_MS = 12_000;
const MAX_CACHED_BLOBS = 300;
const MAX_CACHED_TREES = 20;

interface HeadState {
  sha: string | null;
  etag: string | null;
  checkedAt: number;
}

interface TreeState {
  treeSha: string;
  blobs: Map<string, string>;
}

/**
 * Private GitHub repository used as a document database through the Git Data
 * API. Reads are consistent snapshots of one commit; writes create a single
 * commit touching several files and move the branch with `force: false`, so a
 * concurrent writer makes the update fail as a non-fast-forward (422) and the
 * caller retries on top of the new head (optimistic concurrency).
 */
export class GitHubRawStore implements RawStore {
  readonly kind = "github" as const;
  private head: HeadState | null = null;
  private trees = new Map<string, TreeState>();
  private blobs = new Map<string, string>();
  private writeQueue: Promise<unknown> = Promise.resolve();
  private lastWriteAt = 0;
  /**
   * Commits this instance knows are older than its current head. GitHub gives no
   * read-after-write guarantee, so a lagging replica may still report one of
   * them; such answers are ignored instead of rolling data back.
   */
  private superseded = new Set<string>();
  private readonly fetchImpl: typeof fetch;
  private readonly base: string;

  constructor(private readonly cfg: GitHubStoreConfig) {
    this.fetchImpl = cfg.fetchImpl ?? fetch;
    this.base = `${cfg.apiBase ?? "https://api.github.com"}/repos/${encodeURIComponent(cfg.owner)}/${encodeURIComponent(cfg.repo)}`;
  }

  private async api(
    method: string,
    path: string,
    body?: unknown,
    extraHeaders: Record<string, string> = {},
  ): Promise<Response> {
    let res: Response;
    try {
      res = await this.fetchImpl(`${this.base}${path}`, {
        method,
        headers: {
          Accept: "application/vnd.github+json",
          Authorization: `Bearer ${this.cfg.token}`,
          "X-GitHub-Api-Version": API_VERSION,
          "User-Agent": "smi-taller-app",
          ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
          ...extraHeaders,
        },
        body: body !== undefined ? JSON.stringify(body) : undefined,
        cache: "no-store",
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (error) {
      throw new StoreUnavailableError(`No se pudo contactar GitHub: ${(error as Error).message}`);
    }

    if (res.status === 429 || (res.status === 403 && res.headers.get("x-ratelimit-remaining") === "0")) {
      const retryAfter = Number(res.headers.get("retry-after"));
      const reset = Number(res.headers.get("x-ratelimit-reset"));
      const wait = Number.isFinite(retryAfter) && retryAfter > 0
        ? retryAfter
        : Number.isFinite(reset) && reset > 0
          ? Math.max(1, reset - Math.floor(Date.now() / 1000))
          : 60;
      throw new StoreUnavailableError("Límite de uso de GitHub alcanzado. Intenta de nuevo en un momento.", wait);
    }
    if (res.status === 401) {
      throw new StoreUnavailableError("El token de la base de datos (GITHUB_DATA_TOKEN) es inválido o expiró.");
    }
    if (res.status === 403 && (await peekMessage(res)).toLowerCase().includes("secondary rate limit")) {
      throw new StoreUnavailableError("GitHub limitó temporalmente las escrituras. Intenta de nuevo en un minuto.", 60);
    }
    return res;
  }

  private async json<T>(res: Response, what: string): Promise<T> {
    if (!res.ok) {
      throw new StoreUnavailableError(`GitHub respondió ${res.status} al ${what}: ${await peekMessage(res)}`);
    }
    return (await res.json()) as T;
  }

  /** Current branch head commit, or null when the repository/branch is empty. */
  private async getHead(fresh: boolean): Promise<string | null> {
    const now = Date.now();
    if (!fresh && this.head && now - this.head.checkedAt < HEAD_TTL_MS) return this.head.sha;

    const headers: Record<string, string> = {};
    if (this.head?.etag) headers["If-None-Match"] = this.head.etag;
    const res = await this.api("GET", `/git/ref/heads/${encodeURIComponent(this.cfg.branch)}`, undefined, headers);

    if (res.status === 304 && this.head) {
      this.head.checkedAt = now;
      return this.head.sha;
    }
    if (res.status === 404 || res.status === 409) {
      this.head = { sha: null, etag: null, checkedAt: now };
      return null;
    }
    const data = await this.json<{ object: { sha: string } }>(res, "leer la rama de datos");
    if (this.head?.sha && this.superseded.has(data.object.sha)) {
      // Stale replica: keep the newer head we already know about.
      this.head.checkedAt = now;
      return this.head.sha;
    }
    if (this.head?.sha && this.head.sha !== data.object.sha) this.markSuperseded(this.head.sha);
    this.head = { sha: data.object.sha, etag: res.headers.get("etag"), checkedAt: now };
    return data.object.sha;
  }

  private async getTree(commitSha: string): Promise<TreeState> {
    const cached = this.trees.get(commitSha);
    if (cached) return cached;

    const commit = await this.json<{ tree: { sha: string } }>(
      await this.api("GET", `/git/commits/${commitSha}`),
      "leer el commit",
    );
    const tree = await this.json<{ truncated: boolean; tree: Array<{ path: string; type: string; sha: string }> }>(
      await this.api("GET", `/git/trees/${commit.tree.sha}?recursive=1`),
      "leer el árbol de archivos",
    );
    if (tree.truncated) throw new StoreUnavailableError("El repositorio de datos tiene demasiados archivos.");

    const blobs = new Map<string, string>();
    for (const entry of tree.tree) if (entry.type === "blob") blobs.set(entry.path, entry.sha);
    const state = { treeSha: commit.tree.sha, blobs };
    this.rememberTree(commitSha, state);
    return state;
  }

  private markSuperseded(sha: string) {
    this.superseded.add(sha);
    while (this.superseded.size > MAX_SUPERSEDED) this.superseded.delete(this.superseded.values().next().value!);
  }

  private rememberTree(commitSha: string, state: TreeState) {
    this.trees.set(commitSha, state);
    while (this.trees.size > MAX_CACHED_TREES) this.trees.delete(this.trees.keys().next().value!);
  }

  private rememberBlob(sha: string, text: string) {
    this.blobs.delete(sha);
    this.blobs.set(sha, text);
    while (this.blobs.size > MAX_CACHED_BLOBS) this.blobs.delete(this.blobs.keys().next().value!);
  }

  private async getBlob(sha: string): Promise<string> {
    const cached = this.blobs.get(sha);
    if (cached !== undefined) return cached;
    const blob = await this.json<{ content: string; encoding: string }>(
      await this.api("GET", `/git/blobs/${sha}`),
      "leer un archivo de datos",
    );
    const text = blob.encoding === "base64" ? Buffer.from(blob.content, "base64").toString("utf8") : blob.content;
    this.rememberBlob(sha, text);
    return text;
  }

  async read(paths: string[], opts: { fresh?: boolean } = {}): Promise<RawSnapshot> {
    const head = await this.getHead(Boolean(opts.fresh));
    const files = new Map<string, RawEntry | undefined>();
    if (head === null) {
      for (const p of paths) files.set(p, undefined);
      return { version: "empty", files };
    }
    const tree = await this.getTree(head);
    await Promise.all(
      paths.map(async (p) => {
        const sha = tree.blobs.get(p);
        files.set(p, sha ? { text: await this.getBlob(sha), sha } : undefined);
      }),
    );
    return { version: head, files };
  }

  write(baseVersion: string, changes: Map<string, string | null>, message: string): Promise<string> {
    // Serialise this instance's writes so they do not conflict with each other.
    const run = () => this.commit(baseVersion, changes, message);
    const result = this.writeQueue.then(run, run);
    this.writeQueue = result.catch(() => undefined);
    return result;
  }

  private async commit(baseVersion: string, changes: Map<string, string | null>, message: string): Promise<string> {
    if (baseVersion === "empty") {
      await this.initialiseEmptyRepository();
      throw new ConflictError("Repositorio de datos inicializado");
    }
    const wait = this.lastWriteAt + MIN_WRITE_SPACING_MS - Date.now();
    if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
    const base = await this.getTree(baseVersion);

    const entries = [...changes].map(([path, text]) =>
      text === null
        ? { path, mode: "100644", type: "blob", sha: null }
        : { path, mode: "100644", type: "blob", content: text },
    );
    const tree = await this.json<{ sha: string }>(
      await this.api("POST", "/git/trees", { base_tree: base.treeSha, tree: entries }),
      "crear el árbol",
    );
    const committer = {
      name: this.cfg.committerName ?? "SMI Taller",
      email: this.cfg.committerEmail ?? "taller-bot@users.noreply.github.com",
    };
    const commit = await this.json<{ sha: string }>(
      await this.api("POST", "/git/commits", {
        message,
        tree: tree.sha,
        parents: [baseVersion],
        author: committer,
        committer,
      }),
      "crear el commit",
    );

    const res = await this.api("PATCH", `/git/refs/heads/${encodeURIComponent(this.cfg.branch)}`, {
      sha: commit.sha,
      force: false,
    });
    if (res.status === 422 || res.status === 409) {
      // Not a fast-forward: someone else committed first. Our base is now old.
      this.markSuperseded(baseVersion);
      if (this.head) this.head.checkedAt = 0;
      throw new ConflictError();
    }
    await this.json(res, "actualizar la rama de datos");

    // Seed caches with what we just wrote so this instance never reads stale data.
    const blobs = new Map(base.blobs);
    for (const [path, text] of changes) {
      if (text === null) {
        blobs.delete(path);
        continue;
      }
      const sha = gitBlobSha(text);
      blobs.set(path, sha);
      this.rememberBlob(sha, text);
    }
    this.rememberTree(commit.sha, { treeSha: tree.sha, blobs });
    this.markSuperseded(baseVersion);
    this.head = { sha: commit.sha, etag: null, checkedAt: Date.now() };
    this.lastWriteAt = Date.now();
    return commit.sha;
  }

  /** The Git Data API rejects empty repositories; the Contents API can create the first commit. */
  private async initialiseEmptyRepository() {
    const content = Buffer.from(
      "# Base de datos del taller\n\nArchivos JSON administrados por la aplicación. No editar a mano.\n",
      "utf8",
    ).toString("base64");
    const res = await this.api("PUT", "/contents/README.md", {
      message: "Inicializa la base de datos del taller",
      content,
      branch: this.cfg.branch,
    });
    // 422 means the file already exists: someone initialised it concurrently.
    if (!res.ok && res.status !== 422) await this.json(res, "inicializar el repositorio de datos");
    this.head = null;
  }
}

async function peekMessage(res: Response): Promise<string> {
  try {
    const body = (await res.clone().json()) as { message?: string };
    return body.message ?? res.statusText;
  } catch {
    return res.statusText;
  }
}

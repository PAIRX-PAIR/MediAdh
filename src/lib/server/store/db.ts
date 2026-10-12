import { COLLECTIONS, settingsSchema, type Database, type DocName } from "@/lib/domain/schema";
import { defaultDoc } from "@/lib/domain/defaults";
import { ConflictError, StoreUnavailableError, type RawStore } from "./raw";

const DATA_DIR = "data";
const MAX_ATTEMPTS = 6;

export function docPath(name: DocName): string {
  return `${DATA_DIR}/${name}.json`;
}

type Docs<K extends DocName> = { [P in K]: Database[P] };

/** Typed, validated access to the document database on top of any RawStore. */
export class Db {
  /** Parsed documents keyed by `${name}:${sha}`; parsing is the expensive part. */
  private parsed = new Map<string, unknown>();

  private ready: Promise<void> | null = null;

  /** `init` runs once before the first access (e.g. seeding the demo data). */
  constructor(
    readonly raw: RawStore,
    private readonly init?: (raw: RawStore) => Promise<void>,
  ) {}

  private ensureReady(): Promise<void> {
    if (!this.init) return Promise.resolve();
    this.ready ??= this.init(this.raw).catch((error) => {
      this.ready = null;
      throw error;
    });
    return this.ready;
  }

  get backend() {
    return this.raw.kind;
  }

  private parse<K extends DocName>(name: K, text: string | undefined, sha: string | undefined, now: string): Database[K] {
    if (text === undefined) return defaultDoc(name, now);
    const key = `${name}:${sha}`;
    let value = this.parsed.get(key);
    if (value === undefined) {
      let json: unknown;
      try {
        json = JSON.parse(text);
      } catch {
        throw new StoreUnavailableError(`El archivo ${docPath(name)} no es JSON válido.`);
      }
      const schema = name === "settings" ? settingsSchema : COLLECTIONS[name as Exclude<DocName, "settings">];
      const result = schema.safeParse(json);
      if (!result.success) {
        throw new StoreUnavailableError(`El archivo ${docPath(name)} tiene un formato inválido: ${result.error.issues[0]?.message}`);
      }
      value = result.data;
      this.parsed.set(key, value);
      if (this.parsed.size > 200) this.parsed.delete(this.parsed.keys().next().value!);
    }
    // Callers get their own copy; cached objects are never handed out.
    return structuredClone(value) as Database[K];
  }

  async read<K extends DocName>(names: K[], opts: { fresh?: boolean } = {}): Promise<Docs<K>> {
    await this.ensureReady();
    const snapshot = await this.raw.read(names.map(docPath), opts);
    const now = new Date().toISOString();
    const out = {} as Docs<K>;
    for (const name of names) {
      const entry = snapshot.files.get(docPath(name));
      out[name] = this.parse(name, entry?.text, entry?.sha, now);
    }
    return out;
  }

  /**
   * Read `names`, let `fn` mutate the drafts, and atomically persist the
   * documents that changed. `fn` must be safe to re-run: on a concurrent write
   * the whole transaction is retried on top of fresh data.
   */
  async transact<K extends DocName, R>(
    names: K[],
    message: string,
    fn: (docs: Docs<K>) => R | Promise<R>,
  ): Promise<R> {
    await this.ensureReady();
    let lastError: unknown;
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      const snapshot = await this.raw.read(names.map(docPath), { fresh: attempt > 0 });
      const now = new Date().toISOString();
      const docs = {} as Docs<K>;
      const before = new Map<DocName, string>();
      for (const name of names) {
        const entry = snapshot.files.get(docPath(name));
        docs[name] = this.parse(name, entry?.text, entry?.sha, now);
        before.set(name, entry?.text ?? "");
      }

      const result = await fn(docs);

      const changes = new Map<string, string | null>();
      for (const name of names) {
        const text = `${JSON.stringify(docs[name], null, 2)}\n`;
        if (text !== before.get(name)) changes.set(docPath(name), text);
      }
      if (changes.size === 0) return result;

      try {
        await this.raw.write(snapshot.version, changes, message);
        return result;
      } catch (error) {
        if (!(error instanceof ConflictError)) throw error;
        lastError = error;
        await sleep(Math.min(2000, 80 * 2 ** attempt) + Math.floor(Math.random() * 120));
      }
    }
    throw new StoreUnavailableError(
      `Demasiadas escrituras simultáneas; intenta de nuevo. (${(lastError as Error)?.message ?? "conflicto"})`,
      2,
    );
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

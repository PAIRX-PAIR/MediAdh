import { COLLECTIONS, DOC_LAYOUT, settingsSchema, type Collection, type Database, type DocName } from "@/lib/domain/schema";
import { defaultDoc } from "@/lib/domain/defaults";
import { ConflictError, StoreUnavailableError, type RawSnapshot, type RawStore } from "./raw";

const DATA_DIR = "data";
const MAX_ATTEMPTS = 6;

/** Path of a single-file document. */
export function docPath(name: DocName): string {
  return `${DATA_DIR}/${name}.json`;
}

function shardDir(name: DocName): string | null {
  const layout = DOC_LAYOUT[name];
  return layout.kind === "single" ? null : `${DATA_DIR}/${layout.dir}/`;
}

/** Month key (AAAA-MM, UTC) of a sharded item; createdAt never changes, so items never move. */
export function shardKeyOf(item: { createdAt: string }): string {
  return item.createdAt.slice(0, 7);
}

const currentMonth = () => new Date().toISOString().slice(0, 7);

type Docs<K extends DocName> = { [P in K]: Database[P] };

interface Loaded {
  value: unknown;
  /** path -> text before the transaction ran ("" when the file did not exist). */
  before: Map<string, string>;
}

const serialize = (value: unknown) => `${JSON.stringify(value, null, 2)}\n`;

/** Typed, validated access to the document database on top of any RawStore. */
export class Db {
  /** Parsed documents keyed by `${path}:${sha}`; parsing is the expensive part. */
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

  private parseFile(name: DocName, path: string, text: string, sha: string): unknown {
    const key = `${path}:${sha}`;
    let value = this.parsed.get(key);
    if (value === undefined) {
      let json: unknown;
      try {
        json = JSON.parse(text);
      } catch {
        throw new StoreUnavailableError(`El archivo ${path} no es JSON válido.`);
      }
      const schema = name === "settings" ? settingsSchema : COLLECTIONS[name as Exclude<DocName, "settings">];
      const result = schema.safeParse(json);
      if (!result.success) {
        throw new StoreUnavailableError(`El archivo ${path} tiene un formato inválido: ${result.error.issues[0]?.message}`);
      }
      value = result.data;
      this.parsed.set(key, value);
      if (this.parsed.size > 400) this.parsed.delete(this.parsed.keys().next().value!);
    }
    // Callers get their own copy; cached objects are never handed out.
    return structuredClone(value);
  }

  private request(names: DocName[]) {
    const paths: string[] = [];
    const prefixes: string[] = [];
    for (const name of names) {
      const layout = DOC_LAYOUT[name];
      if (layout.kind === "single") paths.push(docPath(name));
      else if (layout.kind === "monthly") paths.push(`${shardDir(name)}${currentMonth()}.json`);
      else prefixes.push(shardDir(name)!);
    }
    return { paths, prefixes };
  }

  private load(name: DocName, snapshot: RawSnapshot, now: string): Loaded {
    const layout = DOC_LAYOUT[name];
    const before = new Map<string, string>();
    if (layout.kind !== "sharded") {
      const path = layout.kind === "single" ? docPath(name) : `${shardDir(name)}${currentMonth()}.json`;
      const entry = snapshot.files.get(path);
      before.set(path, entry?.text ?? "");
      const value = entry ? this.parseFile(name, path, entry.text, entry.sha) : defaultDoc(name, now);
      return { value, before };
    }
    // Sharded: merge every monthly file into one collection.
    const dir = shardDir(name)!;
    const merged: Collection<unknown> = { schema: 1, seq: 0, items: [] };
    const paths = [...snapshot.files.keys()].filter((p) => p.startsWith(dir)).sort();
    for (const path of paths) {
      const entry = snapshot.files.get(path);
      if (!entry) continue;
      before.set(path, entry.text);
      const shard = this.parseFile(name, path, entry.text, entry.sha) as Collection<unknown>;
      merged.seq = Math.max(merged.seq, shard.seq);
      merged.items.push(...shard.items);
    }
    return { value: merged, before };
  }

  async read<K extends DocName>(names: K[], opts: { fresh?: boolean } = {}): Promise<Docs<K>> {
    await this.ensureReady();
    const { paths, prefixes } = this.request(names);
    const snapshot = await this.raw.read(paths, { fresh: opts.fresh, prefixes });
    const now = new Date().toISOString();
    const out = {} as Docs<K>;
    for (const name of names) out[name] = this.load(name, snapshot, now).value as Database[K];
    return out;
  }

  /** Every monthly file of an append-only log (e.g. the full audit trail), oldest first. */
  async readLog<K extends DocName>(name: K): Promise<Database[K]> {
    await this.ensureReady();
    const dir = shardDir(name);
    if (!dir || DOC_LAYOUT[name].kind !== "monthly") return (await this.read([name]))[name];
    const snapshot = await this.raw.read([], { prefixes: [dir] });
    const merged: Collection<unknown> = { schema: 1, seq: 0, items: [] };
    for (const path of [...snapshot.files.keys()].sort()) {
      const entry = snapshot.files.get(path);
      if (!entry) continue;
      const shard = this.parseFile(name, path, entry.text, entry.sha) as Collection<unknown>;
      merged.items.push(...shard.items);
    }
    return merged as Database[K];
  }

  /** Files to write for `name` after a transaction, compared with what was read. */
  private changesFor(name: DocName, loaded: Loaded, value: unknown, out: Map<string, string>) {
    const layout = DOC_LAYOUT[name];
    if (layout.kind !== "sharded") {
      const [path, before] = [...loaded.before][0]!;
      const text = serialize(value);
      if (text !== before) out.set(path, text);
      return;
    }
    const merged = value as Collection<{ createdAt: string }>;
    const dir = shardDir(name)!;
    const groups = new Map<string, unknown[]>();
    for (const path of loaded.before.keys()) groups.set(path, []);
    for (const item of merged.items) {
      const path = `${dir}${shardKeyOf(item)}.json`;
      const group = groups.get(path) ?? [];
      group.push(item);
      groups.set(path, group);
    }
    for (const [path, items] of groups) {
      const before = loaded.before.get(path) ?? "";
      const previousSeq = before ? (JSON.parse(before) as { seq?: number }).seq ?? 0 : merged.seq;
      // Keep the old counter on untouched shards so a new folio rewrites one file only.
      const unchanged = serialize({ schema: 1, seq: previousSeq, items });
      if (unchanged === before) continue;
      out.set(path, serialize({ schema: 1, seq: merged.seq, items }));
    }
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
    const { paths, prefixes } = this.request(names);
    let lastError: unknown;
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      const snapshot = await this.raw.read(paths, { fresh: attempt > 0, prefixes });
      const now = new Date().toISOString();
      const docs = {} as Docs<K>;
      const loaded = new Map<DocName, Loaded>();
      for (const name of names) {
        const entry = this.load(name, snapshot, now);
        loaded.set(name, entry);
        docs[name] = entry.value as Database[K];
      }

      const result = await fn(docs);

      const changes = new Map<string, string>();
      for (const name of names) this.changesFor(name, loaded.get(name)!, docs[name], changes);
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

/** Files that store a whole database (used to seed the demo and tests). */
export function filesFor(values: Partial<Database>): Map<string, string> {
  const files = new Map<string, string>();
  for (const [name, value] of Object.entries(values) as Array<[DocName, unknown]>) {
    const layout = DOC_LAYOUT[name];
    if (layout.kind === "single") files.set(docPath(name), serialize(value));
    else if (layout.kind === "monthly") files.set(`${shardDir(name)}${currentMonth()}.json`, serialize(value));
    else {
      const collection = value as Collection<{ createdAt: string }>;
      const groups = new Map<string, unknown[]>();
      for (const item of collection.items) {
        const key = shardKeyOf(item);
        groups.set(key, [...(groups.get(key) ?? []), item]);
      }
      for (const [key, items] of groups) {
        files.set(`${shardDir(name)}${key}.json`, serialize({ schema: 1, seq: collection.seq, items }));
      }
    }
  }
  return files;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

import { mkdir, readdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { gitBlobSha } from "./hash";
import { ConflictError, inPrefix, type RawReadOptions, type RawSnapshot, type RawStore } from "./raw";

/** Local JSON files for development (`.data/`). Single process only. */
export class FileRawStore implements RawStore {
  readonly kind = "file" as const;
  private queue: Promise<unknown> = Promise.resolve();

  constructor(private readonly root: string) {}

  private resolve(p: string): string {
    const full = path.resolve(this.root, p);
    if (!full.startsWith(path.resolve(this.root) + path.sep)) {
      throw new Error(`Ruta fuera del directorio de datos: ${p}`);
    }
    return full;
  }

  private async currentVersion(): Promise<string> {
    try {
      return (await readFile(this.resolve(".version"), "utf8")).trim() || "0";
    } catch {
      return "0";
    }
  }

  async read(paths: string[], opts: RawReadOptions = {}): Promise<RawSnapshot> {
    const version = await this.currentVersion();
    const files = new Map<string, { text: string; sha: string } | undefined>();
    const wanted = new Set(paths);
    for (const prefix of opts.prefixes ?? []) {
      try {
        for (const name of await readdir(this.resolve(prefix))) {
          const p = `${prefix}${name}`;
          if (inPrefix(p, prefix)) wanted.add(p);
        }
      } catch {
        // Directory does not exist yet.
      }
    }
    await Promise.all(
      [...wanted].map(async (p) => {
        try {
          const text = await readFile(this.resolve(p), "utf8");
          files.set(p, { text, sha: gitBlobSha(text) });
        } catch {
          files.set(p, undefined);
        }
      }),
    );
    return { version, files };
  }

  write(baseVersion: string, changes: Map<string, string | null>, _message?: string): Promise<string> {
    void _message;
    const run = async () => {
      if ((await this.currentVersion()) !== baseVersion) throw new ConflictError();
      for (const [p, text] of changes) {
        const full = this.resolve(p);
        if (text === null) {
          await rm(full, { force: true });
          continue;
        }
        await mkdir(path.dirname(full), { recursive: true });
        const tmp = `${full}.${process.pid}.tmp`;
        await writeFile(tmp, text, "utf8");
        await rename(tmp, full);
      }
      const next = String(Number(baseVersion) + 1);
      await mkdir(this.root, { recursive: true });
      await writeFile(this.resolve(".version"), next, "utf8");
      return next;
    };
    const result = this.queue.then(run, run);
    this.queue = result.catch(() => undefined);
    return result;
  }
}

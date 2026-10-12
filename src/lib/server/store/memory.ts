import { gitBlobSha } from "./hash";
import { ConflictError, type RawSnapshot, type RawStore } from "./raw";

/** In-process store for tests and the public demo. State dies with the process. */
export class MemoryRawStore implements RawStore {
  readonly kind = "memory" as const;
  private files = new Map<string, string>();
  private version = 0;

  async read(paths: string[]): Promise<RawSnapshot> {
    const files = new Map<string, { text: string; sha: string } | undefined>();
    for (const path of paths) {
      const text = this.files.get(path);
      files.set(path, text === undefined ? undefined : { text, sha: gitBlobSha(text) });
    }
    return { version: String(this.version), files };
  }

  async write(baseVersion: string, changes: Map<string, string | null>, _message?: string): Promise<string> {
    void _message;
    if (baseVersion !== String(this.version)) throw new ConflictError();
    for (const [path, text] of changes) {
      if (text === null) this.files.delete(path);
      else this.files.set(path, text);
    }
    this.version += 1;
    return String(this.version);
  }
}

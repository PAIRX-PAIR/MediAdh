/**
 * Raw document storage: text files addressed by path, read as a consistent
 * snapshot and written atomically on top of a known base version.
 * Implementations: GitHub (production), local files (dev), memory (demo/tests).
 */
export interface RawEntry {
  text: string;
  /** Content hash; identical text => identical sha. */
  sha: string;
}

export interface RawSnapshot {
  /** Opaque version of the whole store (commit sha for GitHub). */
  version: string;
  files: Map<string, RawEntry | undefined>;
}

export interface RawReadOptions {
  fresh?: boolean;
  /**
   * Also return every `.json` file directly inside these directories
   * (e.g. "data/ordenes/"), from the same snapshot as `paths`.
   */
  prefixes?: string[];
}

export interface RawStore {
  readonly kind: "github" | "file" | "memory";
  read(paths: string[], opts?: RawReadOptions): Promise<RawSnapshot>;
  /**
   * Atomically apply `changes` (path -> new text, or null to delete) on top of
   * `baseVersion`. Throws ConflictError when the store moved past the base.
   */
  write(baseVersion: string, changes: Map<string, string | null>, message: string): Promise<string>;
}

/** True when `path` is a JSON file directly inside directory `prefix` (which ends with "/"). */
export function inPrefix(path: string, prefix: string): boolean {
  if (!path.startsWith(prefix) || !path.endsWith(".json")) return false;
  return !path.slice(prefix.length).includes("/");
}

export class ConflictError extends Error {
  constructor(message = "La base de datos cambió mientras se guardaba") {
    super(message);
    this.name = "ConflictError";
  }
}

export class StoreUnavailableError extends Error {
  constructor(
    message: string,
    readonly retryAfterSeconds: number | null = null,
  ) {
    super(message);
    this.name = "StoreUnavailableError";
  }
}

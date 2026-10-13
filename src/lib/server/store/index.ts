import "server-only";
import path from "node:path";
import { dataBackend, githubConfig, isDemoMode } from "../env";
import { seedDemo } from "../services/demo";
import { Db } from "./db";
import { FileRawStore } from "./file";
import { GitHubRawStore } from "./github";
import { MemoryRawStore } from "./memory";

// Survive Next.js dev hot reloads and reuse caches across requests on the same instance.
const globalForDb = globalThis as unknown as { __smiDb?: Db };

export function getDb(): Db {
  if (globalForDb.__smiDb) return globalForDb.__smiDb;
  const backend = dataBackend();
  let db: Db;
  if (backend === "github") {
    db = new Db(new GitHubRawStore(githubConfig()));
  } else if (backend === "file") {
    db = new Db(new FileRawStore(path.join(process.cwd(), ".data")));
  } else {
    db = new Db(new MemoryRawStore(), isDemoMode() ? seedDemo : undefined);
  }
  globalForDb.__smiDb = db;
  return db;
}

/** Tests inject their own database. */
export function setDbForTests(db: Db | undefined) {
  globalForDb.__smiDb = db;
}

export { Db } from "./db";
export { ConflictError, StoreUnavailableError } from "./raw";

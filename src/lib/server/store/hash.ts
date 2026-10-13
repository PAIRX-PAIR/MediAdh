import { createHash } from "node:crypto";

/** Git blob id of `text`, so locally written content can be cached by sha. */
export function gitBlobSha(text: string): string {
  const body = Buffer.from(text, "utf8");
  return createHash("sha1").update(`blob ${body.length}\0`).update(body).digest("hex");
}

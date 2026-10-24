import { createHash } from "node:crypto";

export function hashEvidenceText(contents) {
  const text = Buffer.isBuffer(contents) ? contents.toString("utf8") : contents;
  if (typeof text !== "string") throw new TypeError("Evidence contents must be UTF-8 text or a Buffer.");
  const canonical = text.replace(/\r\n/g, "\n");
  return createHash("sha256").update(canonical, "utf8").digest("hex");
}

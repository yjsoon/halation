import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

/** Reads a repository file by its path from the repository root. */
export function readRepoFile(path: string): string {
  return readFileSync(join(root, path), "utf8");
}

/**
 * The declaration that starts at `marker`, through its matching closing brace.
 * The body brace is the first one at or after the marker's last character, so
 * a marker may end with the opening brace or contain braces of its own.
 */
export function memberSpan(source: string, marker: string, file: string): string {
  const start = source.indexOf(marker);
  if (start < 0) {
    throw new Error(`Could not find ${marker} in ${file}`);
  }
  const brace = source.indexOf("{", start + marker.length - 1);
  if (brace < 0) {
    throw new Error(`Could not find opening brace after ${marker}`);
  }
  let depth = 0;
  for (let i = brace; i < source.length; i++) {
    const ch = source[i];
    if (ch === "{") depth += 1;
    else if (ch === "}") {
      depth -= 1;
      if (depth === 0) return source.slice(start, i + 1);
    }
  }
  throw new Error(`Unbalanced braces after ${marker} in ${file}`);
}

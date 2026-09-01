import { readdirSync, statSync } from "node:fs";
import { extname, join } from "node:path";

const SKIP_DIRS = new Set(["node_modules", "dist", ".git"]);

export function walkFiles(dir: string, extensions: Set<string>, files: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      if (!SKIP_DIRS.has(entry)) walkFiles(full, extensions, files);
    } else if (extensions.has(extname(entry))) {
      files.push(full);
    }
  }
  return files;
}

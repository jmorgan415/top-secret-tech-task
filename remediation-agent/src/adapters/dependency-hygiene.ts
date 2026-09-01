import { readFileSync, readdirSync, statSync } from "node:fs";
import { extname, join } from "node:path";
import { Finding, makeFindingId } from "../schema/finding.js";

const SOURCE_EXTENSIONS = new Set([".js", ".vue", ".ts", ".jsx", ".tsx"]);
const SKIP_DIRS = new Set(["node_modules", "dist", ".git"]);

function walk(dir: string, files: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      if (!SKIP_DIRS.has(entry)) walk(full, files);
    } else if (SOURCE_EXTENSIONS.has(extname(entry))) {
      files.push(full);
    }
  }
  return files;
}

function isImportedAnywhere(pkgName: string, sourceFiles: string[]): boolean {
  const escaped = pkgName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  // Matches `from "pkg"`, `from "pkg/sub"`, `require("pkg")`, `require("pkg/sub")`.
  const pattern = new RegExp(`(?:from\\s+|require\\()\\s*["']${escaped}(?:/[^"']*)?["']`);
  return sourceFiles.some((file) => pattern.test(readFileSync(file, "utf8")));
}

// Only "dependencies" is checked, not "devDependencies" — dev tooling (eslint, the CLI
// service, babel plugins) is legitimately "used" via config/scripts rather than a source
// import, so scanning it here would just produce false positives.
export function scanDependencyHygiene(projectRoot: string, sourceDirs: string[] = ["src", "babel.config.js"]): Finding[] {
  const pkgJson = JSON.parse(readFileSync(join(projectRoot, "package.json"), "utf8"));
  const dependencies: Record<string, string> = pkgJson.dependencies ?? {};

  const sourceFiles = sourceDirs.flatMap((dir) => {
    const full = join(projectRoot, dir);
    try {
      return statSync(full).isDirectory() ? walk(full) : [full];
    } catch {
      return [];
    }
  });

  const findings: Finding[] = [];
  for (const [name, declaredVersion] of Object.entries(dependencies)) {
    if (isImportedAnywhere(name, sourceFiles)) continue;

    const resource = { file: "package.json", identifier: name };
    findings.push(
      Finding.parse({
        id: makeFindingId("dependency-hygiene", "unused-dependency", resource),
        source: "dependency-hygiene",
        type: "unused-dependency",
        severity: "medium",
        title: `${name} is declared but never imported`,
        description: `No import/require of "${name}" found under ${sourceDirs.join(", ")}; safe to remove unless used indirectly (e.g. a CLI invoked only from a script).`,
        resource,
        evidence: {
          currentVersion: declaredVersion,
          advisories: [],
        },
        detectedAt: new Date().toISOString(),
      })
    );
  }
  return findings;
}

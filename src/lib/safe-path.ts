import { isAbsolute, relative, resolve } from "node:path";

/**
 * Resolve `input` against `baseDir` and reject paths that escape the base
 * (relative `..` traversal or an absolute path outside the tree).
 */
export function resolveWithinBase(input: string, baseDir: string = process.cwd()): string {
  const base = resolve(baseDir);
  const resolved = resolve(base, input);
  const rel = relative(base, resolved);
  if (rel.startsWith("..") || isAbsolute(rel)) {
    throw new Error(`Path escapes allowed directory: ${input}`);
  }
  return resolved;
}

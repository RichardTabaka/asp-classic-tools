/**
 * WorkspaceIndex: the brain of the extension.
 *
 * Like parser.ts, this file has zero `vscode` imports. It depends only on
 * plain Node fs/path so it can be exercised at a Node prompt. The
 * vscode-facing glue (file discovery via workspace.findFiles, watchers,
 * document events) lives in extension.ts and calls into this class.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { parseIncludes, parseDefinitions, Definition, IncludeRef, IncludeKind } from "./parser.js";

export interface ResolvedInclude {
  raw: string;
  kind: IncludeKind;
  targetString: string;
  line: number;
  /** Normalized, lowercased absolute path, or null if unresolved (e.g. virtual=). */
  resolvedPath: string | null;
}

export interface FileNode {
  /** Normalized, lowercased absolute path — the map key. */
  path: string;
  /** The original-case absolute path, for display and for opening the file. */
  displayPath: string;
  includes: ResolvedInclude[];
  definitions: Definition[];
  /** mtime (ms) as of the last successful parse. */
  lastParsed: number;
}

/** Normalizes a path for use as an index key: absolute, lowercased, OS separators. */
export function normalizeKey(p: string): string {
  return path.normalize(path.resolve(p)).toLowerCase();
}

/**
 * Resolves a single include reference against the file that contains it.
 *
 * `file=` includes are relative to the *including file's* directory.
 * `virtual=` includes are relative to a configurable web root; when no web
 * root is configured (the v1 default), they are left unresolved rather than
 * silently dropped.
 */
export function resolveInclude(
  ref: IncludeRef,
  currentFilePath: string,
  webRoot?: string | null,
): ResolvedInclude {
  if (ref.kind === "file") {
    const resolved = path.resolve(path.dirname(currentFilePath), ref.targetString);
    return { ...ref, resolvedPath: normalizeKey(resolved) };
  }

  // virtual=
  if (webRoot) {
    // Virtual paths are site-root-relative; strip a leading slash before joining.
    const relative = ref.targetString.replace(/^[/\\]+/, "");
    const resolved = path.resolve(webRoot, relative);
    return { ...ref, resolvedPath: normalizeKey(resolved) };
  }

  return { ...ref, resolvedPath: null };
}

export interface WorkspaceIndexOptions {
  webRoot?: string | null;
}

export class WorkspaceIndex {
  private files = new Map<string, FileNode>();
  private webRoot: string | null;

  constructor(options: WorkspaceIndexOptions = {}) {
    this.webRoot = options.webRoot ?? null;
  }

  setWebRoot(webRoot: string | null): void {
    this.webRoot = webRoot;
  }

  get size(): number {
    return this.files.size;
  }

  getFile(filePath: string): FileNode | undefined {
    return this.files.get(normalizeKey(filePath));
  }

  allFiles(): FileNode[] {
    return [...this.files.values()];
  }

  /** Parses one file's text and stores/updates its node in the index. */
  parseAndStore(filePath: string, text: string, mtimeMs: number): FileNode {
    const key = normalizeKey(filePath);
    const includes = parseIncludes(text).map((ref) => resolveInclude(ref, filePath, this.webRoot));
    const definitions = parseDefinitions(text);

    const node: FileNode = {
      path: key,
      displayPath: filePath,
      includes,
      definitions,
      lastParsed: mtimeMs,
    };
    this.files.set(key, node);
    return node;
  }

  /** Reads and parses a file from disk. Throws if the file can't be read. */
  reparseFromDisk(filePath: string): FileNode {
    const stat = fs.statSync(filePath);
    const text = fs.readFileSync(filePath, "utf8");
    return this.parseAndStore(filePath, text, stat.mtimeMs);
  }

  /** True when the on-disk file is newer than what we last parsed (or we've never parsed it). */
  needsReparse(filePath: string): boolean {
    const existing = this.getFile(filePath);
    if (!existing) {
      return true;
    }
    try {
      const stat = fs.statSync(filePath);
      return stat.mtimeMs > existing.lastParsed;
    } catch {
      // File is gone; caller should remove it instead of reparsing.
      return false;
    }
  }

  remove(filePath: string): void {
    this.files.delete(normalizeKey(filePath));
  }

  clear(): void {
    this.files.clear();
  }

  /**
   * Builds (or rebuilds) the whole index from a list of absolute file paths.
   * Files that fail to read/parse are skipped rather than aborting the build.
   */
  buildFromFiles(filePaths: string[]): void {
    this.files.clear();
    for (const filePath of filePaths) {
      try {
        this.reparseFromDisk(filePath);
      } catch {
        // Unreadable file (permissions, race with deletion, etc.) — skip it.
      }
    }
  }

  /**
   * BFS over the include graph starting at `startPath`, collecting every
   * definition matching `nameLower` (case-insensitive) found in the start
   * file or any transitively included file. Cycle-safe via a visited set.
   */
  findDefinitionsViaIncludes(startPath: string, nameLower: string): Array<{ file: FileNode; def: Definition }> {
    const results: Array<{ file: FileNode; def: Definition }> = [];
    const visited = new Set<string>();
    const queue: string[] = [normalizeKey(startPath)];

    while (queue.length > 0) {
      const key = queue.shift()!;
      if (visited.has(key)) {
        continue;
      }
      visited.add(key);

      const node = this.files.get(key);
      if (!node) {
        continue;
      }

      for (const def of node.definitions) {
        if (def.nameLower === nameLower) {
          results.push({ file: node, def });
        }
      }

      for (const inc of node.includes) {
        if (inc.resolvedPath && !visited.has(inc.resolvedPath)) {
          queue.push(inc.resolvedPath);
        }
      }
    }

    return results;
  }

  /** Whole-workspace fallback: every definition matching `nameLower`, across all indexed files. */
  findDefinitionsWorkspaceWide(nameLower: string): Array<{ file: FileNode; def: Definition }> {
    const results: Array<{ file: FileNode; def: Definition }> = [];
    for (const node of this.files.values()) {
      for (const def of node.definitions) {
        if (def.nameLower === nameLower) {
          results.push({ file: node, def });
        }
      }
    }
    return results;
  }
}

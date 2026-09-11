import { test } from "node:test";
import assert from "node:assert/strict";
import * as os from "node:os";
import * as fs from "node:fs";
import * as path from "node:path";
import { WorkspaceIndex, normalizeKey, resolveInclude } from "../index.js";
import type { IncludeRef } from "../parser.js";

function makeTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "asp-index-test-"));
}

function write(dir: string, name: string, contents: string): string {
  const p = path.join(dir, name);
  fs.writeFileSync(p, contents, "utf8");
  return p;
}

test("resolveInclude: file= is relative to the including file's directory", () => {
  const ref: IncludeRef = { raw: "", kind: "file", targetString: "lib/common.asp", line: 1 };
  const resolved = resolveInclude(ref, "/proj/pages/index.asp");
  assert.equal(resolved.resolvedPath, normalizeKey("/proj/pages/lib/common.asp"));
});

test("resolveInclude: virtual= is unresolved when no web root is configured", () => {
  const ref: IncludeRef = { raw: "", kind: "virtual", targetString: "/shared/db.asp", line: 1 };
  const resolved = resolveInclude(ref, "/proj/pages/index.asp", null);
  assert.equal(resolved.resolvedPath, null);
});

test("resolveInclude: virtual= resolves against a configured web root", () => {
  const ref: IncludeRef = { raw: "", kind: "virtual", targetString: "/shared/db.asp", line: 1 };
  const resolved = resolveInclude(ref, "/proj/pages/index.asp", "/proj");
  assert.equal(resolved.resolvedPath, normalizeKey("/proj/shared/db.asp"));
});

test("WorkspaceIndex: builds from files and resolves file= includes", () => {
  const dir = makeTempDir();
  const common = write(dir, "common.asp", `Function Helper()\nEnd Function`);
  const index_ = write(
    dir,
    "index.asp",
    `<!-- #include file="common.asp" -->\nFunction Main()\nEnd Function`,
  );

  const idx = new WorkspaceIndex();
  idx.buildFromFiles([common, index_]);

  assert.equal(idx.size, 2);
  const indexNode = idx.getFile(index_)!;
  assert.equal(indexNode.includes.length, 1);
  assert.equal(indexNode.includes[0].resolvedPath, normalizeKey(common));
});

test("WorkspaceIndex: findDefinitionsViaIncludes follows transitive includes and is cycle-safe", () => {
  const dir = makeTempDir();
  // a -> b -> c -> a  (cycle)
  const c = write(dir, "c.asp", `<!-- #include file="a.asp" -->\nFunction FromC()\nEnd Function`);
  const b = write(dir, "b.asp", `<!-- #include file="c.asp" -->\nFunction FromB()\nEnd Function`);
  const a = write(dir, "a.asp", `<!-- #include file="b.asp" -->\nFunction FromA()\nEnd Function`);

  const idx = new WorkspaceIndex();
  idx.buildFromFiles([a, b, c]);

  const results = idx.findDefinitionsViaIncludes(a, "fromc");
  assert.equal(results.length, 1);
  assert.equal(results[0].def.name, "FromC");

  // No infinite loop / duplicate results despite the cycle.
  const all = idx.findDefinitionsViaIncludes(a, "froma");
  assert.equal(all.length, 1);
});

test("WorkspaceIndex: needsReparse is true for unseen files and after a newer mtime", async () => {
  const dir = makeTempDir();
  const f = write(dir, "f.asp", `Function One()\nEnd Function`);

  const idx = new WorkspaceIndex();
  assert.equal(idx.needsReparse(f), true);
  idx.reparseFromDisk(f);
  assert.equal(idx.needsReparse(f), false);

  // Bump mtime forward to simulate an on-disk edit.
  const future = new Date(Date.now() + 5000);
  fs.utimesSync(f, future, future);
  assert.equal(idx.needsReparse(f), true);
});

test("WorkspaceIndex: findDefinitionsWorkspaceWide finds matches regardless of includes", () => {
  const dir = makeTempDir();
  const a = write(dir, "a.asp", `Function Lonely()\nEnd Function`);
  const b = write(dir, "b.asp", `Sub Other()\nEnd Sub`);

  const idx = new WorkspaceIndex();
  idx.buildFromFiles([a, b]);

  const results = idx.findDefinitionsWorkspaceWide("lonely");
  assert.equal(results.length, 1);
  assert.equal(results[0].file.displayPath, a);
});

test("WorkspaceIndex: case-insensitive path key means Windows-style casing differences collide", () => {
  const dir = makeTempDir();
  const f = write(dir, "MixedCase.asp", `Function X()\nEnd Function`);

  const idx = new WorkspaceIndex();
  idx.reparseFromDisk(f);

  const upper = path.join(path.dirname(f), "MIXEDCASE.asp");
  assert.ok(idx.getFile(upper), "lookup by different casing should hit the same node");
});

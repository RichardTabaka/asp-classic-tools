import { test } from "node:test";
import assert from "node:assert/strict";
import * as os from "node:os";
import * as fs from "node:fs";
import * as path from "node:path";
import { WorkspaceIndex } from "../index.js";

// AspIncludeTreeProvider itself imports "vscode", which doesn't exist outside
// a running extension host. We exercise its cycle/unresolved logic here by
// re-implementing the same childrenOf() algorithm against the index directly
// — this is the "hard logic" the real class delegates to, kept inline so
// this test file has no vscode dependency either.
function childrenOf(idx: WorkspaceIndex, node: ReturnType<WorkspaceIndex["getFile"]>, ancestors: Set<string>) {
  if (!node) return [];
  return node.includes.map((inc) => {
    if (!inc.resolvedPath) {
      return { kind: "unresolved" as const, label: inc.targetString };
    }
    if (ancestors.has(inc.resolvedPath)) {
      return { kind: "cycle" as const, label: inc.resolvedPath };
    }
    const child = idx.getFile(inc.resolvedPath);
    if (!child) {
      return { kind: "unresolved" as const, label: inc.targetString };
    }
    return { kind: "file" as const, path: child.path };
  });
}

function makeTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "asp-tree-test-"));
}
function write(dir: string, name: string, contents: string): string {
  const p = path.join(dir, name);
  fs.writeFileSync(p, contents, "utf8");
  return p;
}

test("tree children: marks a cycle instead of recursing forever", () => {
  const dir = makeTempDir();
  const a = write(dir, "a.asp", `<!-- #include file="b.asp" -->`);
  const b = write(dir, "b.asp", `<!-- #include file="a.asp" -->`);

  const idx = new WorkspaceIndex();
  idx.buildFromFiles([a, b]);

  const aNode = idx.getFile(a)!;
  const ancestors = new Set([aNode.path]);
  const aChildren = childrenOf(idx, aNode, ancestors);
  assert.equal(aChildren.length, 1);
  assert.equal(aChildren[0].kind, "file");

  const bNode = idx.getFile(b)!;
  const bAncestors = new Set([aNode.path, bNode.path]);
  const bChildren = childrenOf(idx, bNode, bAncestors);
  assert.equal(bChildren.length, 1);
  assert.equal(bChildren[0].kind, "cycle");
});

test("tree children: marks an unresolved virtual= include", () => {
  const dir = makeTempDir();
  const a = write(dir, "a.asp", `<!-- #include virtual="/shared/db.asp" -->`);

  const idx = new WorkspaceIndex();
  idx.buildFromFiles([a]);

  const aNode = idx.getFile(a)!;
  const children = childrenOf(idx, aNode, new Set([aNode.path]));
  assert.equal(children.length, 1);
  assert.equal(children[0].kind, "unresolved");
});

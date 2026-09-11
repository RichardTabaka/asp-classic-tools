# ASP Classic VS Code Extension — Planning Doc

> Captured from a planning conversation so it can move between machines.
> Working name: **asp-classic-tools**. Status: **planning only, nothing built yet.**
> On a fresh machine: open the eventual project folder and tell Claude Code
> "read ASP-Extension-Plan.md and let's continue."

## Goal

A VS Code extension to support in-house **ASP Classic (VBScript)** development. Two v1 features:

1. **F12 Go to Definition** for `Sub`/`Function` declarations across included files.
2. **Include tree view** — when a file is open, show the tree of files it includes
   (a → b → c). Keep a persisted running map; re-verify a file whenever it's opened.

## Core insight

Both features sit on **one capability**: parse `.asp` files to extract (a) definitions
and (b) `#include` directives, then build a cross-file index. The index is the real work;
F12 and the tree are thin layers on top.

## Confirmed scope decisions

- **File types:** `.asp` only (not `.inc`/`.asa` for now).
- **Language:** VBScript only. There are 1–2 JScript `.asp` files — don't special-case
  them; they just won't produce definitions. 100% coverage not required.
- **`virtual=` includes:** deferred. Parser should still *recognize* the syntax and mark
  such nodes "unresolved" (don't silently drop them), but don't resolve them yet.
  Resolving needs a configurable web root — a later feature.

### v1 in / out

| Feature | v1 | Deferred |
|---|---|---|
| Parse `file=` includes | yes | — |
| Parse `virtual=` includes | recognize + mark unresolved | resolve vs web root |
| Parse Sub/Function defs | yes | Dim/Const/Class members |
| F12 go-to-definition | yes | find-all-references (Shift+F12) |
| Include tree view | yes | reverse tree ("who includes me?") |
| Persist index | yes | — |

## What ASP Classic gives the parser

**Includes** (server-side, inside HTML comments):
```asp
<!-- #include file="lib/common.asp" -->      ' relative to current file's folder
<!-- #include virtual="/shared/db.asp" -->   ' relative to site root (deferred)
```

**Definitions** (VBScript, case-insensitive):
```asp
Function GetUser(id)
Sub LogError(msg)
Public Function Foo()
Private Sub Bar()
```
Regex is sufficient for v1 — no VBScript parser library needed.

## Architecture

```
Extension activates on language "asp"
        |
        v
  WorkspaceIndex (the brain — one per workspace)
   - Map<pathLower, FileNode> { includes[], definitions[], lastParsed }
   - Built by scanning + parsing each .asp file
   - Persisted to workspace storage; re-verified on open/save
        |
        +--> DefinitionProvider  -- F12 handler
        |      symbol under cursor -> look up in index
        |      (current file + transitive includes, workspace fallback)
        |
        +--> TreeDataProvider  -- include-tree view in the sidebar
               root = active file; children = its includes, recursive
```

**Key architectural rule:** keep the parser + index as **plain TypeScript with zero
`vscode` imports**, unit-testable at a Node prompt. The `vscode`-dependent providers/tree/
watchers are a thin shell over it. This is what keeps the hard logic (parsing, cycles,
resolution) fast to test.

## Outline 1 — Data model (design first)

```
FileNode {
  path            // normalized, LOWERCASED absolute path — the map key
  includes: [ { raw, kind: "file"|"virtual", resolvedPath|null, line } ]
  definitions: [ { name, nameLower, kind: "function"|"sub", line, col } ]
  lastParsed      // mtime — powers "verify on open"
}
WorkspaceIndex { files: Map<pathLower, FileNode> }
```
- Key by **normalized, lowercased absolute path** (Windows + VBScript are case-insensitive).
- `lastParsed` vs current mtime = the "re-verify whenever opened" mechanism.

## Outline 2 — Parser (two pure functions)

```
parseIncludes(text) -> IncludeRef[]
  regex: <!--\s*#include\s+(file|virtual)\s*=\s*"([^"]+)"\s*-->  (case-insensitive)
  return { raw, kind, targetString, line }
  (resolution is a SEPARATE step — keep parser pure)

parseDefinitions(text) -> Definition[]
  per line: ^\s*(Public\s+|Private\s+)?(Function|Sub)\s+([A-Za-z_]\w*)
  capture name, kind, line, column
```

Edge cases to handle:
- `Function Foo()` vs `Function Foo` (no parens) — both legal.
- Anchor on the **declaration**, not `End Function` / `End Sub`.
- Ignore commented-out decls: `' Function Foo` must NOT match (strip `'` comments;
  VBScript has only single-line comments — `'` and `Rem` — no block comments).
- Line-continuation `_` in declarations — rare, ignore for v1.

## Outline 3 — Resolution & index build

```
resolveInclude(ref, currentFilePath, webRoot?):
  file:    normalize(join(dirname(currentFile), targetString))
  virtual: null   // deferred — mark unresolved

buildIndex(): findFiles('**/*.asp') -> read -> parse -> resolve -> store
  (O(n) reads; fine for hundreds/low-thousands of files)

keep fresh:
  onDidSaveTextDocument(f) -> reparse f
  onDidOpenTextDocument(f) -> if mtime > lastParsed, reparse f   // verify on open
  FileSystemWatcher create/delete -> add/remove node
```

## Outline 4 — F12 resolution algorithm

```
onDefinition(document, position):
  word = wordAt(position)
  candidates = []
  1. current file: defs matching word (case-insensitive)
  2. transitive includes (BFS, visited-set for cycles): matching defs
  3. (optional) whole-workspace fallback — make it a setting
  return candidates.map(-> Location)   // array -> VS Code shows a picker if >1
```
Decisions:
- Include-graph-first is more *correct* (ASP is effectively global but only via includes);
  workspace fallback is more *forgiving* when an include was missed. Lean graph-first,
  workspace-fallback second, fallback behind a setting.
- Cycle protection (visited-set) lives here too.

## Outline 5 — Include tree view

```
TreeDataProvider:
  root = active editor's file
  children(node) = node.includes.map(resolved -> FileNode | UnresolvedNode)
  recurse with a visited-set per branch
  mark cycles:  "cycle: common.asp (already shown)" — don't recurse
  mark virtual: "virtual, unresolved: /shared/db.asp"
refresh on: onDidChangeActiveTextEditor, index updates
```

## Tricky bits to remember

- **Circular includes** (A→B→A) — visited-set everywhere you recurse.
- **`virtual=` resolution** — deferred; needs a web-root setting.
- **Case-insensitivity** — normalize (lowercase) identifiers and paths.
- **Duplicate function names across files** — return `Location[]`; VS Code shows a picker.
- **Scope** — treat all functions as global for v1; don't model block scope.

## Build order (each phase independently testable)

1. **Parser** — `parseIncludes`, `parseDefinitions` as pure functions + unit tests.
   (Start here: foundational, zero VS Code knowledge needed.)
2. **Index** — findFiles, parse all, resolve `file=`, add web-root setting stub, watchers.
3. **F12** — register DefinitionProvider over the index.
4. **Tree** — TreeDataProvider rooted on active editor; "verify on open" reconciliation.

## Running / installing in VS Code

- **Develop:** open the extension folder, press **F5** → launches an Extension Development
  Host (2nd VS Code window) running from source. Open the ASP project inside it to test.
  Reload host with Ctrl+R after changes. No install/packaging needed.
- **Use it for real:** `npm i -g @vscode/vsce` → `vsce package` → produces a `.vsix` →
  `code --install-extension asp-classic-tools-0.0.1.vsix` (or Extensions panel →
  "Install from VSIX"). Same `.vsix` is how coworkers install it. No Marketplace needed.
- **Gotcha:** don't run F5 *and* have the `.vsix` installed at once — both register
  providers → duplicate F12 results / double tree entries. During dev, keep it uninstalled
  and use F5; install the `.vsix` only when you switch from developing to using.

## Prereqs on each machine

- Node.js + npm (`node --version`). Whole toolchain is Node/TypeScript — no SDK/compiler.
- `yo` + `generator-code` to scaffold (`yo code`), or hand-write `package.json` + use `vsce`.

## Learning order

1. `yo code` + extension anatomy (package.json contribution points, activationEvents).
2. `vscode.languages.registerDefinitionProvider` (F12) — smallest real feature; proves the index.
3. `vscode.TreeDataProvider` + `contributes.views` — fiddlier getChildren/getTreeItem contract.
Supporting APIs: `workspace.findFiles`, `FileSystemWatcher`, `onDidOpenTextDocument`,
`ExtensionContext.workspaceState`/`storageUri` (persist the map).

## Open decisions still to make

- Whole-workspace fallback for F12: on by default, or setting-gated?
- Where the extension project lives (e.g. `C:\Dev\asp-classic-tools\`).
- Eventually: fold this plan into a `CLAUDE.md` in the project root so any future
  Claude Code session auto-loads the context.

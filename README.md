# ASP Classic Tools

A VS Code extension for in-house ASP Classic (VBScript) development. v1 has two features:

1. **F12 Go to Definition** for `Sub`/`Function` declarations across included files.
2. **Include tree view** in the Explorer sidebar, showing what the active file includes,
   recursively.

Both sit on one shared capability: a `WorkspaceIndex` that parses every `.asp` file's
`#include` directives and `Sub`/`Function` declarations. See `ASP-Extension-Plan.md` for
the full design rationale.

## Status

v1 scope is implemented:

- Parser (`src/parser.ts`) — pure functions, no `vscode` import, 12 unit tests.
- Index (`src/index.ts`) — path normalization, include resolution, BFS lookup with
  cycle protection, verify-on-open via mtime — no `vscode` import, 8 unit tests.
- F12 provider (`src/definitionProvider.ts`) — include-graph-first, workspace-wide
  fallback behind the `aspClassicTools.workspaceFallback` setting.
- Include tree (`src/treeProvider.ts`) — marks cycles and unresolved `virtual=` includes
  instead of recursing forever or silently dropping them.
- `src/extension.ts` — wires it all together: initial index build, save/open/watcher
  handlers, the refresh command.

Not yet done (see "Open decisions" below and the plan doc): the `.vsix` has not been
packaged or installed anywhere yet, and the extension has not been run inside a real
VS Code Extension Development Host — that needs an actual VS Code + `npm install`,
which this environment couldn't do (see "Why type-checking was limited" below).

## Getting started

```bash
npm install
npm test        # runs the parser + index unit tests (Node's built-in test runner via tsx)
npm run compile # type-checks and builds to dist/
```

Then in VS Code: open this folder, press **F5**. That launches an Extension Development
Host with `sample-project/` already opened for you (see `.vscode/launch.json`). Open
`sample-project/index.asp` and try:

- **F12** on `GetUser`, `RenderHeader`, or `FormatDate` — each jumps to its declaration
  in a different included file.
- The **ASP Include Tree** view in the Explorer sidebar — shows `index.asp`'s includes,
  including the `header.asp` ⇄ `footer.asp` cycle (marked, not infinitely recursed) and
  the unresolved `virtual="/shared/db.asp"` include (marked "virtual, unresolved").

Reload the dev host with **Ctrl+R** after code changes. Don't run F5 and have the
packaged `.vsix` installed at the same time — see the Gotcha in the plan doc.

## Packaging

```bash
npm i -g @vscode/vsce
vsce package
code --install-extension asp-classic-tools-0.0.1.vsix
```

## Why type-checking was limited in this session

This was built in a sandboxed environment without npm registry access, so
`@types/vscode` and `@types/node` couldn't be installed here. The vscode-free core
(`parser.ts`, `index.ts`) was fully unit-tested (20 tests, all passing) and the
vscode-dependent glue (`extension.ts`, `definitionProvider.ts`, `treeProvider.ts`) was
type-checked against a temporary hand-written stub of the vscode API surface this
extension actually uses, then the stub was deleted — it's not part of the project.
Run `npm install` on a normal machine and the real `@types/vscode`/`@types/node` take
over. The one thing that couldn't be verified here is an actual F5 run in a real
Extension Development Host — worth doing as your first step.

## Configuration

- `aspClassicTools.eagerIndex` (default `false`) — scan and parse every `.asp` file in
  the workspace on startup. Off by default: the index starts empty and is built
  on demand as you open/save files (see "Indexing modes" below), so large workspaces on
  a slow or remote drive start instantly. Turn on for full workspace coverage from the
  start if your workspace is small enough to scan quickly.
- `aspClassicTools.workspaceFallback` (default `true`) — when F12 finds nothing via the
  include graph, fall back to searching every indexed file. With `eagerIndex` off,
  "every indexed file" is whatever's been opened/saved so far, not the whole workspace.
- `aspClassicTools.webRoot` — filesystem path that `virtual="..."` includes resolve
  against. Empty (default) leaves them unresolved, per the v1 plan.

## Indexing modes

By default (`eagerIndex: false`) nothing is scanned at startup. Opening or saving an
`.asp` file parses that file *and* walks its resolved include chain (recursively,
cycle-safe via `WorkspaceIndex.ensureIncludeChainParsed`), pulling everything it includes
into the cache too — so F12 works fully within whatever you're actually working on,
without ever touching unrelated files elsewhere in the workspace.

F12 resolution order:

1. Definitions in the current file.
2. Definitions reachable via the current file's cached include graph.
3. If neither finds it and `workspaceFallback` is on: every file currently in the index
   (not a claim they're reachable from here — just candidates). VS Code shows a picker
   when there's more than one match, jumps straight there when there's exactly one.
4. If that's empty too: an info message, since in on-demand mode a miss may just mean
   the defining file hasn't been opened/saved yet — the message suggests opening the
   higher-level parent (or any file that includes the target) to pull it into the index.

Turn `eagerIndex` on to go back to the old behavior: a full workspace scan at startup and
on every `webRoot` change, and a real workspace-wide fallback in step 3 above.

## Known v1 limitations (by design, see the plan doc)

- Only `.asp` files are parsed (not `.inc`/`.asa`).
- VBScript only; the 1-2 JScript `.asp` files in the real project just won't yield
  definitions.
- `Dim`/`Const`/`Class` members aren't indexed, only `Sub`/`Function`.
- No find-all-references (Shift+F12), no reverse include tree ("who includes me?").
- Line-continuation (`_`) in declarations isn't handled.
- All functions are treated as global; no block-scope modeling.

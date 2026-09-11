import * as vscode from "vscode";
import { WorkspaceIndex } from "./index.js";
import { AspDefinitionProvider } from "./definitionProvider.js";
import { AspIncludeTreeProvider } from "./treeProvider.js";

const ASP_GLOB = "**/*.asp";

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  const config = vscode.workspace.getConfiguration("aspClassicTools");
  const webRoot = config.get<string>("webRoot", "") || null;
  const index = new WorkspaceIndex({ webRoot });

  const eagerIndex = () => vscode.workspace.getConfiguration("aspClassicTools").get<boolean>("eagerIndex", false);

  if (eagerIndex()) {
    await buildIndex(index);
  }

  const definitionProvider = new AspDefinitionProvider(index);
  context.subscriptions.push(
    vscode.languages.registerDefinitionProvider({ language: "asp" }, definitionProvider),
  );

  const treeProvider = new AspIncludeTreeProvider(index);
  const tree = vscode.window.createTreeView("aspIncludeTree", { treeDataProvider: treeProvider });
  context.subscriptions.push(tree);

  context.subscriptions.push(
    vscode.commands.registerCommand("asp-classic-tools.refreshIndex", async () => {
      if (eagerIndex()) {
        await buildIndex(index);
      } else {
        // On-demand mode: there's no workspace-wide scan to redo. Clear the
        // cache and, if there's an .asp file open, re-seed it from there.
        index.clear();
        const active = vscode.window.activeTextEditor;
        if (active && active.document.languageId === "asp") {
          index.ensureIncludeChainParsed(active.document.uri.fsPath);
        }
      }
      treeProvider.refresh();
      vscode.window.setStatusBarMessage(`ASP Classic Tools: reindexed ${index.size} file(s)`, 3000);
    }),
  );

  // Keep fresh: reparse on save, verify-on-open (Outline 3). In on-demand
  // mode this is also what builds the index in the first place — opening or
  // saving a page pulls its whole include chain into the cache.
  context.subscriptions.push(
    vscode.workspace.onDidSaveTextDocument((doc) => {
      if (doc.languageId === "asp") {
        index.ensureIncludeChainParsed(doc.uri.fsPath);
        treeProvider.refresh();
      }
    }),
  );

  context.subscriptions.push(
    vscode.workspace.onDidOpenTextDocument((doc) => {
      if (doc.languageId === "asp") {
        index.ensureIncludeChainParsed(doc.uri.fsPath);
        treeProvider.refresh();
      }
    }),
  );

  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration("aspClassicTools.webRoot")) {
        const newRoot = vscode.workspace.getConfiguration("aspClassicTools").get<string>("webRoot", "") || null;
        index.setWebRoot(newRoot);
        // Include resolution for virtual= depends on webRoot. In eager mode a
        // full rebuild is the simplest correct response; in on-demand mode
        // that would reintroduce the workspace-wide scan we're avoiding, so
        // just clear and re-seed from whatever's currently open instead.
        if (eagerIndex()) {
          buildIndex(index).then(() => treeProvider.refresh());
        } else {
          index.clear();
          const active = vscode.window.activeTextEditor;
          if (active && active.document.languageId === "asp") {
            index.ensureIncludeChainParsed(active.document.uri.fsPath);
          }
          treeProvider.refresh();
        }
      }
    }),
  );

  const watcher = vscode.workspace.createFileSystemWatcher(ASP_GLOB);
  context.subscriptions.push(watcher);
  context.subscriptions.push(
    watcher.onDidCreate((uri) => {
      index.reparseFromDisk(uri.fsPath);
      treeProvider.refresh();
    }),
  );
  context.subscriptions.push(
    watcher.onDidDelete((uri) => {
      index.remove(uri.fsPath);
      treeProvider.refresh();
    }),
  );
  context.subscriptions.push(
    watcher.onDidChange((uri) => {
      index.reparseFromDisk(uri.fsPath);
      treeProvider.refresh();
    }),
  );
}

async function buildIndex(index: WorkspaceIndex): Promise<void> {
  const uris = await vscode.workspace.findFiles(ASP_GLOB, "**/node_modules/**");
  index.buildFromFiles(uris.map((u: vscode.Uri) => u.fsPath));
}

export function deactivate(): void {
  // Nothing to clean up beyond what's already in context.subscriptions.
}

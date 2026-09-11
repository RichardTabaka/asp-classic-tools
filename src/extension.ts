import * as vscode from "vscode";
import { WorkspaceIndex } from "./index.js";
import { AspDefinitionProvider } from "./definitionProvider.js";
import { AspIncludeTreeProvider } from "./treeProvider.js";

const ASP_GLOB = "**/*.asp";

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  const config = vscode.workspace.getConfiguration("aspClassicTools");
  const webRoot = config.get<string>("webRoot", "") || null;
  const index = new WorkspaceIndex({ webRoot });

  await buildIndex(index);

  const definitionProvider = new AspDefinitionProvider(index);
  context.subscriptions.push(
    vscode.languages.registerDefinitionProvider({ language: "asp" }, definitionProvider),
  );

  const treeProvider = new AspIncludeTreeProvider(index);
  const tree = vscode.window.createTreeView("aspIncludeTree", { treeDataProvider: treeProvider });
  context.subscriptions.push(tree);

  context.subscriptions.push(
    vscode.commands.registerCommand("asp-classic-tools.refreshIndex", async () => {
      await buildIndex(index);
      treeProvider.refresh();
      vscode.window.setStatusBarMessage(`ASP Classic Tools: reindexed ${index.size} file(s)`, 3000);
    }),
  );

  // Keep fresh: reparse on save, verify-on-open (Outline 3).
  context.subscriptions.push(
    vscode.workspace.onDidSaveTextDocument((doc) => {
      if (doc.languageId === "asp") {
        index.reparseFromDisk(doc.uri.fsPath);
        treeProvider.refresh();
      }
    }),
  );

  context.subscriptions.push(
    vscode.workspace.onDidOpenTextDocument((doc) => {
      if (doc.languageId === "asp" && index.needsReparse(doc.uri.fsPath)) {
        index.reparseFromDisk(doc.uri.fsPath);
        treeProvider.refresh();
      }
    }),
  );

  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration("aspClassicTools.webRoot")) {
        const newRoot = vscode.workspace.getConfiguration("aspClassicTools").get<string>("webRoot", "") || null;
        index.setWebRoot(newRoot);
        // Include resolution for virtual= depends on webRoot, so a full
        // rebuild is the simplest correct response to it changing.
        buildIndex(index).then(() => treeProvider.refresh());
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

import * as path from "node:path";
import * as vscode from "vscode";
import { FileNode, WorkspaceIndex } from "./index.js";

/**
 * A node in the include tree. Three shapes, per Outline 5:
 *  - "file"     a resolved, indexed .asp file — recurse into its includes
 *  - "unresolved" a virtual= include with no web root configured (or
 *                  a file= include pointing at a file we couldn't find)
 *  - "cycle"    a file= include that leads back to an ancestor already
 *                  shown on this branch — stop recursing, just mark it
 */
export type AspTreeNode =
  | { kind: "file"; node: FileNode; ancestors: ReadonlySet<string> }
  | { kind: "unresolved"; label: string; virtual: boolean }
  | { kind: "cycle"; label: string };

export class AspIncludeTreeProvider implements vscode.TreeDataProvider<AspTreeNode> {
  private readonly _onDidChangeTreeData = new vscode.EventEmitter<AspTreeNode | undefined | void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  constructor(private readonly index: WorkspaceIndex) {
    vscode.window.onDidChangeActiveTextEditor(() => this.refresh());
  }

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: AspTreeNode): vscode.TreeItem {
    if (element.kind === "file") {
      const item = new vscode.TreeItem(
        path.basename(element.node.displayPath),
        element.node.includes.length > 0
          ? vscode.TreeItemCollapsibleState.Collapsed
          : vscode.TreeItemCollapsibleState.None,
      );
      item.resourceUri = vscode.Uri.file(element.node.displayPath);
      item.description = path.dirname(element.node.displayPath);
      item.command = {
        command: "vscode.open",
        title: "Open",
        arguments: [vscode.Uri.file(element.node.displayPath)],
      };
      item.contextValue = "aspFile";
      return item;
    }

    if (element.kind === "unresolved") {
      const item = new vscode.TreeItem(element.label, vscode.TreeItemCollapsibleState.None);
      item.description = element.virtual ? "virtual, unresolved" : "unresolved";
      item.iconPath = new vscode.ThemeIcon("question");
      return item;
    }

    // cycle
    const item = new vscode.TreeItem(element.label, vscode.TreeItemCollapsibleState.None);
    item.description = "already shown above";
    item.iconPath = new vscode.ThemeIcon("debug-continue-small");
    return item;
  }

  getChildren(element?: AspTreeNode): AspTreeNode[] {
    if (!element) {
      const active = vscode.window.activeTextEditor;
      if (!active || active.document.languageId !== "asp") {
        return [];
      }
      const root = this.index.getFile(active.document.uri.fsPath);
      if (!root) {
        return [];
      }
      return [{ kind: "file", node: root, ancestors: new Set([root.path]) }];
    }

    if (element.kind !== "file") {
      return [];
    }

    return this.childrenOf(element.node, element.ancestors);
  }

  /**
   * Turns a FileNode's includes into child tree nodes, given the set of
   * ancestor paths already shown on this branch (for cycle detection —
   * carried on each "file" node itself, since VS Code's TreeDataProvider
   * calls getChildren one node at a time with no path history of its own).
   * Exposed (not private) so it's exercisable without a full vscode host.
   */
  childrenOf(node: FileNode, ancestors: ReadonlySet<string>): AspTreeNode[] {
    return node.includes.map((inc): AspTreeNode => {
      if (!inc.resolvedPath) {
        return { kind: "unresolved", label: inc.targetString, virtual: inc.kind === "virtual" };
      }

      if (ancestors.has(inc.resolvedPath)) {
        return { kind: "cycle", label: `cycle: ${path.basename(inc.resolvedPath)}` };
      }

      const childFile = this.index.getFile(inc.resolvedPath);
      if (!childFile) {
        return { kind: "unresolved", label: inc.targetString, virtual: false };
      }

      return { kind: "file", node: childFile, ancestors: new Set([...ancestors, childFile.path]) };
    });
  }
}

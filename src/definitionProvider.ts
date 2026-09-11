import * as vscode from "vscode";
import { WorkspaceIndex } from "./index.js";

/**
 * F12 handler. Resolution order (Outline 4):
 *   1. current file's own definitions
 *   2. transitive includes (BFS, cycle-safe) — the include graph is treated
 *      as authoritative first, since ASP is "global via includes"
 *   3. whole-workspace fallback, only when the setting allows it
 *
 * All matches are returned (not just the first) so VS Code shows a picker
 * when a name is defined in more than one place.
 */
export class AspDefinitionProvider implements vscode.DefinitionProvider {
  constructor(private readonly index: WorkspaceIndex) {}

  provideDefinition(
    document: vscode.TextDocument,
    position: vscode.Position,
  ): vscode.ProviderResult<vscode.Location[]> {
    const range = document.getWordRangeAtPosition(position, /[A-Za-z_]\w*/);
    if (!range) {
      return undefined;
    }
    const word = document.getText(range);
    const nameLower = word.toLowerCase();

    const viaIncludes = this.index.findDefinitionsViaIncludes(document.uri.fsPath, nameLower);
    if (viaIncludes.length > 0) {
      return dedupeLocations(viaIncludes.map(({ file, def }) => toLocation(file.displayPath, def)));
    }

    const fallbackEnabled = vscode.workspace
      .getConfiguration("aspClassicTools")
      .get<boolean>("workspaceFallback", true);
    if (!fallbackEnabled) {
      return undefined;
    }

    const workspaceWide = this.index.findDefinitionsWorkspaceWide(nameLower);
    if (workspaceWide.length === 0) {
      return undefined;
    }
    return dedupeLocations(workspaceWide.map(({ file, def }) => toLocation(file.displayPath, def)));
  }
}

function toLocation(filePath: string, def: { line: number; col: number; name: string }): vscode.Location {
  const pos = new vscode.Position(def.line - 1, def.col);
  return new vscode.Location(vscode.Uri.file(filePath), pos);
}

function dedupeLocations(locations: vscode.Location[]): vscode.Location[] {
  const seen = new Set<string>();
  const result: vscode.Location[] = [];
  for (const loc of locations) {
    const key = `${loc.uri.fsPath}:${loc.range.start.line}:${loc.range.start.character}`;
    if (!seen.has(key)) {
      seen.add(key);
      result.push(loc);
    }
  }
  return result;
}

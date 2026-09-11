import * as vscode from "vscode";
import { WorkspaceIndex } from "./index.js";

/**
 * F12 handler. Resolution order (Outline 4, extended for on-demand indexing):
 *   1. current file's own definitions
 *   2. transitive includes (BFS, cycle-safe) — the include graph is treated
 *      as authoritative first, since ASP is "global via includes"
 *   3. every file currently in the index (only when the setting allows it) —
 *      not a claim that these are reachable from here, just candidates to
 *      look at. All matches are returned so VS Code shows a picker when a
 *      name is defined in more than one place, jumps straight there when
 *      there's exactly one.
 *   4. if even that finds nothing, tell the user rather than staying silent —
 *      in on-demand mode the index only holds what's been opened/saved so
 *      far, so a miss may just mean the defining file hasn't been touched yet.
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

    const indexWide = this.index.findDefinitionsWorkspaceWide(nameLower);
    if (indexWide.length === 0) {
      vscode.window.showInformationMessage(
        `ASP Classic Tools: "${word}" isn't in the index yet. Open the page (or another ` +
          `file) that includes it — even a higher-level parent — to pull it in, then try again.`,
      );
      return undefined;
    }
    return dedupeLocations(indexWide.map(({ file, def }) => toLocation(file.displayPath, def)));
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

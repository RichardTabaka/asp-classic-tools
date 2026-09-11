/**
 * Pure, VS Code-free parsing for ASP Classic (VBScript) files.
 *
 * These two functions are the whole "hard logic" surface of the extension:
 * - parseIncludes:    finds server-side #include directives
 * - parseDefinitions: finds Sub/Function declarations
 *
 * Both operate on raw file text and return plain data. Nothing here knows
 * about the filesystem, the workspace, or vscode — that's what keeps this
 * testable at a plain Node prompt (see src/test/parser.test.ts).
 */

export type IncludeKind = "file" | "virtual";

export interface IncludeRef {
  /** The exact directive text as it appeared in the source. */
  raw: string;
  kind: IncludeKind;
  /** The string inside the quotes, e.g. "lib/common.asp". */
  targetString: string;
  /** 1-indexed line number the directive was found on. */
  line: number;
}

export type DefinitionKind = "function" | "sub";

export interface Definition {
  name: string;
  nameLower: string;
  kind: DefinitionKind;
  /** 1-indexed line number of the declaration. */
  line: number;
  /** 0-indexed column where the name itself starts. */
  col: number;
}

const INCLUDE_RE =
  /<!--\s*#include\s+(file|virtual)\s*=\s*"([^"]+)"\s*-->/gi;

// Public|Private is optional; Function|Sub required; name follows.
// Parens are optional ("Function Foo()" and "Function Foo" are both legal).
const DEFINITION_RE =
  /^(\s*)(?:(Public|Private)\s+)?(Function|Sub)\s+([A-Za-z_]\w*)/i;

/**
 * Strips a VBScript comment from a single line, if present.
 *
 * VBScript has only single-line comments: a leading `'` (or `Rem` as a
 * standalone keyword) comments out the rest of the line. There are no block
 * comments. We track whether we're inside a double-quoted string so a `'`
 * that appears inside a string literal isn't mistaken for a comment.
 */
function stripLineComment(line: string): string {
  let inString = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      inString = !inString;
    } else if (ch === "'" && !inString) {
      return line.slice(0, i);
    }
  }

  // "Rem" as a whole-word comment marker (only when not already inside a
  // string, which the loop above didn't detect since no quote was hit).
  const remMatch = /^(\s*)rem(\s|$)/i.exec(line);
  if (remMatch) {
    return line.slice(0, remMatch[1].length);
  }

  return line;
}

/**
 * Finds all `<!-- #include file="..." -->` / `<!-- #include virtual="..." -->`
 * directives in the given file text.
 *
 * `virtual=` includes are recognized but their target is not resolved here —
 * resolution (or the decision not to resolve) is a separate concern, kept in
 * index.ts, so this function stays a pure string -> data transform.
 */
export function parseIncludes(text: string): IncludeRef[] {
  const results: IncludeRef[] = [];
  const lines = text.split(/\r\n|\r|\n/);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    INCLUDE_RE.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = INCLUDE_RE.exec(line)) !== null) {
      const [raw, kindRaw, targetString] = match;
      results.push({
        raw,
        kind: kindRaw.toLowerCase() as IncludeKind,
        targetString,
        line: i + 1,
      });
    }
  }

  return results;
}

/**
 * Finds all `Sub`/`Function` declarations in the given file text.
 *
 * Anchors on the declaration line itself (not `End Sub`/`End Function`).
 * Commented-out declarations (`' Function Foo`) are ignored. Line
 * continuations (`_` at end of line) are a known v1 gap and are not handled.
 */
export function parseDefinitions(text: string): Definition[] {
  const results: Definition[] = [];
  const lines = text.split(/\r\n|\r|\n/);

  for (let i = 0; i < lines.length; i++) {
    const stripped = stripLineComment(lines[i]);
    const match = DEFINITION_RE.exec(stripped);
    if (!match) {
      continue;
    }

    const [full, , , kindRaw, name] = match;
    const kind: DefinitionKind = kindRaw.toLowerCase() === "sub" ? "sub" : "function";

    // The whole regex is anchored at the start of the line (match.index is
    // always 0), so the name's column is just how far into the match it
    // starts, computed from the match length rather than assumed offsets
    // since "Public "/"Private " are optional.
    const col = full.length - name.length;

    results.push({
      name,
      nameLower: name.toLowerCase(),
      kind,
      line: i + 1,
      col,
    });
  }

  return results;
}

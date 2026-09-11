import { test } from "node:test";
import assert from "node:assert/strict";
import { parseIncludes, parseDefinitions } from "../parser.js";

test("parseIncludes: file= include", () => {
  const text = `<!-- #include file="lib/common.asp" -->\n<html></html>`;
  const refs = parseIncludes(text);
  assert.equal(refs.length, 1);
  assert.equal(refs[0].kind, "file");
  assert.equal(refs[0].targetString, "lib/common.asp");
  assert.equal(refs[0].line, 1);
});

test("parseIncludes: virtual= include is recognized but not resolved here", () => {
  const text = `<!-- #include virtual="/shared/db.asp" -->`;
  const refs = parseIncludes(text);
  assert.equal(refs.length, 1);
  assert.equal(refs[0].kind, "virtual");
  assert.equal(refs[0].targetString, "/shared/db.asp");
});

test("parseIncludes: case-insensitive keyword and multiple per file", () => {
  const text = [
    `<!-- #INCLUDE FILE="a.asp" -->`,
    `some code`,
    `<!-- #include File="b.asp" -->`,
  ].join("\n");
  const refs = parseIncludes(text);
  assert.equal(refs.length, 2);
  assert.equal(refs[0].line, 1);
  assert.equal(refs[1].line, 3);
});

test("parseIncludes: two includes on the same line", () => {
  const text = `<!-- #include file="a.asp" --><!-- #include file="b.asp" -->`;
  const refs = parseIncludes(text);
  assert.equal(refs.length, 2);
  assert.equal(refs[0].targetString, "a.asp");
  assert.equal(refs[1].targetString, "b.asp");
});

test("parseDefinitions: Function with and without parens", () => {
  const text = `Function GetUser(id)\nFunction NoParens\n`;
  const defs = parseDefinitions(text);
  assert.equal(defs.length, 2);
  assert.equal(defs[0].name, "GetUser");
  assert.equal(defs[0].kind, "function");
  assert.equal(defs[0].line, 1);
  assert.equal(defs[1].name, "NoParens");
});

test("parseDefinitions: Public/Private Sub", () => {
  const text = `Public Function Foo()\nPrivate Sub Bar()\nSub Baz()`;
  const defs = parseDefinitions(text);
  assert.equal(defs.length, 3);
  assert.deepEqual(
    defs.map((d) => [d.name, d.kind]),
    [
      ["Foo", "function"],
      ["Bar", "sub"],
      ["Baz", "sub"],
    ],
  );
});

test("parseDefinitions: nameLower is lowercased for case-insensitive lookup", () => {
  const defs = parseDefinitions(`Function GetUser(id)`);
  assert.equal(defs[0].nameLower, "getuser");
});

test("parseDefinitions: anchors on declaration, not End Function/Sub", () => {
  const text = `Function Foo()\n  Foo = 1\nEnd Function`;
  const defs = parseDefinitions(text);
  assert.equal(defs.length, 1);
  assert.equal(defs[0].line, 1);
});

test("parseDefinitions: ignores commented-out declarations", () => {
  const text = `' Function Foo\nFunction Real()`;
  const defs = parseDefinitions(text);
  assert.equal(defs.length, 1);
  assert.equal(defs[0].name, "Real");
});

test("parseDefinitions: ignores indented Rem-commented declarations", () => {
  const text = `  Rem Function Foo\nFunction Real()`;
  const defs = parseDefinitions(text);
  assert.equal(defs.length, 1);
  assert.equal(defs[0].name, "Real");
});

test("parseDefinitions: a ' inside a string literal is not a comment", () => {
  const text = `Function Foo()\n  x = "it's fine"\nEnd Function`;
  const defs = parseDefinitions(text);
  assert.equal(defs.length, 1);
  assert.equal(defs[0].name, "Foo");
});

test("parseDefinitions: column points at the name, after optional Public/Private", () => {
  const defs = parseDefinitions(`Public Function Foo()`);
  const col = defs[0].col;
  assert.equal("Public Function Foo()".slice(col, col + 3), "Foo");
});

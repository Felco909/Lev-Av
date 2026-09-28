import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'fs';
import { join, relative } from 'path';
import ts from 'typescript';

/**
 * Many .tsx files in this repo keep Cyrillic as \uXXXX escapes. That is fine inside JS
 * string literals ({"В..."}), but JSX text and plain attribute strings (attr="...")
 * do NOT process escapes — React renders the backslash sequence literally to the user
 * (live bug 2026-09-28: "Валюта" showed as Ва... in the Счёт + Акт dialog).
 * This guard fails on any such escape so it can't reach the UI again.
 */
const ROOTS = ['app', 'components'];
const ESCAPE = /\\u[0-9a-fA-F]{4}|\\u\{[0-9a-fA-F]+\}/;

function tsxFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...tsxFiles(p));
    else if (p.endsWith('.tsx')) out.push(p);
  }
  return out;
}

function findLiteralEscapes(file: string): string[] {
  const src = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const hits: string[] = [];
  const visit = (node: ts.Node) => {
    const isJsxText = ts.isJsxText(node);
    const isAttrString = ts.isStringLiteral(node) && ts.isJsxAttribute(node.parent);
    if ((isJsxText || isAttrString) && ESCAPE.test(node.getText(src))) {
      const { line } = src.getLineAndCharacterOfPosition(node.getStart(src));
      hits.push(`${relative(process.cwd(), file)}:${line + 1}`);
    }
    ts.forEachChild(node, visit);
  };
  visit(src);
  return hits;
}

describe('JSX не выводит сырые \\uXXXX', () => {
  it('ни в JSX-тексте, ни в строковых атрибутах нет escape-последовательностей', () => {
    const hits = ROOTS.flatMap((r) => tsxFiles(r)).flatMap(findLiteralEscapes);
    expect(hits).toEqual([]);
  });
});

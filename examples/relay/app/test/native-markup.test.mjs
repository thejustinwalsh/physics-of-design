import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { parse } from '@babel/parser';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
test('shared native container primitives never receive literal text nodes', () => {
  const containers = new Set([
    'Column',
    'Row',
    'Panel',
    'Modal',
    'Scroll',
    'html.div',
    'html.main',
    'html.header',
    'html.nav',
    'html.section',
    'html.button',
  ]);
  const problems = [];
  const sourceRoot = fileURLToPath(new URL('../src/', import.meta.url));
  for (const file of fs
    .readdirSync(sourceRoot)
    .filter((n) => n.endsWith('.jsx'))) {
    const ast = parse(fs.readFileSync(path.join(sourceRoot, file), 'utf8'), {
      sourceType: 'module',
      plugins: ['jsx'],
    });
    function name(n) {
      return n.type === 'JSXIdentifier'
        ? n.name
        : n.type === 'JSXMemberExpression'
          ? name(n.object) + '.' + name(n.property)
          : '';
    }
    function visit(node) {
      if (!node || typeof node !== 'object') return;
      if (
        node.type === 'JSXElement' &&
        containers.has(name(node.openingElement.name))
      ) {
        for (const child of node.children) {
          if (
            (child.type === 'JSXText' && child.value.trim()) ||
            (child.type === 'JSXExpressionContainer' &&
              ['StringLiteral', 'NumericLiteral'].includes(
                child.expression?.type,
              ))
          )
            problems.push(
              file +
                ':' +
                child.loc.start.line +
                ' raw container text ' +
                JSON.stringify(child.value ?? child.expression.value),
            );
        }
      }
      for (const value of Object.values(node))
        if (Array.isArray(value)) value.forEach(visit);
        else if (value && typeof value === 'object') visit(value);
    }
    visit(ast);
  }
  assert.deepEqual(problems, []);
});

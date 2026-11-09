'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// Regression test for: "Uncaught SyntaxError: Identifier 'X' has already
// been declared" in the Side Panel.
//
// <script> tags loaded by the same HTML document share one global scope.
// A top-level `function name(...)` in one script and a top-level
// `const`/`let`/`var name` in another (or the same name declared twice)
// collide there even though each *file* is perfectly valid JavaScript on
// its own - `node --check` on the individual files (see `npm run check`)
// cannot catch this, because it never loads two files into one scope.
// This test mirrors what the browser actually does: it resolves every
// local <script src> in controller.html, in document order, and asserts
// that no top-level identifier is declared in more than one of them.

const root = path.join(__dirname, '..');
const controllerDir = path.join(root, 'controller');
const html = fs.readFileSync(path.join(controllerDir, 'controller.html'), 'utf8');

function localScriptSources(markup) {
  const sources = [];
  const pattern = /<script\s+src="([^"]+)"/g;
  let match;
  while ((match = pattern.exec(markup))) {
    const src = match[1];
    if (/^https?:|^\/\//.test(src)) continue; // ignore any future CDN scripts
    sources.push(src);
  }
  return sources;
}

// Only matches declarations written at column 0 (no leading whitespace),
// which is this codebase's consistent style for top-level/global
// declarations; declarations nested in functions or blocks are always
// indented and are correctly ignored.
function topLevelDeclarations(source) {
  const names = new Set();
  const fnPattern = /^function\s+([A-Za-z_$][\w$]*)\s*\(/gm;
  const varPattern = /^(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*[=;]/gm;
  let match;
  while ((match = fnPattern.exec(source))) names.add(match[1]);
  while ((match = varPattern.exec(source))) names.add(match[1]);
  return names;
}

test('controller.html scripts declare no colliding top-level identifiers', () => {
  const sources = localScriptSources(html);
  assert.ok(sources.length > 1, 'expected controller.html to load more than one local script');

  const declaredBy = new Map(); // name -> [{ file, }]
  for (const src of sources) {
    const filePath = path.normalize(path.join(controllerDir, src));
    const content = fs.readFileSync(filePath, 'utf8');
    for (const name of topLevelDeclarations(content)) {
      if (!declaredBy.has(name)) declaredBy.set(name, []);
      declaredBy.get(name).push(src);
    }
  }

  const collisions = [...declaredBy.entries()].filter(([, files]) => files.length > 1);
  assert.deepEqual(
    collisions,
    [],
    `colliding top-level identifiers across controller.html's <script> tags (would throw ` +
      `"Identifier has already been declared" in the browser): ` +
      collisions.map(([name, files]) => `${name} in [${files.join(', ')}]`).join('; ')
  );
});

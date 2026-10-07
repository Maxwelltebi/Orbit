// Transpile trusted, platform-independent project sources for Node checks.
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const root = path.resolve(__dirname, '../..');
const cache = new Map();
function load(relative) {
  const filename = path.resolve(root, relative);
  if (cache.has(filename)) return cache.get(filename).exports;
  const output = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const module = { exports: {} };
  cache.set(filename, module);
  const requireLocal = (name) => name.startsWith('.')
    ? load(path.relative(root, path.resolve(path.dirname(filename), name + '.ts'))) : require(name);
  new Function('require', 'module', 'exports', output)(requireLocal, module, module.exports);
  return module.exports;
}
module.exports = load;

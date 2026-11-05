import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseSync } from '@babel/core';

/** Execute actual Metro-emitted toolkit factories without bootstrapping React,
 * a DOM, a browser, native services or a model. This catches package-resolution
 * and module-initialization errors that successful static export cannot catch.
 * It is not browser/native geometry or UI-thread execution evidence.
 */
export async function checkMetroRuntime(file) {
  const bytes = await readFile(file);
  const source = bytes.toString('utf8');
  const ast = parseSync(source, {
    babelrc: false,
    configFile: false,
    sourceType: 'script',
  });
  const definitions = ast.program.body.filter(
    (statement) =>
      statement.type === 'ExpressionStatement' &&
      statement.expression.type === 'CallExpression' &&
      statement.expression.callee.type === 'Identifier' &&
      statement.expression.callee.name === '__d',
  );
  assert.ok(definitions.length > 0, 'No actual Metro module definitions found');
  const factories = new Map(),
    modules = new Map();
  const context = vm.createContext({
    __d: (factory, id, dependencies) =>
      factories.set(id, { factory, dependencies }),
  });
  for (const definition of definitions)
    vm.runInContext(source.slice(definition.start, definition.end), context, {
      timeout: 1000,
    });
  const requireModule = (id) => {
    if (modules.has(id)) return modules.get(id).exports;
    const record = factories.get(id);
    assert.ok(record, `Missing Metro dependency ${id}`);
    const module = { exports: {} };
    modules.set(id, module);
    const importDefault = (dependency) => {
      const value = requireModule(dependency);
      return value?.__esModule ? value.default : value;
    };
    const importAll = (dependency) => {
      const value = requireModule(dependency);
      return value?.__esModule ? value : { ...value, default: value };
    };
    try {
      record.factory(
        context,
        requireModule,
        importDefault,
        importAll,
        module,
        module.exports,
        record.dependencies,
      );
    } catch (error) {
      modules.delete(id);
      throw error;
    }
    return module.exports;
  };
  const findExport = (name) => {
    const candidates = [...factories].filter(([, record]) =>
      record.factory.toString().includes(`.${name}=`),
    );
    assert.equal(
      candidates.length,
      1,
      `Expected one actual implementation of ${name}`,
    );
    const [id] = candidates[0];
    const value = requireModule(id)[name];
    assert.equal(typeof value, 'function', `Missing emitted ${name}`);
    return { id, value };
  };
  const motion = findExport('createDrivenMotion');
  const controller = motion.value({
    spring: { mass: 1, stiffness: 100, damping: 20 },
    position: 0,
    target: 1,
  });
  const sample = controller.advance(0.1);
  const expected = 1 - 2 * Math.exp(-1);
  assert.ok(
    Math.abs(sample.position - expected) < 1e-12,
    'Actual emitted motion must match analytic critical propagation',
  );
  controller.retarget(0.5);
  assert.ok(Number.isFinite(controller.advance(0.1).position));
  const regimes = findExport('mapExpressionRegimes');
  const map = regimes.value(
    { op: 'if', args: [{ op: 'lt', args: [{ ref: 'width' }, 521] }, 1, 2] },
    { width: 390 },
    { input: 'width', min: 320, max: 834, precision: 0.25, maxCells: 128 },
  );
  assert.ok(
    map.cells.some(
      (cell) =>
        cell.status === 'transition-bracket' &&
        cell.input.min <= 521 &&
        cell.input.max >= 521,
    ),
  );
  const receipt = {
    version: 1,
    recordedAt: new Date().toISOString(),
    bundle: path.resolve(file),
    bundleSha256: createHash('sha256').update(bytes).digest('hex'),
    moduleCount: factories.size,
    executedModules: modules.size,
    checks: [
      {
        name: 'actual-emitted-motion-and-schema-construction',
        module: motion.id,
        passed: true,
      },
      {
        name: 'actual-emitted-responsive-regime-analysis',
        module: regimes.id,
        passed: true,
      },
    ],
    scope:
      'Actual web Metro toolkit factories in Node vm; no app bootstrap, browser/native rendering, native driver, model or preference verification.',
    passed: true,
  };
  return receipt;
}
if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  assert.ok(
    process.argv[2],
    'Pass the current exported web Metro JavaScript file',
  );
  const result = await checkMetroRuntime(process.argv[2]);
  if (process.argv[3])
    await writeFile(process.argv[3], JSON.stringify(result, null, 2) + '\n');
  console.log(
    JSON.stringify({
      metroRuntime: result.passed,
      modules: result.moduleCount,
      executedModules: result.executedModules,
      checks: result.checks,
    }),
  );
}

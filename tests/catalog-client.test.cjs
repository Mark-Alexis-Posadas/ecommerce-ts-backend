const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
for (const project of ['ecommerce-ts', 'ecommerce-admin-panel'])
  test(project + ' catalog hook resets pages and ignores stale responses', async () => {
    const states = [];
    const dependencies = [];
    const cleanups = [];
    let index = 0;
    const effects = [];
    const requests = [];
    const react = {
      useState: (initial) => {
        const i = index++;
        if (!(i in states)) states[i] = initial;
        return [
          states[i],
          (next) => {
            states[i] = typeof next === 'function' ? next(states[i]) : next;
          },
        ];
      },
      useEffect: (effect, deps) => {
        const i = index++;
        if (!dependencies[i] || deps.some((v, j) => v !== dependencies[i][j])) {
          cleanups[i]?.();
          dependencies[i] = deps;
          effects.push(() => {
            cleanups[i] = effect();
          });
        }
      },
    };
    const api = {
      get: (_url, config) => new Promise((resolve) => requests.push({ config, resolve })),
    };
    const exports = {};
    const source = fs.readFileSync(
      path.resolve(__dirname, '../../' + project + '/src/hooks/useProducts.ts'),
      'utf8',
    );
    const code = ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.CommonJS },
    }).outputText;
    vm.runInNewContext(code, {
      exports,
      require: (name) => (name === 'react' ? react : { api }),
      AbortController,
    });
    const render = (options) => {
      index = 0;
      return exports.default(options);
    };
    const flush = async () => {
      while (effects.length) effects.shift()();
      await new Promise((r) => setImmediate(r));
    };
    const first = render({ search: 'old' });
    await flush();
    first.setPage(3);
    render({ search: 'old' });
    await flush();
    assert.equal(requests[1].config.params.page, 3);
    render({ search: 'new' });
    await flush();
    assert.equal(requests[2].config.params.page, 1);
    assert.equal(requests[0].config.signal.aborted, true);
    requests[2].resolve({ data: { data: [{ _id: 'new' }], meta: { page: 1, totalPages: 1 } } });
    await flush();
    requests[0].resolve({ data: { data: [{ _id: 'old' }], meta: { page: 1, totalPages: 1 } } });
    await flush();
    assert.equal(render({ search: 'new' }).products[0]._id, 'new');
  });

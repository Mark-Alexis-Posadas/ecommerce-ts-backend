const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const path = require('node:path');
function harness(admin) {
  const state = [];
  const effects = [];
  const deps = [];
  let cursor = 0;
  let role = admin ? 'admin' : 'customer';
  let profileCalls = 0;
  const storage = new Map();
  const events = new Map();
  const token =
    'header.' +
    Buffer.from(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 3600 })).toString(
      'base64url',
    ) +
    '.signature';
  const user = { _id: 'test-user', name: 'Test', email: 'test@example.test', role };
  const React = {
    createContext: () => ({ Provider: 'Provider' }),
    useContext: () => null,
    useCallback: (f) => {
      cursor++;
      return f;
    },
    useState: (init) => {
      const i = cursor++;
      if (!(i in state)) state[i] = init;
      return [
        state[i],
        (v) => {
          state[i] = v;
        },
      ];
    },
    useEffect: (f, d) => {
      const i = cursor++;
      if (!deps[i] || d.some((v, j) => v !== deps[i][j])) {
        deps[i] = d;
        effects.push(f);
      }
    },
  };
  const api = {
    post: async () => ({ data: { ...user, role, token } }),
    get: async () => {
      profileCalls++;
      return { data: { ...user, role } };
    },
  };
  const file = path.resolve(
    __dirname,
    '../../' + (admin ? 'ecommerce-admin-panel' : 'ecommerce-ts') + '/src/context/AuthProvider.tsx',
  );
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const exports = {};
  vm.runInNewContext(code, {
    exports,
    require: (n) =>
      n === 'react'
        ? React
        : n === 'react/jsx-runtime'
          ? { jsx: (type, props) => ({ type, props }) }
          : n.includes('AuthContext')
            ? { AuthContext: { Provider: 'Provider' } }
            : n.includes('authErrors')
              ? {
                  AdminAccessError: class extends Error {
                    constructor() {
                      super('Admin access required');
                    }
                  },
                }
              : { api, TOKEN_KEY: 'test-token' },
    localStorage: {
      getItem: (k) => storage.get(k) || null,
      setItem: (k, v) => storage.set(k, v),
      removeItem: (k) => storage.delete(k),
    },
    window: {
      addEventListener: (k, f) => events.set(k, f),
      removeEventListener: (k) => events.delete(k),
      setTimeout: () => 1,
      clearTimeout: () => {},
    },
    atob: (s) => Buffer.from(s, 'base64').toString(),
    Date,
    Error,
  });
  const render = () => {
    cursor = 0;
    return exports.AuthProvider({ children: null }).props.value;
  };
  return {
    render,
    flush: async () => {
      while (effects.length) effects.shift()();
      await new Promise((r) => setImmediate(r));
    },
    storage,
    events,
    setRole: (r) => {
      role = r;
    },
    profileCalls: () => profileCalls,
  };
}
test('customer session restores, login/logout and expiry update reactive state', async () => {
  const h = harness(false);
  let session = h.render();
  await h.flush();
  await session.login('test@example.test', 'password');
  session = h.render();
  assert.equal(session.user.role, 'customer');
  assert.ok(session.token);
  assert.ok(h.storage.has('test-token'));
  session.logout();
  session = h.render();
  assert.equal(session.user, null);
  assert.equal(session.token, null);
  assert.equal(h.storage.has('test-token'), false);
  await h.flush();
  h.events.get('shopzone:session-expired')();
  assert.equal(h.render().user, null);
});
test('refresh validates stored token via current-user endpoint', async () => {
  const h = harness(false);
  h.storage.set('test-token', 'stored');
  h.render();
  await h.flush();
  assert.equal(h.profileCalls(), 1);
  assert.equal(h.render().user.role, 'customer');
});
test('admin session refuses customer login', async () => {
  const h = harness(true);
  h.setRole('customer');
  const s = h.render();
  await assert.rejects(s.login('test@example.test', 'password'), /Admin access/);
  assert.equal(h.storage.has('test-token'), false);
  assert.equal(h.render().user, null);
});
test('admin refresh rejects stored customer credentials immediately', async () => {
  const h = harness(true);
  h.setRole('customer');
  h.storage.set('test-token', 'stored');
  h.render();
  await h.flush();
  assert.equal(h.render().user, null);
  assert.equal(h.storage.has('test-token'), false);
  assert.equal(h.render().loading, false);
});
test('admin login and logout update reactive state', async () => {
  const h = harness(true);
  const session = h.render();
  await session.login('admin@example.test', 'password');
  assert.equal(h.render().user.role, 'admin');
  assert.ok(h.storage.has('test-token'));
  h.render().logout();
  assert.equal(h.render().user, null);
  assert.equal(h.render().token, null);
  assert.equal(h.render().loading, false);
});

require('ts-node/register/transpile-only');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcryptjs');
const fs = require('node:fs');
const vm = require('node:vm');
const { EventEmitter } = require('node:events');
const ts = require('typescript');
const User = require('../src/models/user.model').default;
const { resetAdminPassword, validateAdminPassword, persistAdminPassword } = require('../src/scripts/resetAdminPassword');

// Synthetic fixtures only. Every persistence operation is mocked.
const password = 'Synthetic-Reset42!';
function harness(overrides = {}) {
  const calls = { connected: 0, disconnected: 0, prompts: 0, hashes: 0, writes: 0 };
  const account = { id: '507f1f77bcf86cd799439011', role: 'admin', passwordHash: 'previous-test-hash' };
  const deps = {
    connect: async () => { calls.connected++; },
    disconnect: async () => { calls.disconnected++; },
    findAccounts: async email => { assert.equal(email, 'alexis@example.com'); return [account]; },
    readSecret: async () => { calls.prompts++; return password; },
    confirm: async () => true,
    hash: async value => { calls.hashes++; return bcrypt.hash(value, 10); },
    updatePassword: async (target, hash) => {
      calls.writes++;
      assert.equal(target.id, account.id);
      assert.equal(bcrypt.getRounds(hash), 10);
      assert.ok(await bcrypt.compare(password, hash));
      return true;
    },
    ...overrides,
  };
  return { calls, deps, account };
}

test('confirmed reset hashes using bcrypt cost 10 and writes once', async () => {
  const h = harness();
  assert.equal(await resetAdminPassword([' ALEXIS@example.com '], h.deps), true);
  assert.equal(h.calls.prompts, 2);
  assert.equal(h.calls.writes, 1);
  assert.equal(h.calls.disconnected, 1);
});

test('invalid arguments never connect or accept a password argument', async () => {
  for (const args of [[], ['invalid'], ['alexis@example.com', 'not-accepted']]) {
    const h = harness();
    await assert.rejects(resetAdminPassword(args, h.deps), /Usage/);
    assert.equal(h.calls.connected, 0);
  }
});

test('missing, duplicate, customer and legacy accounts cannot reset', async () => {
  for (const accounts of [[], [{ role: 'admin' }, { role: 'admin' }], [{ role: 'customer' }], [{}]]) {
    const h = harness({ findAccounts: async () => accounts });
    await assert.rejects(resetAdminPassword(['alexis@example.com'], h.deps), /Exactly one|not an administrator/);
    assert.equal(h.calls.prompts, 0);
    assert.equal(h.calls.writes, 0);
    assert.equal(h.calls.disconnected, 1);
  }
});

test('strength policy rejects weak, overlong and control-character passwords', () => {
  for (const value of ['Short1!', 'onlylowercase42!', 'ONLYUPPERCASE42!', 'MissingNumbers!', 'MissingSymbols42', 'A1!' + 'é'.repeat(35), password + '\n']) {
    assert.throws(() => validateAdminPassword(value), /at least 12/);
  }
  assert.doesNotThrow(() => validateAdminPassword(password));
});

test('weak password, mismatch, cancellation and rejected approval never write', async () => {
  const cases = [
    { readSecret: async () => 'weak' },
    { readSecret: async label => label.startsWith('New') ? password : 'Different-Reset42!' },
    { readSecret: async () => { throw new Error('cancelled'); } },
  ];
  for (const overrides of cases) {
    const h = harness(overrides);
    await assert.rejects(resetAdminPassword(['alexis@example.com'], h.deps));
    assert.equal(h.calls.writes, 0);
    assert.equal(h.calls.hashes, 0);
    assert.equal(h.calls.disconnected, 1);
  }
  const h = harness({ confirm: async () => false });
  assert.equal(await resetAdminPassword(['alexis@example.com'], h.deps), false);
  assert.equal(h.calls.writes, 0);
  assert.equal(h.calls.hashes, 0);
});

test('concurrent account change fails closed and disconnects', async () => {
  const h = harness({ hash: async () => 'test-only-hash', updatePassword: async () => false });
  await assert.rejects(resetAdminPassword(['alexis@example.com'], h.deps), /account changed/);
  assert.equal(h.calls.disconnected, 1);
});

test('persistence updates only the matching admin password, without timestamp changes', async () => {
  const original = User.updateOne;
  try {
    User.updateOne = async (filter, update, options) => {
      assert.deepEqual(filter, { _id: 'target-id', role: 'admin', password: 'original-hash' });
      assert.deepEqual(update, { $set: { password: 'replacement-hash' } });
      assert.deepEqual(options, { runValidators: true, timestamps: false });
      return { matchedCount: 1, modifiedCount: 1 };
    };
    assert.equal(await persistAdminPassword({ id: 'target-id', role: 'admin', passwordHash: 'original-hash' }, 'replacement-hash'), true);
  } finally { User.updateOne = original; }
});

function terminalHarness() {
  const input = new EventEmitter();
  input.isTTY = true;
  input.isRaw = false;
  input.isPaused = () => true;
  input.setRawMode = value => { input.isRaw = value; };
  input.resume = () => {};
  input.pause = () => {};
  const process = new EventEmitter();
  const output = [];
  process.stdin = input;
  process.stdout = { isTTY: true, write: value => output.push(value) };
  const exports = {};
  const source = fs.readFileSync(require.resolve('../src/scripts/resetAdminPassword.ts'), 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true } }).outputText;
  vm.runInNewContext(code, {
    exports, module: {}, process, Buffer,
    require: name => name === 'dotenv/config' ? {} : name === 'node:readline' ? { emitKeypressEvents() {} } : name === '../models/user.model' ? {} : require(name),
  });
  return { input, output, read: exports.readHiddenPassword };
}

test('hidden terminal input never echoes secrets and restores raw mode', async () => {
  const h = terminalHarness();
  const pending = h.read('Hidden: ');
  for (const character of password) h.input.emit('keypress', character, { name: character });
  h.input.emit('keypress', undefined, { name: 'return' });
  assert.ok(await pending === password);
  assert.equal(h.output.join(''), 'Hidden: \n');
  assert.equal(h.input.isRaw, false);
  assert.equal(h.input.listenerCount('keypress'), 0);
});

test('Ctrl+C cancels without echo, cleans up, and piped input is refused', async () => {
  const h = terminalHarness();
  const pending = h.read('Hidden: ');
  h.input.emit('keypress', 'x', { name: 'x' });
  h.input.emit('keypress', undefined, { ctrl: true, name: 'c' });
  await assert.rejects(pending, /cancelled/);
  assert.equal(h.output.join(''), 'Hidden: \n');
  assert.equal(h.input.isRaw, false);
  h.input.isTTY = false;
  await assert.rejects(h.read('Hidden: '), /interactive terminal/);
});

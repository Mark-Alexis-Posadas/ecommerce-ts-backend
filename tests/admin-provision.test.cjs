require('ts-node/register/transpile-only');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const User = require('../src/models/user.model').default;
const { provisionAdmin } = require('../src/scripts/provisionAdmin');
test('provisioning requires approval, dry-run never saves, duplicates fail closed', async () => {
  let connections = 0,
    saves = 0;
  const account = {
    role: 'customer',
    save: async () => {
      saves++;
    },
  };
  let rows = [account];
  mongoose.connect = async () => {
    connections++;
  };
  mongoose.disconnect = async () => {};
  User.find = () => ({ limit: async () => rows });
  process.env.MONGO_URI = 'mongodb://test.invalid/isolated';
  await assert.rejects(provisionAdmin(['admin@example.test']), /Usage/);
  assert.equal(connections, 0);
  await provisionAdmin(['admin@example.test', '--dry-run']);
  assert.equal(saves, 0);
  assert.equal(account.role, 'customer');
  rows = [account, account];
  await assert.rejects(
    provisionAdmin(['admin@example.test', '--approve-role-change']),
    /Exactly one/,
  );
  assert.equal(saves, 0);
  rows = [account];
  await provisionAdmin(['admin@example.test', '--approve-role-change']);
  assert.equal(saves, 1);
  assert.equal(account.role, 'admin');
});

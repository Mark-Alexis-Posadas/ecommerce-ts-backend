const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

function pageHarness(admin) {
  const states = [];
  const dependencies = [];
  const effects = [];
  const cleanups = [];
  const requests = [];
  let cursor = 0;
  let token = 'first-session';
  let id = 'first-order';
  let colorCalls = 0;
  const react = {
    useState(initial) {
      const index = cursor++;
      if (!(index in states)) states[index] = initial;
      return [
        states[index],
        (value) => {
          states[index] = value;
        },
      ];
    },
    useEffect(effect, deps) {
      const index = cursor++;
      if (!dependencies[index] || deps.some((value, i) => value !== dependencies[index][i])) {
        cleanups[index]?.();
        dependencies[index] = deps;
        effects.push(() => {
          cleanups[index] = effect();
        });
      }
    },
  };
  const request = (orderId, bearer) =>
    new Promise((resolve, reject) => {
      requests.push({ orderId, bearer, resolve, reject });
    });
  const components = new Proxy(
    {
      useColorModeValue(light) {
        colorCalls++;
        return light;
      },
    },
    { get: (target, key) => target[key] || key },
  );
  const file = path.resolve(
    __dirname,
    '../../',
    admin
      ? 'ecommerce-admin-panel/src/pages/Orders.tsx'
      : 'ecommerce-ts/src/pages/OrderDetailsPage.tsx',
  );
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const exports = {};
  vm.runInNewContext(code, {
    exports,
    require(name) {
      if (name === 'react') return react;
      if (name === 'react/jsx-runtime')
        return {
          jsx: (type, props) => ({ type, props }),
          jsxs: (type, props) => ({ type, props }),
        };
      if (name === '@chakra-ui/react' || name === 'lucide-react') return components;
      if (name === 'react-router-dom')
        return { useParams: () => ({ id }), useNavigate: () => () => {} };
      if (name.includes('useAuth')) return { useAuth: () => ({ token }) };
      if (name.includes('orderService')) return { getOrderById: request };
      if (name.includes('/api'))
        return { api: { get: (_url, config) => request(null, config.headers.Authorization) } };
      throw new Error('Unexpected module: ' + name);
    },
  });
  return {
    requests,
    render() {
      cursor = 0;
      colorCalls = 0;
      return exports.default();
    },
    async flush() {
      while (effects.length) effects.shift()();
      await new Promise((resolve) => setImmediate(resolve));
    },
    setSession(next) {
      token = next;
    },
    setOrder(next) {
      id = next;
    },
    colorCalls: () => colorCalls,
  };
}

const order = (id) => ({
  _id: id,
  orderItems: [],
  shippingAddress: {},
  totalPrice: 0,
  paymentMethod: 'COD',
  isPaid: false,
  isDelivered: false,
  createdAt: '2026-01-01',
});

test('order details react to IDs and sessions, ignore stale responses and handle failures', async () => {
  const h = pageHarness(false);
  h.render();
  await h.flush();
  assert.equal(h.requests.length, 1);
  h.setOrder('second-order');
  h.render();
  await h.flush();
  assert.equal(h.requests[1].orderId, 'second-order');
  h.requests[1].resolve({ data: order('second-order') });
  await h.flush();
  h.requests[0].resolve({ data: order('stale-order') });
  await h.flush();
  assert.match(JSON.stringify(h.render()), /second-order/);
  assert.doesNotMatch(JSON.stringify(h.render()), /stale-order/);
  h.setSession('second-session');
  h.render();
  await h.flush();
  assert.equal(h.requests[2].bearer, 'second-session');
  h.requests[2].reject(new Error('network failure'));
  await h.flush();
  assert.equal(h.render().props.role, 'alert');
  h.setSession(null);
  h.render();
  await h.flush();
  assert.equal(h.requests.length, 3);
});

test('admin order effect tracks sessions and keeps color hooks unconditional', async () => {
  const h = pageHarness(true);
  h.render();
  assert.equal(h.colorCalls(), 3);
  await h.flush();
  h.setSession('second-session');
  h.render();
  await h.flush();
  assert.equal(h.requests[1].bearer, 'Bearer second-session');
  h.requests[1].resolve({ data: [order('current123')] });
  await h.flush();
  assert.match(JSON.stringify(h.render()), /ent123/);
  assert.equal(h.colorCalls(), 3);
  h.requests[0].resolve({ data: [order('stale456')] });
  await h.flush();
  assert.doesNotMatch(JSON.stringify(h.render()), /ale456/);
});

test('order query failures return safe errors without database details', async () => {
  require('ts-node/register/transpile-only');
  const Order = require('../src/models/order.model').default;
  const { getMyOrders, getOrderById } = require('../src/controllers/order.controller');
  const originalFind = Order.find;
  const originalFindOne = Order.findOne;
  Order.find = async () => {
    throw new Error('private persistence details');
  };
  Order.findOne = () => ({
    populate: async () => {
      throw new Error('private persistence details');
    },
  });
  try {
    for (const handler of [getMyOrders, getOrderById]) {
      let status;
      let body;
      const response = {
        status(value) {
          status = value;
          return this;
        },
        json(value) {
          body = value;
          return this;
        },
      };
      await handler(
        { user: { _id: '507f1f77bcf86cd799439011' }, params: { id: '507f1f77bcf86cd799439012' } },
        response,
      );
      assert.equal(status, 500);
      assert.match(body.message, /Unable to load order/);
      assert.doesNotMatch(JSON.stringify(body), /private persistence details/);
    }
  } finally {
    Order.find = originalFind;
    Order.findOne = originalFindOne;
  }
});

require('ts-node/register/transpile-only');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const jwt = require('jsonwebtoken');
process.env.JWT_SECRET = crypto.randomBytes(32).toString('hex');
const Product = require('../src/models/product.model').default;
const { Category } = require('../src/models/category.model');
const User = require('../src/models/user.model').default;
const Cart = require('../src/models/cart.model').default;
const Order = require('../src/models/order.model').default;
const {
  createProductSchema,
  catalogQuerySchema,
  escapeRegex,
} = require('../src/validators/catalogValidator');
const app = require('../src/app').default;
test('catalog validation, pricing, availability and query contracts with isolated persistence', async () => {
  const id = '507f1f77bcf86cd799439011';
  const categoryId = '507f1f77bcf86cd799439012';
  let categoryActive = true;
  let product;
  let captured;
  let sort;
  let skipped;
  let limited;
  let categoryConflict = false;
  let categoryDoc = new Category({ _id: categoryId, name: 'Category', slug: 'category' });
  categoryDoc.save = async () => {
    await categoryDoc.validate();
    return categoryDoc;
  };
  User.findById = () => ({
    select: async () => ({ _id: id, name: 'Admin', email: 'admin@example.test', role: 'admin' }),
  });
  Category.exists = async (q) =>
    q.$or ? categoryConflict : categoryActive ? { _id: categoryId } : null;
  Category.findById = async () => categoryDoc;
  Product.exists = async () => (product?.isActive !== false ? { _id: id } : null);
  Category.distinct = async () => [categoryId];
  Category.find = () => ({ sort: async () => [] });
  Product.create = async (data) => {
    product = new Product({ ...data, _id: id });
    await product.validate();
    product.save = async () => {
      await product.validate();
      return product;
    };
    return product;
  };
  Product.findById = () => product;
  Product.findByIdAndUpdate = async (_id, update, options) => {
    assert.equal(options.runValidators, true);
    assert.deepEqual(update, { $set: { isActive: false } });
    product.isActive = false;
    return product;
  };
  Product.findByIdAndDelete = () => {
    throw Error('Permanent deletion forbidden');
  };
  Product.countDocuments = async () => 1;
  Product.populate = async (data) => data;
  Product.aggregate = async (pipeline) => {
    captured = pipeline[0].$match;
    sort = pipeline[2].$sort;
    skipped = pipeline[3].$skip;
    limited = pipeline[4].$limit;
    return product && !(captured.isActive?.$ne === false && product.isActive === false)
      ? [product]
      : [];
  };
  Cart.find = () => ({
    limit() {
      return this;
    },
    lean: async () => [
      {
        _id: product._id,
        user: product._id,
        __v: 0,
        items: [{ product: product._id, quantity: 1, price: 150 }],
      },
    ],
  });
  Product.find = (q) => {
    if (q._id) return { lean: async () => (product ? [product.toObject()] : []) };
    captured = q;
    return {
      populate() {
        return this;
      },
      sort(v) {
        sort = v;
        return this;
      },
      skip(v) {
        skipped = v;
        return this;
      },
      limit: async (v) => {
        limited = v;
        return product && !(q.isActive?.$ne === false && product.isActive === false)
          ? [product]
          : [];
      },
    };
  };
  const server = app.listen(0, '127.0.0.1');
  await new Promise((r) => server.once('listening', r));
  const base = 'http://127.0.0.1:' + server.address().port;
  const token = jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: '1h' });
  const request = (path, method = 'GET', body, auth = true) =>
    fetch(base + path, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(auth ? { Authorization: 'Bearer ' + token } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
  const valid = {
    title: 'Item',
    description: 'Description',
    category: categoryId,
    price: 100,
    stock: 5,
    discount: 10,
    images: ['/item.png'],
    isFeatured: true,
  };
  try {
    for (const data of [
      { price: -1 },
      { price: Infinity },
      { discount: 101 },
      { discount: -1 },
      { stock: -1 },
      { stock: 1.5 },
      { sold: 9 },
      { rating: { rate: 5 } },
      { priceAfterDiscount: 1 },
    ])
      assert.equal(createProductSchema.safeParse({ ...valid, ...data }).success, false);
    for (const query of [
      { limit: '101' },
      { page: '0' },
      { search: 'x'.repeat(101) },
      { sort: 'invalid' },
      { category: 'bad' },
    ])
      assert.equal(catalogQuerySchema.safeParse(query).success, false);
    for (const value of ['.*', '[a]', 'a+b', 'x$', '(a)', 'a\\b'])
      assert.equal(new RegExp('^' + escapeRegex(value) + '$').test(value), true);
    let res = await request('/api/products', 'POST', valid);
    assert.equal(res.status, 201);
    assert.equal((await res.json()).priceAfterDiscount, 90);
    res = await request('/api/products/' + id, 'PUT', { price: 200, discount: 25 });
    assert.equal(res.status, 200);
    assert.equal((await res.json()).priceAfterDiscount, 150);
    categoryActive = false;
    assert.equal((await request('/api/products', 'POST', valid)).status, 400);
    assert.equal(
      (await request('/api/products/' + id, 'PUT', { category: categoryId })).status,
      400,
    );
    categoryActive = true;
    const reference = product._id.toString();
    assert.equal((await request('/api/products/' + id, 'DELETE')).status, 200);
    assert.equal(product.isActive, false);
    assert.equal(product._id.toString(), reference);
    res = await request('/api/products', 'GET', null, false);
    assert.equal((await res.json()).data.length, 0);
    assert.deepEqual(captured.isActive, { $ne: false });
    assert.equal((await request('/api/cart', 'POST', { productId: id, quantity: 1 })).status, 409);
    // No order writes or cart clears occur for an unavailable product.
    Cart.findOne = () => ({
      populate: async () => ({ items: [{ product: product._id, quantity: 1, price: 150 }] }),
    });
    Order.create = () => {
      throw Error('Unexpected order write');
    };
    assert.equal(
      (
        await request('/api/orders', 'POST', {
          shippingAddress: {
            firstName: 'A',
            lastName: 'B',
            address: '123 Street',
            city: 'City',
            postalCode: '1234',
            phone: '1234567890',
          },
          paymentMethod: 'COD',
        })
      ).status,
      409,
    );
    assert.equal((await request('/api/products/' + id, 'PUT', { isActive: true })).status, 200);
    assert.equal(product.isActive, true);
    res = await request(
      '/api/products?page=2&limit=5&search=%2E%2A&category=' +
        categoryId +
        '&sort=best_selling&featured=true',
      'GET',
      null,
      false,
    );
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.meta.page, 2);
    assert.equal(data.meta.limit, 5);
    assert.equal(skipped, 5);
    assert.equal(limited, 5);
    assert.deepEqual(sort, { sold: -1, _id: 1 });
    assert.equal(captured.isFeatured, true);
    assert.equal(captured.$or[0].title.$regex, escapeRegex('.*'));
    assert.equal(captured.category.$in.length, 1);
    const oldThreshold = process.env.INVENTORY_LOW_STOCK_THRESHOLD;
    process.env.INVENTORY_LOW_STOCK_THRESHOLD = '7';
    res = await request('/api/products?inventory=low_stock');
    assert.equal(res.status, 200);
    assert.deepEqual(captured.stock, { $gt: 0, $lte: 7 });
    assert.equal((await res.json()).meta.lowStockThreshold, 7);
    assert.equal(
      (await request('/api/products?inventory=low_stock', 'GET', null, false)).status,
      403,
    );
    if (oldThreshold === undefined) delete process.env.INVENTORY_LOW_STOCK_THRESHOLD;
    else process.env.INVENTORY_LOW_STOCK_THRESHOLD = oldThreshold;
    assert.equal(
      (await request('/api/products?visibility=archived', 'GET', null, false)).status,
      403,
    );
    assert.equal((await request('/api/products?visibility=all')).status, 200);
    assert.equal((await request('/api/products/bad', 'PUT', { price: 10 })).status, 400);
    assert.equal(
      (await request('/api/categories', 'POST', { name: 'Category', slug: 'bad slug' })).status,
      400,
    );
    assert.equal(
      (await request('/api/categories/' + categoryId, 'PUT', { isActive: false })).status,
      409,
    );
    product.isActive = false;
    assert.equal(
      (await request('/api/categories/' + categoryId, 'PUT', { isActive: false })).status,
      200,
    );
    assert.equal(categoryDoc.isActive, false);
    assert.equal(
      (await request('/api/categories/' + categoryId, 'PUT', { isActive: true })).status,
      200,
    );
    categoryConflict = true;
    assert.equal((await request('/api/categories', 'POST', { name: 'Category' })).status, 409);
  } finally {
    server.closeAllConnections();
    await new Promise((r) => server.close(r));
  }
});

test('Mongoose enforces numeric and image constraints without connecting to a database', async () => {
  const base = {
    title: 'Test',
    description: 'Description',
    category: '507f1f77bcf86cd799439012',
    price: 20,
    stock: 3,
    images: ['/image.png'],
  };
  for (const invalid of [
    { price: -1 },
    { price: NaN },
    { discount: 101 },
    { stock: 1.5 },
    { stock: -1 },
    { images: [], image: undefined },
    { images: ['javascript:alert(1)'] },
  ])
    await assert.rejects(new Product({ ...base, ...invalid }).validate());
  const free = new Product({ ...base, discount: 100 });
  await free.validate();
  assert.equal(free.priceAfterDiscount, 0);
});

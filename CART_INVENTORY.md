# Phase 4: cart and product-level inventory

## Policy and limits

- Carts do not reserve or deduct stock. Inventory remains product-level.
- Adds/increments must fit the stock read during validation. Archived products,
  inactive/missing categories, missing products and invalid pricing are rejected.
- Stock can change after a successful cart request. GET and every mutation return
  a newly validated snapshot; invalid lines remain visible and removable. Decreases
  and removals are permitted for unavailable/overstocked items.
- Cart quantities must be positive safe integers. Combined quantities are checked,
  not just the increment. Duplicate legacy lines block increases and checkout;
  removing that product removes all of its duplicate lines as an explicit user action.
- Empty carts and carts with issues are not checkout eligible.

## API contract

All existing cart endpoints require a bearer token and scope persistence to the
authenticated user's database ID. They now return the same `CartResponse`:

```ts
{
  _id: string;
  user: string;
  version: number;
  currency: "PHP";
  items: Array<{
    _id: string;                 // cart-line identity
    productId: string;           // retained even when the product no longer exists
    product: Product | null;
    quantity: number;
    price: number | null;        // compatible effective unit price in pesos
    unitPriceCentavos: number | null;
    lineTotal: number | null;    // compatible peso value
    lineTotalCentavos: number | null;
    availableStock: number;
    available: boolean;         // product/category enabled; stock is checked separately
    issues: CartIssue[];
  }>;
  totalQuantity: number;
  subtotal: number;              // compatible peso value
  subtotalCentavos: number;
  checkoutEligible: boolean;
  issues: CartIssue[];
}
```

GET `/api/cart` retrieves/initializes the logical cart. POST accepts exactly
`{productId, quantity}`. PUT `/increment` and `/decrement` accept exactly
`{productId}`. DELETE `/:productId` removes the product; DELETE `/` clears the cart.
Malformed input is 400; missing product/line is 404; unavailable product, excess
stock, duplicate carts/lines or exhausted concurrency retries are 409. Errors use
`{code, message, errors?, cart?}`. Conflict snapshots let the frontend display the
current quantities/issues rather than keeping optimistic stale values.

Issue codes: UNAVAILABLE, INVALID_QUANTITY, INSUFFICIENT_STOCK, INVALID_PRICE and
DUPLICATE_PRODUCT. Monetary fields are null when current pricing cannot be safely
calculated. The subtotal includes safely calculable lines, including archived lines
that still have valid pricing; missing/invalid-price lines are excluded and always
block checkout. It is not a payable quote while any issue exists.

## Authoritative pricing

Stored cart `price` values are not trusted. Each response and checkout preparation
reads the current product base price/percentage discount. `cartPricing.ts` converts
the number's decimal representation to BigInt fractions, rounds the effective unit
price half-up to integer centavos, and checks safe-integer line/cart totals. A 100%
discount correctly gives zero. Overflow is reported and blocks checkout. Client
prices, line totals and subtotals are rejected/ignored rather than trusted.

Canonical calculation fields end in `Centavos` and are integers (100 centavos =
PHP 1). Existing `price`, `lineTotal`, `subtotal` and new order snapshot price fields
remain in pesos for compatibility. The frontend formats the server's centavo
values; it does not multiply prices or recompute totals. Historical orders are not
rewritten. Current product images/categories are loaded without losing missing
product IDs, so stale references can still be removed.

## Concurrency strategy and guarantees

`loadCart` reads at most two carts for an owner. More than one is an explicit 409;
the application does not pick, merge, delete or silently repair existing carts.
For a previously unseen owner, atomic upsert uses the user ObjectId as the new cart
ObjectId. The mandatory `_id` index prevents duplicate initialization by this code
even before the user-cart index is deployed. Duplicate-key initialization races
reload the winning owner cart. Existing single carts retain their original IDs.

Mutations do not call document `save()`. They copy the latest items, validate the
intended change, and issue an atomic compare-and-swap update matching `_id`, `user`
and `__v`; the write increments `__v`. A missed version reloads/revalidates/retries
(maximum 12 attempts), preventing accepted simultaneous writes from overwriting
each other. Legacy missing `__v` is accepted as zero. Persistent contention returns
CART_BUSY. Readers may observe a subsequent accepted mutation in their response.

These are single-document cart guarantees, not cross-document stock reservations.
All deployed writers must use the version protocol. Old binaries, external database
writes or manual edits can bypass it. A database-level unique user index is still
required to guarantee one cart per user across every writer, not merely the new
initialization path. Real MongoDB concurrency has not been exercised here.

## Index deployment: approval required, not executed

The cart schema declares `unique_cart_user` on `{user:1}` but sets `autoIndex:false`
and `autoCreate:false`. No startup code calls `syncIndexes`, builds this index or
merges/deletes carts. No migration was executed during implementation.

An operator must first inspect current indexes and audit the intended database:

```js
db.carts.getIndexes();
db.carts.aggregate([
  { $group: { _id: '$user', ids: { $push: '$_id' }, count: { $sum: 1 } } },
  { $match: { count: { $gt: 1 } } },
]);
db.carts.find({ $or: [{ user: { $exists: false } }, { user: null }] }, { _id: 1, user: 1 });
db.carts.aggregate([
  { $unwind: '$items' },
  { $group: { _id: { cart: '$_id', product: '$items.product' }, count: { $sum: 1 } } },
  { $match: { count: { $gt: 1 } } },
]);
```

Also audit invalid/unsafe quantities, missing item product IDs, invalid version
values, dangling user references and malformed legacy prices. Full-array update
validators may reject a partially repaired legacy cart; explicit user clearing is
available, and any administrative repair needs separate approval. Do not repair
or delete records automatically. Back up data and stop/upgrade legacy writers;
obtain explicit approval for reconciliation rules and the migration. Only after a
clean audit and approval should an operator run:

```js
db.carts.createIndex({ user: 1 }, { unique: true, name: 'unique_cart_user' });
```

Do not execute the createIndex example against unverified existing data. Recheck
for duplicates during deployment and verify that the resulting index is unique.

## Admin inventory visibility

Product listing accepts admin-only `inventory=in_stock|out_of_stock|low_stock`
(`all` is the default). In-stock filtering includes all positive stock; low stock
is the subset 1..threshold. Product results include inventoryStatus and metadata
includes lowStockThreshold. `INVENTORY_LOW_STOCK_THRESHOLD` is an optional backend
environment variable: nonnegative safe integer, default 5; zero disables low-stock
classification. Invalid values fall back to 5. No environment file was changed.

## Phase 5 boundary: checkout is still not transactional

`prepareCartForCheckout` reuses current pricing, availability and quantity checks
and refuses known-invalid carts. Existing order creation uses that snapshot and
only clears the cart if its version still matches. A concurrent cart edit is kept
and reported as `cartClearConflict:true`; the customer must review remaining items.
Neither this helper nor the client disabled button prevents concurrent overselling.

Stock/category/product state can change after validation. Orders are not idempotent,
stock is not deducted, and order creation/cart clearing are not one transaction.
Failures or repeated submissions can produce duplicate orders or leave an order
with a nonempty cart. Phase 5 must implement transactional COD placement, final
price validation, immutable snapshots, stock deduction and idempotency. Cancellation
and restocking remain Phase 6. No variant inventory was implemented.

## Verification boundaries

Run `node --test tests/*.test.cjs`. Cart tests use isolated in-memory repositories,
mocked Mongoose writes and mocked catalog reads. HTTP tests bind an ephemeral local
port without connecting to any database. Simultaneous-request tests verify the CAS
algorithm against atomic mocks; write-shape tests check Mongo predicates. They do
not prove real MongoDB scheduling, unique-index deployment or cross-process stock
consistency. Client hook tests execute hydration, stale responses, logout, pending
guards and server-conflict responses with mocked React/HTTP dependencies. Rendered
browser behavior and real MongoDB integration remain staging verification tasks.

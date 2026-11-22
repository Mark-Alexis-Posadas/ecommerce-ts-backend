# Product and category management

## API contracts

Public `GET /api/products` retains `{data, meta}`. Parameters:

- `page`: 1–100000, default 1; `limit`: 1–100, default 10.
- `search`: literal text, trimmed and limited to 100 characters; searches title,
  description and brand. Regex metacharacters are escaped.
- `category`: category ObjectId; `featured`: `true` or `false`.
- `sort`: `latest`, `low_to_high`, `high_to_low`, `top_rated`, `best_selling`.
  Existing empty/`none` sorts remain supported. Prices sort by effective price;
  every sort includes `_id` as a deterministic tie breaker.
- `visibility`: `active` (default), `archived`, or `all`. The latter two require
  admin authentication. Supplied bearer credentials are verified even on reads.

Metadata contains page, limit, total, totalPages, hasNextPage and hasPrevPage.
Invalid queries return 400. Public reads exclude archived products and products
with missing or inactive category references. Detail reads return 404 when hidden.

Admin product POST/PUT accepts only title, description, category, price, stock,
discount, brand, image, images, isFeatured and isActive. Creation requires title,
description, category, price, stock and at least one image. Updates are partial;
the resulting document is validated through Mongoose save. Clients cannot write
sold, ratings, IDs or calculated prices. Numeric JSON values are required.

Images retain the URL/local-path mechanism: http(s) URLs without embedded
credentials or root-relative local paths. There is no uploader or external host.
Discounts are 0–100%; price is finite and nonnegative (maximum 1e12); stock is a
nonnegative safe integer. Discounted prices round to two decimal places.
Create/update save hooks calculate the price; reads calculate the same value,
including legacy documents with missing/stale calculated prices, without writes.

DELETE `/api/products/:id` now archives by setting isActive=false, with update
validators enabled. PUT with isActive=true restores after validating the complete
document and active category. No product is physically deleted; IDs, cart refs and
historical order snapshots remain unchanged. Legacy missing isActive means active.
Cart additions/increments and order creation reject archived products or products
under unavailable categories with 409. This does not implement stock deduction,
reservations, transactionality or variant inventory.

`GET /api/categories` still returns an array; `/api/products/categories` retains
`{data}`. Both hide inactive categories by default. Admins can request
`visibility=all`. Category mutations remain admin-only and validate names, slugs,
descriptions, images and availability. Slugs may be supplied or generated from the
name. Duplicate names are checked case-insensitively; duplicate names/slugs return
409. DELETE now deactivates instead of removing the document. Deactivation is
blocked with 409 while active products reference the category. Restoration uses
PUT with isActive=true.

Validation responses use `{message, errors: {field: string[]}}`. Invalid path IDs
return 400, nonexistent records 404, and forbidden visibility filters 403.

## Database deployment and legacy considerations

No migrations, index commands, provisioning or production database operations were
executed. Before deployment, audit legacy missing images, invalid numeric values,
orphan category references, duplicate names/slugs and slugs that cannot be generated
from non-ASCII names. Full product edits/restoration require valid resulting data;
archiving intentionally only validates the availability update.

Review and explicitly approve indexes for product category/availability/newest,
featured/newest, sold and rating sorts, and a case-insensitive unique category-name
index. Existing name/slug unique declarations are retained; reconcile duplicates
before changing indexes. No new index declarations trigger automatic migrations.

Effective-price sorting is computed in aggregation and may require an in-memory
sort. Unanchored multi-field search and deep offset pagination may become costly;
benchmark against real data before choosing additional search/index strategies.
Listing data/count are separate reads and may briefly differ during mutations.

Category availability checks and product mutations are separate operations:
concurrent requests across processes can race with category deactivation or product
archiving. Strict cross-document consistency requires an approved transactional
design later. Historical order documents are never rewritten by catalog mutations.

## Verification

Run `node --test tests/*.test.cjs` from the backend directory. Tests use mocked
model operations and local Mongoose document validation without a DB connection.
They verify HTTP contracts, authorization, price changes, archive/restore, category
availability, query construction, and client cancellation/page-reset behavior.
Real MongoDB aggregation/index behavior, concurrent cross-document mutations,
image loading and rendered browser interactions still require staging checks.

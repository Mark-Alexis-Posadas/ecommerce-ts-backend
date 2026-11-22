# Authentication and authorization

## Roles and API permissions

Users have `customer` or `admin` roles. Missing legacy roles are treated as
customers without rewriting records. Signup ignores supplied roles and always
creates a customer. Tokens contain the user ID; permissions are read from the
database on every authenticated request, so role changes take effect immediately.

Public: product list/details, both category listing endpoints, signup and login.
Authenticated: `/api/auth/me`, cart operations, order creation, own order history
and own order details. Order detail queries include the authenticated user ID;
missing, malformed and inaccessible order IDs return 404. Admins also use their
own order endpoints; no all-orders administration endpoint is introduced here.
Admin only: product/category mutations and user listing.
Missing/invalid/expired tokens return 401; insufficient roles return 403.

Signup/login return `{ _id, name, email, role, token }`. Current-user returns
the same public user fields without a token. Password hashes are never serialized
by these endpoints. Registration trims names and lowercases/trims emails, requires
a valid email and a password of at least 8 characters and at most 72 UTF-8 bytes.
Login failures for malformed or incorrect credentials use a generic 401 response.

## Admin provisioning — operator action only

No default credentials or public admin signup exists. First register the intended
account as a customer. After obtaining explicit authorization for the database
role change, run from the backend directory:

```sh
node -r ts-node/register src/scripts/provisionAdmin.ts <account-email> --approve-role-change
```

The CLI uses the operator's configured database connection, finds the exact
normalized email, and promotes only that existing account. It does not create
accounts or accept passwords. Do not run without approval for the selected
database/account. This implementation did not run provisioning or migrations.

## Sessions and deployment

JWTs use HS256 and expire after seven days. Configure a strong private JWT_SECRET
on the backend. Frontends use separate `shopzone.customer.token` and
`shopzone.admin.token` localStorage keys; legacy stored sessions must log in again.
Refresh validates the token with `/api/auth/me`. Clients clear sessions on expiry
or authenticated 401 responses. Admin login and restoration reject customers.
Logout discards local state/token; the logout endpoint is informational and does
not revoke issued bearer tokens. A copied token remains valid until expiration
unless the user is removed or the signing key is rotated. localStorage remains
subject to same-origin XSS; use HTTPS and a restrictive deployment CSP.

Set VITE_API_URL to the backend origin for each frontend. Set backend CORS_ORIGINS
to a comma-separated explicit list of trusted frontend origins. The default list
contains only local development origins on ports 5173 and 5174. Configure deployed
origins explicitly; no wildcard origin reflection is used. CORS is not an access
control substitute.

## Database requirements and deferred work

No existing records were changed. Before adding a normalized unique email index,
audit existing emails for casing/whitespace and duplicates, obtain migration
approval, reconcile conflicts, and then create the index. No automatic migration
or index creation was added. Until then simultaneous registrations can duplicate
emails. Legacy mixed-case emails may need an approved normalization migration.

Rate limiting, refresh-token rotation/revocation, password reset, email verification,
inventory consistency and order fulfillment remain outside this phase. COD is the
only accepted checkout method.

## Isolated verification

```sh
node --test tests/*.test.cjs
node node_modules/typescript/bin/tsc --noEmit --incremental false
```

HTTP tests mock all accessed model methods and never connect to MongoDB. They use
a randomly generated test-only signing secret. Client-session tests execute the
provider with mocked React hooks, storage and HTTP calls. Cart/guard source checks
are structural checks, not browser integration tests. Full browser login, refresh,
cart and logout flows still require staging smoke testing.

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

Before promotion, verify the account without changing records:

```sh
node -r ts-node/register src/scripts/provisionAdmin.ts <account-email> --dry-run
```

Both modes require exactly one account matching the normalized email. Duplicate
accounts fail closed; resolve duplicates through a separately approved process.
The CLI disables automatic index creation and never prints credentials.

### Troubleshooting admin login

A registered customer is not an administrator. A successful backend login can
therefore be followed by an intentional dashboard rejection. Verify the role with
the dry-run command before treating the rejection as a credential failure.

The admin login screen distinguishes invalid credentials, insufficient role,
server failures and network/CORS failures. Authentication requests time out after
10 seconds. Session restoration validates `/api/auth/me` before rendering admin
pages; customer sessions are cleared immediately. Logout clears the session and
loading state, and logout in another tab invalidates this tab's admin session.
Only the reactive admin user state redirects from login to the dashboard.

For local development, the API must be reachable at the configured VITE_API_URL
and the browser's exact frontend origin must appear in CORS_ORIGINS (or match a
documented local default). Restart Vite/backend after changing their environment
configuration. Never solve a role rejection by weakening the dashboard guard or
adding public admin signup.

## Sessions and deployment

### Interactive administrator password reset

Run this manually in an interactive PowerShell terminal, from the backend folder:

```powershell
cd C:\Users\Alexis\Desktop\fullstack-projects\fullstack\ecommerce-ts-backend
node -r ts-node/register src/scripts/resetAdminPassword.ts alexis@example.com
```

The script reads the existing backend database configuration. Verify that it
targets the intended database before running it. It does not promote accounts:
the target must already exist with the admin role, and exactly one normalized
email match must exist. A customer or legacy account without a role is rejected.

1. Enter a new password at `New password (hidden):`. Nothing is echoed, including
   masking characters. Type it directly; do not pass passwords on the command
   line, pipe them, or paste multiple lines.
2. Enter the identical password at `Confirm new password (hidden):`.
3. Review the displayed target email. Type exactly `RESET` and press Enter to
   approve the database update. Any other answer cancels. Ctrl+C cancels a prompt.

Passwords require at least 12 characters, uppercase and lowercase ASCII letters,
a number, and a non-whitespace symbol, with a maximum of 72 UTF-8 bytes and no
control characters. The script uses bcrypt cost 10, matching registration.
Passwords and hashes are never logged. Non-interactive input is refused.

The update sets only the selected account's password: it does not modify roles,
other users, or timestamps. Its atomic filter also checks the admin role and the
original password hash. Concurrent role/password changes cause it to fail closed.
Database connections and hidden-prompt terminal mode are cleaned up on completion
or cancellation. No reset was executed during implementation.

Existing JWTs are not revoked by this reset; they retain the expiration behavior
described below. The script is an operator tool, not a public password-reset API.

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

Rate limiting, refresh-token rotation/revocation, public password recovery, email verification,
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

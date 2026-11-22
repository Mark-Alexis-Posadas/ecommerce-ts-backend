# ShopZone engineering standards

These rules apply to all work in the customer storefront, admin dashboard and
backend. Inspect the implementation and relevant local instructions before editing.
Keep this shared standards section identical in the root and application AGENTS.md
files so individual repositories remain self-contained.

## Code quality

- Write clean, maintainable, strongly typed TypeScript. Preserve strictness.
- Apply SOLID, DRY, KISS and YAGNI pragmatically; favor readable code over unnecessary abstractions.
- Avoid explicit any, @ts-ignore and unsafe type assertions. Validate unknown data and narrow types instead.
- Remove unused imports and avoid dead code. Use descriptive names.
- Comment complex business decisions, not obvious code.
- Follow the existing architecture, file organization and naming conventions.

## Formatting

- Format every newly created or modified source file with Prettier before completing a task.
- Use the checked-in configuration: 100-column target, two spaces, no tabs, semicolons,
  single quotes, trailing commas everywhere supported, and LF line endings.
- Format only task-related paths. Do not format unrelated files during feature development.
- The format script requires explicit paths: npm run format -- <changed-paths>.
- A full formatting cleanup is a separate, explicitly scoped formatting-only task.

## React frontends

- Use functional components and hooks correctly. Follow the React Rules of Hooks.
- Extract reusable components and custom hooks when justified, without speculative abstractions.
- Keep API calls in services/data hooks, separate from presentation components.
- Handle loading, error, empty and success states, including pending/duplicate submissions.
- Ensure responsive layouts, accessible labels, keyboard navigation and visible focus states.
- Preserve ShopZone branding and UI consistency; use existing Tailwind/Chakra configurations.

## Backend

- Keep routes, controllers, services, models and validators properly separated.
- Validate untrusted input with Zod and implement authorization on the server.
- Never trust client-provided prices, roles or computed totals.
- Use consistent API response contracts and appropriate HTTP status codes.
- Handle errors without exposing sensitive information or raw credential-bearing request objects.

## Database and business rules

- ShopZone is Cash on Delivery (COD) only. Do not introduce payment gateways.
- Use integer centavos for monetary calculations; document compatible peso-valued API fields.
- Preserve historical order snapshots. Never allow negative inventory.
- Respect transaction and concurrency requirements. Never claim a snapshot check reserves stock.
- Never execute migrations, destructive operations or production data changes without approval.
- Never silently merge/delete duplicate carts or build indexes against unaudited existing data.

## Security

- Never hardcode or expose secrets. Never log passwords, hashes or authentication tokens.
- Preserve role-based access control and resource ownership on the backend.
- Never bypass authentication or role checks to fix functionality.
- Validate and sanitize external inputs; use explicit writable-field allowlists.
- Do not enable public administrator registration.

## Development workflow

- Inspect existing implementation and Git status before editing. Preserve uncommitted user changes.
- Make focused, minimal modifications; do not implement unrelated features or advance phases without approval.
- Add regression tests for changed business logic using isolated/mocked persistence, never production data.
- Before completion, run formatting on changed files, TypeScript checks, existing lint commands,
  automated tests and relevant builds. Do not disable quality rules to hide failures.
- Report actual verification results, limitations and pre-existing failures separately.
- Never claim unexecuted tests passed. Provide a suggested Conventional Commit message.

## Backend workflow

- Express/TypeScript/Mongoose with Zod. Preserve server-side roles, ownership and COD-only validation.
- Use npm run typecheck, npm run lint and npm test in this directory. ESLint checks TypeScript,
  Node tests and tooling configuration with Prettier compatibility. No backend build script exists.
- Read CART_INVENTORY.md, CATALOG.md and AUTHENTICATION.md before changing those business flows.
- Cart validation does not reserve/deduct inventory. Transactional checkout requires separate approval.
- Never run provisioning, password reset, migration or index commands as part of routine verification.

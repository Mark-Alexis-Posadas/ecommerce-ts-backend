# Backend engineering tooling

Read AGENTS.md. Run commands from this directory:

```sh
npm run format -- src/path/to/changed-file.ts
npm run format:check
npm run typecheck
npm test
```

Formatting requires explicit paths; do not rewrite the entire application during feature work.
Prettier 3.10.1 is pinned. VS Code settings require the Prettier extension. There is no existing
backend ESLint configuration or lint/build script; no rules were disabled or invented.

Verified on 2026-11-22: TypeScript and all 41 existing isolated tests passed. The npm test script
wraps node --test tests/*.test.cjs. Cross-application tests expect sibling frontend repositories.
No production database is used. Provisioning/password-reset scripts are never routine tests.

Whole-app format check reports 42 existing files requiring a separate formatting-only cleanup,
including test files. Only representative src/services/cartPricing.ts was formatted in this task.
No monetary behavior, persistence, authentication or inventory logic was changed.

# Backend engineering tooling

Read AGENTS.md. Run commands from this directory:

```sh
npm run format -- src/path/to/changed-file.ts
npm run format:check
npm run typecheck
npm run lint
npm test
```

Prettier 3.10.1 and eslint-config-prettier 10.1.8 are pinned. Formatting uses the checked-in
configuration and excludes dependencies, generated artifacts, lockfiles, environment files and
binary assets. Use explicit changed paths during feature development. A whole-app formatting
pass is reserved for a dedicated formatting-only cleanup, as authorized on 2026-11-22.

VS Code settings require the Prettier and ESLint editor extensions; none were installed
automatically. Code-quality rules remain enabled. TypeScript strictness is unchanged.

## Cleanup verification: 2026-11-22

Full formatting check, TypeScript and ESLint pass with zero errors or warnings.
All 45 isolated tests passed (41 existing plus four cleanup regressions).
Backend ESLint initially reported seven errors. Fixes use standard imports and Express module augmentation, safe order errors, an omitted unused catch binding and equivalent numeric control-character checks.

ESLint uses recommended JavaScript and TypeScript rules with Node globals. It checks source, CJS tests and MJS tooling. The lint script rejects warnings. No backend build script exists. Tests use isolated/mocked persistence; do not run provisioning, password reset or database maintenance as routine verification. Cross-application tests expect sibling frontend repositories.

The installed ESLint 9 package emits an upstream end-of-support warning. This matches the existing frontend major; a coordinated tooling-major upgrade remains separate work.

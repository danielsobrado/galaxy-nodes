# Contributing

Thanks for improving Galaxy Nodes. This repo is a TypeScript library package with a Vite-powered example app.

## Local Setup

```bash
npm install
npm run ci
```

Use `npm run dev` for the local example app and `npm run preview` after building the example.

## Pull Request Checklist

- Add or update tests for behavior changes.
- Run `npm run lint`, `npm run format:check`, `npm test`, `npm run build`, and `npm run build:example`.
- Update `README.md`, `docs/examples.md`, or the focused examples when public usage changes.
- Update `CHANGELOG.md` for user-visible changes, especially breaking changes.

## Versioning

Galaxy Nodes is currently `0.x`, so breaking API changes may ship in minor releases. Still, every breaking change should be documented with migration notes. Patch releases should stay bug-fix only.

## Style

ESLint and Prettier are the source of truth for code style. Run `npm run format` before sending large formatting edits; avoid unrelated rewrites in feature PRs.

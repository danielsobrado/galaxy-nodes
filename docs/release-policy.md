# Release and Stability Policy

Galaxy Nodes uses Changesets for versioning, changelog generation, git tags, and npm publishing.

## Supported Runtime Range

- Node.js: `>=26.3.0 <27`
- React peer dependency: `>=18.2.0 <20`
- three peer dependency: `>=0.160.0 <1`

CI exercises Node 26 across React 18/19 and the minimum/latest supported three versions.

## Semver Contract

Before `1.0.0`, public API changes should still be intentional and documented, but minor releases may contain API adjustments needed to reach a stable design.

At `1.0.0` and later:

- Patch releases are limited to backwards-compatible bug fixes, documentation fixes, and dependency hygiene.
- Minor releases may add backwards-compatible APIs, presets, options, and non-breaking behavior.
- Major releases are required for removed exports, renamed exports, changed peer dependency ranges, changed option semantics, or visual/interaction changes that require consumer code changes.

Public API changes are reviewed through the checked-in API Extractor report before release.

## Release Gate

Run the full CI gate before publishing:

```bash
npm run ci
npm run benchmark:browser
```

`npm run package:check` validates the `npm pack --dry-run --json` contents so required distribution files are present and source, examples, coverage, and generated docs are not accidentally published. The scheduled browser performance workflow records the 10k/100k runtime envelope separately from PR CI because GPU timing is environment-sensitive.

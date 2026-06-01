---
'galaxy-nodes': major
---

Remove the demo presets from the published package (BREAKING).

The `galaxy-nodes/presets/initiatives`, `galaxy-nodes/presets/initiatives/core`,
`galaxy-nodes/presets/markets`, and `galaxy-nodes/presets/markets/core` subpath
exports have been removed. The initiatives and markets presets were always
demo-only consumers of the public API, so they now live with the examples
(`examples/shared/presets/`) and are no longer part of the published package.

Consumers that imported `generateGalaxyDataset`, `createInitiativeAccessors`,
the `renderInitiative*` detail renderers, or the related types from
`galaxy-nodes/presets/*` should copy the preset source from
`examples/shared/presets/initiatives` into their own project, or generate their
own dataset and accessors against the documented dataset shape.

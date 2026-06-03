# Changelog

All notable changes to Galaxy Nodes will be documented in this file.

This project follows semantic versioning once the public API reaches `1.0.0`. Until then, minor versions may include breaking changes and each breaking change should be called out in this changelog.

## 0.2.0

### Breaking changes

- Moved bundled market and initiative presets out of the core library package and into shared example code. Consumers should keep application-specific preset data in their own app layer instead of importing presets from `galaxy-nodes`.
- Reorganized the internal source layout into domain, engine, adapter, and UI modules. Public package exports remain the supported integration surface; deep internal imports from `src` are not stable.

### Added

- Added Vue and Angular package entry points alongside the existing core and React exports.
- Added `expectedSize` and `renderMode` options so large or streamed graphs can choose the edge render tier up front.
- Added `nodeSizeScale` to globally tune rendered node point size, with a larger default so nodes read better against relationships.
- Added delayed node hover detail panels next to hovered nodes, configurable with `hoverDetailDelayMs` and defaulting to 2 seconds.
- Added scale-mode relationship rendering for very large graphs, using lightweight line edges and avoiding per-edge hit proxies.
- Added built-in theme presets, `galaxy-dark` and `network-light`, plus theme resolution helpers and an opt-in React theme selector.
- Added API report coverage for the core, React, Vue, and Angular entry points.
- Added browser coverage for renderer behavior, edge render mode selection, marker rendering, streaming append behavior, and visual baseline checks.
- Added demo controls for legends, keyboard legends, cluster visibility, status focus, motion, graph size, and galaxy mode.

### Changed

- Split the renderer into focused engine modules for configuration, lifecycle, scene types, postprocessing, point cloud buffers/materials, markers, labels, materials, and edge helpers.
- Raised the enforced bundle budgets to 21 KB for the core renderer chunk and 10 KB for the React visualizer chunk after the large-graph render tiers, node scaling, and hover-detail features.
- Improved dense graph readability with adaptive point opacity, selective bloom, quieter highlight glow, MSAA rendering, and half-float scene accumulation.
- Kept node rendering improvements in place, including bloom markers, point-size floor, and current node focus sizing.
- Made selection resolve by node and edge id so selection survives streamed dataset merges such as Expand neighbors.
- Reduced backdrop jumps during focus by keeping ambient stars, clusters, fog, and global point opacity stable.
- Dimmed non-connected relationships during selection while preserving their original relationship colors.
- Extended `theme` to accept preset ids or custom objects; legacy color-only objects still merge over `galaxy-dark`, while `network-light` uses theme-owned graph colors for readability.
- Improved the example app layout, controls, styling, and generated documentation/demo assets.

### Fixed

- Fixed Expand neighbors clearing selection because merged datasets replaced node and edge object references.
- Fixed relationships turning green when they were connected or dimmed by node selection.
- Fixed edge shader shimmer/noise by removing the shader-based relationship path from normal edge rendering.
- Fixed tiny distant points flickering by enforcing a minimum point sprite pixel size.
- Fixed dense additive rendering saturating the scene background and relationship web too aggressively.
- Fixed Motion on/off regressions by keeping renderer lifecycle updates scoped and test-covered.

## 0.1.0 - 2026-05-31

- Initial public alpha package for reusable React + Three.js galaxy graph visualizations.
- Added generic graph types, layout resolution, dataset parsing, market presets, styles, and the Vite example app.

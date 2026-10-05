# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Architectural design system documentation for `Tooltip` component (`design-system/documentation/tooltip.md`) detailing the z-index token layering scale, accessibility contracts, and usage patterns.
- Comprehensive z-index hierarchy and stacking validation tests in `src/components/__tests__/Tooltip.test.tsx` verifying alignment with `design-system/tokens/z-index.json`.
- Typography primitive `Text` component (`src/components/Text.tsx`) supporting
  the five typographic roles (display, title, body, caption, mono) with
  polymorphic rendering via an `as` prop.
- Typography helper utilities in `src/utils/typography.ts`.
- ESLint v9 flat configuration (`eslint.config.js`) with React, TypeScript, and
  React Hooks support.
- Figma type-scale handoff specification (`TYPOGRAPHY_SCALE_FIGMA_SPEC.md`)
  documenting all 15 type styles (5 roles x 3 breakpoints) and per-page
  specification frames.
- Unit tests for `design-system/src/utils/token-loader.ts`
  (`design-system/src/__tests__/token-loader.test.ts`) covering valid JSON
  parsing, missing-file and malformed-JSON error handling, and resilient token
  merging in `getAllTokens`. Tests are hermetic via `jest.mock('fs')` and reach
  over 95% coverage for the loader.

### Changed

- Aligned the typography CSS custom properties in `src/index.css` to
  `design-system/tokens/typography.json`, including dedicated font-weight
  variables for all five roles and the Inter font family from the design tokens.
- Applied the responsive typography scale across the core pages and layout
  (Layout, Home, Vaults, CreateVault) using the `Text` component, with scaling
  at the `sm` (<640px), `md` (640-768px), and `lg` (>=768px) breakpoints.

### Removed

- Removed dead `classifyTypography` export in `src/utils/typography.ts` and retired redundant wrapper tests in favor of direct `Text` component composition (#1254).

### Verified

- WCAG 2.1 AA compliance for the typographic roles: 15.5:1 contrast ratio
  (#e8edf5 on #0a0e17), interactive touch targets >= 44x44px, logical keyboard
  focus order, and a semantically correct heading hierarchy.
- `npm run build` and `npm run lint` pass with no new issues introduced.

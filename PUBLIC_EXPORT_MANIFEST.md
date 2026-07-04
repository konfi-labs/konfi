# Public Export Manifest

Generated from Konfi private repository current tree.

Included tracked files: 3981
Excluded tracked files: 16

This export intentionally omits third-party branded logo assets that need
redistribution review. Agent onboarding files are preserved because they
document first-time setup and repository workflows.

Private release-preparation tooling is omitted from the public repository.
The root `package.json` is sanitized during export to remove private-only
scripts such as `open-source:export`.

The private repository can keep customer/default dedicated storefront branding.
The public export replaces the default store logo fallback with a Logoipsum
placeholder logo documented in `THIRD_PARTY_NOTICES.md`.

Generated provider API packages were included to preserve the public repository developer experience. See `THIRD_PARTY_NOTICES.md` for provider API-description and generated-client provenance.

## Excluded path rules

- `apps/admin/public/assets/integrations/`
- `apps/store/public/assets/payments/`
- `docs/open-source-release.md`
- `scripts/export-open-source.mjs`

## Explicitly included third-party assets

- `apps/admin/public/assets/integrations/model-context-protocol-favicon.svg`

## Sanitized files

- `package.json`: removes private root scripts:
  - `open-source:export`
- Store default logo fallbacks replaced for public export:
  - `apps/store/public/assets/logo.svg`
  - `apps/store/public/assets/logo.png`

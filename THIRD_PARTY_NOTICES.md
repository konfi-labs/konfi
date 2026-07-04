# Third-Party API Client Provenance

Konfi includes internal workspace packages for third-party service integrations.
These packages are not published to npm as part of the open-source release.
The Konfi-authored source is intended to be Apache-2.0, but provider API
descriptions, generated clients, names, and marks may be subject to separate
upstream terms.

The provider packages are included in the public repository to preserve local
developer experience and interoperability. Their inclusion does not imply
provider endorsement, partnership, or a trademark license. To the extent a file
contains provider-authored API documentation, endpoint descriptions, examples,
or names, that material remains attributable to the relevant provider and should
be used consistently with the provider's current API terms.

## Generated clients

The following packages contain Kiota-generated TypeScript clients:

| Package              | API description file                       | Generated output              | Source noted in repo                                    |
| -------------------- | ------------------------------------------ | ----------------------------- | ------------------------------------------------------- |
| `@konfi/allegro`     | `packages/allegro/allegro-api.yaml`        | `packages/allegro/client`     | Allegro public REST API documentation and issue tracker |
| `@konfi/fakturownia` | `packages/fakturownia/fakturownia-api.yml` | `packages/fakturownia/client` | Fakturownia public API documentation                    |
| `@konfi/epaka`       | `packages/epaka/epaka-api.yml`             | `packages/epaka/client`       | Epaka API description maintained in this repository     |
| `@konfi/polkurier`   | `packages/polkurier/polkurier-api.yml`     | `packages/polkurier/client`   | Polkurier API/SDK documentation                         |

The generated TypeScript code is produced by Microsoft Kiota from the checked-in
API descriptions. Regenerate clients from the package-level `generate-sdks`
scripts instead of editing generated output by hand.

## Redistribution notes

The checked-in API descriptions are derived from public provider documentation,
public API specification endpoints, public SDK material, or local integration
work. The repository does not contain explicit upstream open-source license
grants for every provider document. Before publishing these packages as
standalone artifacts, confirm the current provider terms:

- Allegro documents its public API through the Allegro developer portal and
  GitHub API project. Public precedent exists for generated Allegro clients that
  use `https://developer.allegro.pl/swagger.yaml`, including MIT packages on
  GitHub/Packagist.
- Fakturownia maintains public API documentation on GitHub and in the product,
  and describes the API as open. The documentation repository did not expose a
  clear SPDX license during review.
- Polkurier provides a public SDK repository that GitHub reports as MIT.
- Epaka publishes an API/OpenAPI surface publicly, but no explicit
  redistribution license was found during review.

If a provider asks for generated material to be removed or regenerated from an
upstream download step, treat that as a release blocker and update the package
promptly.

## Brand assets

Integration and payment-provider logos are excluded from the public source
export and replaced in the UI with neutral icons or text badges. This keeps the
open-source tree usable without redistributing trademark artwork under the
project license.

The Paczkomat/InPost delivery logo is included because InPost publishes
downloadable logo materials and implementation guidance for e-commerce delivery
method presentation. The asset remains an InPost trademark/provider asset and is
not licensed as Konfi-owned Apache-2.0 artwork.

The public export uses Logoipsum logo 280 for the default store logo fallbacks
at `apps/store/public/assets/logo.svg` and `apps/store/public/assets/logo.png`.
Logoipsum describes its placeholder logos as usable for personal and commercial
projects without required attribution. Treat it as placeholder artwork and
replace it with tenant/customer branding in real storefront deployments.

## Dependency license review

Konfi's checked-in source is intended to be Apache-2.0, but installed npm
dependencies keep their own licenses. Before each public release, review
`pnpm licenses list --json` and treat unexpected non-permissive or unknown
license metadata as a release-owner decision.

Current notable findings:

- `@img/sharp-win32-x64@0.34.5` declares
  `Apache-2.0 AND LGPL-3.0-or-later` as part of Sharp's native binary package.
- `@sentry/cli` packages declare `FSL-1.1-MIT` and are used as tooling/runtime
  dependencies of the Sentry integration stack.
- `@vercel/cli-auth`, `khroma`, and `valid-url` may be reported as `Unknown`
  by pnpm, but the installed package license files are Apache-2.0 or MIT-style.

Previously, `@codesandbox/nodebox@0.1.8` entered the graph through
`@mdxeditor/editor` -> `@codesandbox/sandpack-react` and carried the Sustainable
Use License 1.0. Konfi does not use MDXEditor's Sandpack/code-runner plugins, so
the root pnpm override removes that unused Sandpack stack from the install graph.

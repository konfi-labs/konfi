# Coverage Gaps

Use this file for missing standards, disputed guidance, and candidates that need
evidence before becoming rules, lint checks, exemplars, or evals.

## Open Gaps

- No accepted product-design exemplars are recorded yet. Add shipped PR examples
  only after review, including useful decisions and known flaws.
- Admin orders and production need accepted decision records for count states,
  bulk actions, status filters, and detail/list/preview consistency.
- Product configuration and pricing need decision records for stale prices,
  quantity previews, provider import failures, and configuration-not-found
  recovery.
- Checkout and payment flows need decision records for externally visible
  failures, retry states, receipts, invoices, and provider-specific statuses.
- Tenant and channel access needs decision records for partial access language,
  permission boundaries, empty states, and rule-level security promises.
- AI generation surfaces need decision records for loading, retry, model/provider
  errors, generated-content review, and unsupported inputs.

## Candidate Deterministic Checks

These are not accepted rules yet. Verify reliability and false positives before
promoting them to lint or scripted checks.

- Icon-only controls require accessible names.
- User-visible strings in app TSX files should go through `useT()` or `getT()`.
- App code should avoid raw hex colors and raw palette shades when semantic
  tokens exist.
- New/refactored UI should avoid `NativeSelect` unless the surrounding surface
  already intentionally uses it.
- Repeated local card or container styling should be promoted to a component,
  recipe, slot recipe, or shared wrapper.
- Modal content should preserve accessible focus flow and scroll behavior.
- Small static option sets may be better as visible segmented/radio controls
  than a hidden dropdown, but only where the existing Chakra pattern supports it.

## Gap Template

```text
Gap:
Surface:
Observed problem:
Evidence:
Risk if untreated:
Candidate destination: reference | exemplar | lint | eval | no change
Owner/reviewer:
Open questions:
```

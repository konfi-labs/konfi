# Copy

Load this reference for visible strings, labels, errors, helper text, accessible
names, confirmations, empty states, and translation work.

## Rules

### rule/translated-user-copy

Scope: All user-visible UI copy in admin and store.

Rule: Use `useT()` or `getT()` and update every existing locale file for the
touched app and namespace. Include accessible labels, placeholders, tooltips,
toast text, empty states, and alt text.

Why: Hardcoded copy creates localization drift and inaccessible controls.

Source: root `AGENTS.md` and `i18n` skill.

### rule/utility-copy-for-admin

Scope: Admin dashboards, forms, tables, production views, settings, and
operational tools.

Rule: Prefer utility copy over marketing copy. Headings and helper text should
orient, explain scope, report freshness/status, or clarify action.

Why: Admin users scan to operate, monitor, and decide.

Good examples: "Selected KPIs", "Plan status", "Last sync", "Production queue".

Avoid: campaign-style taglines, metaphors, and feature descriptions that do not
help the operator act.

### rule/store-copy-literal-first

Scope: Storefront, product pages, configurators, cart, checkout, and account
flows.

Rule: Keep product, option, price, delivery, and payment copy literal before
brand expression. Brand voice can support the task but must not obscure required
choices or consequences.

Why: Commerce confidence depends on clear options, totals, and next steps.

### rule/destructive-action-labels

Scope: Delete, archive, cancel, void, disconnect, revoke, reset, and similar
actions.

Rule: Destructive CTAs should use a specific Verb + Noun label and nearby copy
that names the object, scope, consequence, and reversibility. Avoid "Confirm",
"OK", or a bare verb.

Why: Users need to know exactly what they are committing.

### rule/stable-loading-labels

Scope: Buttons, menu items, and command controls with async loading.

Rule: Keep the control label stable when loading when possible, and use a
loading/busy affordance to communicate progress.

Why: Replacing labels can hide the action being performed and cause layout
shift.

### rule/actionable-errors

Scope: Form errors, async failures, provider failures, payment failures, and
generation failures.

Rule: Error copy should state what failed, what the user can do next when known,
and whether retrying is useful. Do not expose raw technical errors except in
developer/debug surfaces.

Why: Recoverability matters more than blame.

## Review Checklist

- The primary action label is specific and consequence-aware.
- Empty, error, and permission states explain why the user is blocked and what
  to do next when the system knows.
- Accessible names exist for icon-only controls and match the visible action.
- Admin copy is operational; store copy is literal first.
- All touched copy is translated across existing locale directories.

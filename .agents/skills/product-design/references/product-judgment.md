# Product Judgment

Load this reference for shaping, implementing, hardening, full reviews, or any
change that affects a user's task, default, scope, consequence, navigation,
interaction surface, permission model, or reachable states.

## Compact Decision Brief

Use this internally before choosing UI:

```text
User:
Job:
Surface:
Object:
Scope:
Current behavior:
Desired outcome:
Primary action:
Consequence:
Reversibility:
Permissions:
Validation and errors:
Async side effects:
Non-goals:
Evidence:
Assumptions:
Open decisions:
```

## Rules

### rule/surface-before-solution

Scope: Any user-facing change.

Rule: Identify the real surface before deciding or editing: admin, store,
desktop, shared component, route handler result, or cross-app wrapper.

Why: Konfi UI often appears local while the actual source of truth is shared or
mirrored.

Exceptions: Tiny local copy or icon edits where search confirms no mirrored
surface.

### rule/object-scope-consequence

Scope: Primary, destructive, billing, production, order, customer, tenant, and
configuration actions.

Rule: Important actions must make the object, scope, and consequence clear in
the visible label, nearby text, or confirmation flow.

Why: Operators need to understand what will change before committing an action.

Exceptions: Low-risk inline controls where the object and consequence are already
unambiguous from the row or field label.

### rule/mirrored-surfaces

Scope: Features that exist in admin/store, detail/list/preview, compact/full, or
shared-wrapper variants.

Rule: Treat mirrored surfaces as part of the design scope unless the user
explicitly narrows the task and the untouched surfaces cannot drift.

Why: Partial UI changes are a repeated source of follow-up regressions in this
repo.

Exceptions: A verified single-use component with no shared consumer.

### rule/product-logic-before-ui

Scope: Forms, permissions, prices, order state, production state, checkout,
tenant access, AI generation, and any side-effecting action.

Rule: Inspect the product logic that determines allowed actions, validation,
errors, returned data, and side effects before judging the UI.

Why: The right interface often depends on what the system can actually do,
retry, reverse, or explain.

Exceptions: Purely static presentational work.

### rule/default-before-setting

Scope: Requests to add toggles, settings, filters, preferences, or extra
configuration.

Rule: Prefer a stronger default, clearer state, or direct behavior before adding
configuration the user must learn and maintain.

Why: New controls create product surface area and support burden.

Exceptions: Users need persistent, material control over different legitimate
workflows.

## Evidence Template

Use this format when promoting a decision into guidance:

```text
Decision:
Status: proposed | accepted | rejected
Scope:
Rule:
Why:
Evidence:
Exceptions:
Bad example:
Good example:
Assumptions:
Open decisions:
```

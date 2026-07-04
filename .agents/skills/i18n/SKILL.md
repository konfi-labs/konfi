---
name: i18n
description: Handle internationalization (i18n) tasks, including refactoring hardcoded text into translation keys and building new components with built-in localization. Use when asked to translate, localize, add i18n, manage translation files (en.json, pl.json), or ensure consistent i18n patterns across the codebase.
---

# i18n (Internationalization)

This skill guides the implementation of internationalization (i18n) using the project's framework (Next.js App Router + i18next). It applies to both refactoring existing code and building new components from scratch.

## Objectives
- Ensure ALL user-visible UI copy is localized (no hardcoded strings).
- Replace hardcoded text in TSX/JS files with translation keys.
- Use translation hooks (`useT`) or server-side functions (`getT`) for all new UI strings.
- Reuse existing keys when possible to avoid duplication.
- Maintain consistent naming conventions and structure in JSON translation files.

## Workflow

### 1. Analysis (Refactoring or New Features)
- Read translation files in every existing locale directory for the touched app and namespace, e.g. `apps/{app}/app/i18n/locales/*/translation.json` or `apps/{app}/app/i18n/locales/*/order.json`.
- Infer naming conventions (typically camelCase, nested components/pages).
- Note interpolation patterns (e.g., `{{count}}`, `{name}`).

### 2. Identifying Strings
- **New Components**: Identify all static and dynamic text that will be shown to the user.
- **Refactoring**: Scan for hardcoded strings in button labels, aria-labels, alt text, headings, placeholders, helper text, tooltips, notifications, etc.
- **Ignore**: Internal technical constants, data keys, test IDs, or strings already localized.

### 3. Key Decision Logic
- **Reuse**: If an identical value exists with similar semantics, use the existing key.
- **Create**: If no suitable key exists, create a brand new one following the inferred pattern (e.g., `feature.component.element`).
- **Interpolation**: For dynamic text (e.g. `` `Hello ${name}` ``), use tokens: `"greeting": "Hello {{name}}"` and `t("greeting", { name })`.
- **Plurals**: Follow the project's convention for plural keys (e.g., `count_one`, `count_other`).

### 4. Implementation Patterns

#### Client Components (`'use client'`)
```tsx
import { useT } from "@/i18n/client";

// Inside component
const { t } = useT();

// Usage
<Button>{t("actions.save", { defaultValue: "Save" })}</Button>
<Input placeholder={t("auth.login.emailPlaceholder", { defaultValue: "Email" })} />
```

#### Server Components
```tsx
import { getT } from "@/i18n";

// Inside Server Component
const { t } = await getT();

// Usage
<h1>{t("page.title", { defaultValue: "Welcome" })}</h1>
```

### 5. Key Design Rules
- **Location**: Place keys under the most specific existing group (e.g., `orders.details`).
- **Casing**: Match existing style (typically `camelCase`).
- **Nesting**: Maintain consistent depth. Avoid unnecessary top-level namespaces.

## Constraints & Output Requirements
- **No Hardcoded Strings**: Never output `<span>Hello</span>`; always use `<span>{t("...", { defaultValue: "Hello" })}</span>`.
- **Surgical Edits**: Only modify what is necessary.
- **JSON Integrity**: Ensure valid JSON syntax and maintain alphabetical order if the file already uses it.
- **Default Values**: Always provide the English `defaultValue` in the code calling `t()`.
- **Multi-locale Sync**: When adding a key, ensure it is added to every existing locale file for the touched namespace, not only the primary locale files.

## Validation Checklist
1. Did I avoid hardcoding any user-visible strings in the new component?
2. Did I reuse existing keys where appropriate?
3. Does the JSON remain valid and correctly ordered?
4. Do the interpolation tokens in code match the JSON keys exactly?
5. Are all necessary imports (`useT` or `getT`) added?

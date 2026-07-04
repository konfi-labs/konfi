# Design system guide

This repo uses **one shared Chakra design foundation** with **two app-level expressions**:

- `packages/components` owns the reusable UI building blocks and the shared theme primitives.
- `apps/admin` and `apps/store` each create their own Chakra `system`, then layer app-specific typography, global layout rhythm, animations, recipes, and slot recipes on top.

The result is a design system that is intentionally shared at the token/component level, while still letting admin feel like an operational workspace and store feel like a branded commerce surface.

## 1. Ownership map

| Area | Source of truth | Notes |
| --- | --- | --- |
| Shared palettes | `packages/components/src/theme/palettes/*` | `primary` plus shared accent and neutral palettes live here. |
| Shared theme exports | `packages/components/src/theme/public.ts` | Exposes `themeColors`, gradients/shadows, and the shared button recipe. |
| Shared component library | `packages/components/src/components/shared/**` | Cross-app business UI belongs here first. |
| Shared Chakra wrappers | `packages/components/src/components/ui/**` | Chakra v3 wrappers such as `ColorModeProvider`, `Toaster`, `Tooltip`, `Select`, and other compound helpers. |
| Admin theme | `apps/admin/theme/**` | Builds the final admin `system` and admin-only recipes/slot recipes. |
| Store theme | `apps/store/theme/**` | Builds the final store `system` and store-only recipes/slot recipes. |

## 2. How Chakra is wired in this repo

Chakra v3's documented model is `defineConfig` -> `createSystem` -> `ChakraProvider`. Konfi follows that directly:

- `apps/admin/app/[lng]/providers.tsx` mounts `<ChakraProvider value={system}>` with the admin theme.
- `apps/store/app/[lng]/providers.tsx` mounts `<ChakraProvider value={system}>` with the store theme.
- Both apps also use shared UI infrastructure from `@konfi/components`, especially `ColorModeProvider` and `Toaster`.

This means **app themes are the last mile**, but **shared package exports are the foundation they inherit from**.

## 3. Token model

### 3.1 Shared color foundations

Shared palette data comes from `packages/components/src/theme/palettes`:

- `brand.ts` defines the `primary` brand ramp.
- `accents.ts` defines reusable accent palettes like `red`, `pink`, `purple`, `blue`, `green`, `orange`, and similar status/feature colors.
- `neutral.ts` defines neutral ramps like `gray`, `bluegrey`, and `brown`.

Both apps import `themeColors` from `@konfi/components/theme` via their local `theme/colors.ts`, so the base color inventory is shared.

### 3.2 Semantic colors

Both app themes generate the same semantic color slots for **every palette**:

- `solid`
- `contrast`
- `fg`
- `muted`
- `subtle`
- `emphasized`
- `focusRing`

Those slots are created dynamically in each app theme from the shared raw palettes, with light/dark values defined per slot. This is the main repo-specific design rule: **components should usually talk in semantics, not raw shades**.

Common usage patterns already present in the repo:

- `colorPalette="primary"` for Buttons, Badges, Cards, Tags, and related components
- `color="primary.solid"` for icons, loaders, and emphasized text
- `bg="primary.subtle"` for quiet emphasis backgrounds
- Chakra semantic neutrals like `bg.subtle`, `fg.muted`, `border`, and `border.emphasized` for general surfaces and text hierarchy

### 3.3 Typography tokens

Typography is app-specific:

| App | Heading font | Body font | Intent |
| --- | --- | --- | --- |
| Admin | DM Sans | DM Sans | Dense, operational, dashboard-like |
| Store | Unbounded | Montserrat | Brand-forward, marketing + commerce |

Both apps define those font tokens inside their app theme, not in `packages/components`.

### 3.4 Sizes, spacing, radii, and other non-color tokens

Konfi currently **does not define a custom global spacing/size/radius scale** in app themes or the shared theme package. In practice:

- **colors**, **fonts**, and **animations** are the main customized global tokens
- **spacing**, **sizes**, **radii**, and most layout scales come from Chakra's default system
- repeated component-level sizing is expressed through **recipes** and **slot recipes**, not through a separate custom global size token layer

Examples:

- shared button recipe sets `borderRadius: "full"`
- badge recipes set `px`, `py`, and bold weight
- app slot recipes control structure and sizing for Dialog, Select, Tabs, Tag, Toast, Tooltip, Card, and other compound components

So when extending the design system, prefer this order:

1. use existing Chakra tokens (`sm`, `md`, `lg`, `full`, `4`, `6`, etc.)
2. if a pattern repeats, codify it in a recipe/slot recipe
3. only add new global tokens when the value becomes a true cross-app design primitive

## 4. Shared theme primitives from `packages/components`

`packages/components/src/theme` is intentionally small and foundational.

It currently provides:

- shared color palettes through `themeColors`
- reusable gradients and shadows through `themeGradients` and `themeShadows`
- a shared button recipe via `themeButtonRecipe`

The shared button recipe is important because both apps re-export it locally and then use it as part of their final recipe set. Its custom variants (`blurGlow`, `ai`) are built around semantic tokens and virtual color-palette tokens such as:

- `colorPalette.solid`
- `colorPalette.contrast`

That matches Chakra guidance: semantic tokens and color-palette virtual tokens should be used inside recipes instead of hardcoded colors.

## 5. App-level customization

### 5.1 Admin

Admin keeps the shared palette model but adds a more operational shell:

- background defaults to `gray.50` in light mode and `gray.950` in dark mode
- global CSS includes Electron-specific affordances like `.titleBar` drag styling
- main content spacing is tighter than store and optimized for app chrome/tooling density
- heading recipe uses `fontWeight: 500`
- admin has extra slot recipe coverage for workspace-like components such as `actionBar` and `editable`

In practice, admin UI should feel efficient, compact, and information-dense while still using the same token language as store.

### 5.2 Store

Store uses the same shared palette model but pushes a more branded front door:

- light background starts at white instead of gray
- headings use Unbounded and body copy uses Montserrat
- global `main` padding is much larger because the storefront carries hero, marketing, and footer rhythm
- heading recipe uses `fontWeight: 600`
- store keeps a slightly narrower slot-recipe set focused on commerce surfaces rather than workspace controls

Store UI should read as brand-led and spacious, but still resolve state, emphasis, and status through the same semantic token system.

## 6. Recipe and slot recipe strategy

Both apps define local `recipes` and `slotRecipes` folders. This is where most reusable sizing, spacing, structure, and component polish should live.

Shared pattern:

- `recipes`: simple one-part components such as `button`, `badge`, `heading`, `input`, `inputAddon`, `skeleton`
- `slotRecipes`: multi-part components such as `alert`, `card`, `dialog`, `menu`, `numberInput`, `select`, `tabs`, `tag`, `tagsInput`, `toast`, `tooltip`

Admin adds a few workspace-specific slot recipes beyond store, notably `actionBar` and `editable`.

**Guideline:** if the change is about one component family's recurring appearance or sizing, prefer a recipe/slot recipe over scattered per-screen overrides.

## 7. Component-package guidance

`packages/components` should be treated as the first stop for reusable UI:

- business/domain UI shared by admin and store belongs in `components/shared`
- Chakra composition helpers and v3 wrappers belong in `components/ui`
- shared app infrastructure already lives there (`ColorModeProvider`, `Toaster`, field/select wrappers, tooltips, status components, etc.)

This is especially important because many product, order, form, and layout surfaces are already shared there. If a UI pattern appears in both apps, documenting or implementing it only inside one app usually creates drift.

## 8. Practical rules for future work

### Prefer semantic tokens over raw shades

Good:

- `colorPalette="primary"`
- `color="primary.solid"`
- `bg="primary.subtle"`
- `color="fg.muted"`
- `borderColor="border.emphasized"`

Avoid defaulting to:

- raw palette references like `primary.500` in app code
- custom hex values in components
- ad hoc inline styling when a semantic or recipe-based token already exists

Use raw shades mainly when defining palettes or building semantic tokens inside the theme itself.

### Keep shared foundations shared

- If a palette, gradient, shadow, or base recipe should apply across both apps, change it in `packages/components/src/theme`.
- If the change is about app shell, typography, spacing rhythm, or app-specific compound components, change it in the relevant app theme.

### Treat non-color scale changes carefully

Because Konfi mostly relies on Chakra defaults for spacing/sizes/radii:

- avoid inventing a parallel token scale inside random components
- prefer Chakra defaults first
- promote repeated patterns into recipes before adding new global tokens

### Regenerate Chakra typings after theme work

Chakra's docs recommend running type generation after theme changes, and this repo already codifies that with:

```bash
pnpm chakra:typegen
```

Any change to custom recipes, slot recipes, or theme tokens should keep typings in sync.

## 9. Recommended workflow for design changes

1. Check whether the surface already exists in `packages/components/src/components/shared/**`.
2. Check whether the visual rule belongs in a recipe/slot recipe instead of the page component.
3. Use semantic tokens first, especially `colorPalette`, `primary.*`, `fg.*`, `bg.*`, and `border.*`.
4. Keep admin/store differences intentional: typography, layout rhythm, and shell behavior may differ, but the token language should stay aligned.
5. Regenerate Chakra typings after theme-level edits.

## 10. External references

These repo decisions line up with Chakra UI guidance:

- Chakra theming architecture: `defineConfig` + `createSystem` + `ChakraProvider`
  - https://chakra-ui.com/docs/theming/overview
- Chakra semantic tokens
  - https://chakra-ui.com/docs/theming/semantic-tokens
- Chakra recipes and slot recipes
  - https://chakra-ui.com/docs/theming/recipes

In short: **Konfi's design system is shared by default, specialized by app only where necessary, and expressed primarily through Chakra semantic colors plus recipe-driven component structure.**

---
agent: agent
description: "Map a cross-cutting Konfi feature before implementation"
---

Map the requested Konfi feature or bug across the repository before editing.

Input I will provide:

- Feature, bug, or flow name:
- Known issue key or PR, if any:
- Any suspicious files or symptoms:

Return a concise implementation map with:

1. Entry points and user-facing surfaces.
2. Shared components, hooks, utilities, server actions, API routes, packages, and tests involved.
3. Current state/data flow, including local state, SWR keys, server calls, generated clients, and WASM/browser boundaries when relevant.
4. Mirrored surfaces that must stay in sync, such as admin/store, list/detail/preview, compact/full variants, shared component/wrapper usage, and print/export paths.
5. Risks and hidden-test concerns.
6. A surgical edit plan with candidate files and the smallest useful verification command.

For imposition, dynamic pricing, external-provider import, or preview bugs, assume the issue may be local preview state, SWR cache keys, unsaved form state, or browser/WASM boundaries before assuming backend misconfiguration.

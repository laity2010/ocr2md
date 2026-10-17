# Settings Contract v1 — public extension surface (V5)

**Ownership:** each module owns its own settings declaration, defaults and effects. Settings owns only its five UI-display preferences and the generic AG/CodeMirror display, edit, validation and persistence engine. WCP composition does not import other modules' private Settings implementation.

## Register

Each enabled plugin exports `settings` (array of JSON-safe field descriptors) from its own `index.js`. The existing `plugins/registry.generated.js` imports plugin indexes and `app.js` enumerates `plugin.settings`. The plugin-specific code is never imported by Settings.

An item includes `id`, `label`, `type` (`boolean|integer|number|string`), `defaultValue`, `component`, `featureGroup`, optional `options`, `min`, `max`, `pattern`, `description`. IDs are globally unique; duplicate IDs and unsupported data types fail initialization. The Shell dispatches **once, before WCP mount/prewarm**:

`document.dispatchEvent(new CustomEvent('wcp:settings:catalog-v1', {detail:{registrations:[{ownerId:'ocr2md:example',schema:[...] }]}}))`

Only registered, enabled plugins are included. Uninstalled plugins never surface in Settings AG, but their previously stored values remain inert and are not deleted or broadcast.

## Get and save notifications

A module reads only its scope, including defaults, synchronously after registration:

`document.dispatchEvent(new CustomEvent('wcp:settings:read-v1', {detail:{ownerId:'ocr2md:example',reply:values=>{ ... }}}))`

After the user presses standard WCP `保存配置` and generic validation and localStorage persist succeed, Settings publishes:

`document.addEventListener('wcp:settings:changed-v1', event=>{if(event.detail.ownerId==='ocr2md:example')consume(event.detail.values)})`

Only owned values are included in the event; the module has no private DOM, storage or direct import dependencies on Settings. Settings does not execute domain effects (e.g. Vault cookie enrollment). The plugin applies its own side effects and handles errors.

## Stable invariants

- Plugin addition/removal requires **zero** changes to `plugins/settings/`, the shared Settings authority, or the WCP kernel.
- No other plugin may import `plugins/settings/` directly, touch its localStorage key, or inspect its DOM to retrieve values.
- Persistent storage is `ocr2md-v5-ui-settings-v1` for compatibility; inactive legacy fields are preserved silently. No secret credentials are written by Settings.
- Registration is performed at app composition before Settings prewarm; live hot-registration is not part of Contract v1. New plugin builds are deployed immediately through the existing V5 publisher.
- The settings contract is declarative and versioned. Adding new field types would be a separate Settings-owner feature, not a business-plugin patch.
- Tests: `node plugins/settings/tests/settings-contract-v1.mjs` and `node plugins/settings/tests/settings-contract-browser.mjs`. The browser test injects a disposable three-field plugin via the **registry HTTP response**, checks that authoritative Settings source hashes stay identical, and exercises real Chromium/WebKit AG editing, save, notifications, reload and removal.

## Visible component versions (V5 development)
The Shared Settings `components-values` grid displays a read-only `版本号` column.
The values come solely from the runtime WCP component catalog passed through
`setComponentCatalog([{id,name,version}])`, including parameter-less component rows;
versions never enter the saved JSON, setting IDs or event payload.
Internal services stay registered with WCP but remain hidden from the user-facing Settings view.
The WCP build badge is noninteractive (`catalogVisible:false`) in V5, so versions
are not duplicated in a separate component-list popup.

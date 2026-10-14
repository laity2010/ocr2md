# ocr2md v3 — Actual Obsidian Vault Root probe

This is a **mobile-compatible Obsidian plugin**, not the Web IndexedDB demo.
It uses Obsidian's active `app.vault` as `/`; it never guesses a physical Files.app URL.

Build: `npm run build`. Install `manifest.json` and `main.js` under
`<actual vault>/.obsidian/plugins/ocr2md-v3-vault-probe/`.
Enable manually in Obsidian Community Plugins.

Use command **打开真实 Obsidian Vault Root 验收** to inspect actual root and `/ocr2md/`.
To create a fresh test note under `/ocr2md/`, explicitly check the consent box and press write/read.
No existing content is deleted or overwritten; `.obsidian/` is hidden from browsing.

This does not yet provide the native bridge to the `v3-directory` webpage. See
`docs/v3/WP2-IPAD-OBSIDIAN-ROOT.md` for scope and manual iPad validation.

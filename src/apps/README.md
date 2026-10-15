# apps

One folder per app: `manifest.js`, `index.js`, `styles.css`, `i18n/{en,de}.json`, `help.md`.
Apps may import only their own files, `ui/` and `styles/`; everything else goes through `ctx` (enforced by ESLint).

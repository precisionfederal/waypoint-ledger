# Type in this folder

Three families, self-hosted so the app makes no third-party request:

| Family | Files | Licence | Verified |
|---|---|---|---|
| Bricolage Grotesque | `bricolage-grotesque-latin.woff2`, `bricolage-grotesque-latin-ext.woff2` | SIL Open Font License 1.1 | `https://fonts.google.com/metadata/fonts/Bricolage%20Grotesque` → `"license":"ofl"` (fetched 2026-09-09) |
| Figtree | `figtree-latin.woff2`, `figtree-latin-ext.woff2`, `figtree-italic-latin.woff2`, `figtree-italic-latin-ext.woff2` | SIL Open Font License 1.1 | `https://fonts.google.com/metadata/fonts/Figtree` → `"license":"ofl"` (fetched 2026-09-09) |
| JetBrains Mono | `jetbrains-mono-latin.woff2`, `jetbrains-mono-latin-ext.woff2` | SIL Open Font License 1.1 | `https://fonts.google.com/metadata/fonts/JetBrains%20Mono` → `"license":"ofl"` (fetched 2026-09-09) |

The OFL permits bundling and serving these files from our own origin, including in a
commercial product, as long as they are not sold on their own and the licence travels
with them. That is what this file is.

Downloaded 2026-09-09 from `fonts.gstatic.com` via the `fonts.googleapis.com/css2`
stylesheet the app used to load at runtime; the `@font-face` rules in `app/fonts.css`
keep Google's own `unicode-range` subsetting, so nothing about how the type renders
changed — only where the bytes come from.

# Sieve

A tiny Manifest V3 browser extension that mints a unique, traceable email alias for whatever site you're on.

Click the toolbar icon → **Generate** → the address is on your clipboard and stays visible until you generate again.

```
netflix.k3m7p2@example.com
```

Hand a different address to every service, then search your inbox for the alias when spam arrives. If mail reaches it from anyone but the original sender, you know exactly who leaked it.

## Features

- **One click, one alias.** Slug comes from the current tab's registrable domain, token is freshly random.
- **Clipboard on generate**, plus a Copy button to re-copy without minting a new one.
- **Persists.** Close the popup, restart the browser — the last alias is still there until you generate again.
- **Log of the last 200** aliases, exportable as JSON or CSV.
- **Light and dark** themes that follow your OS.
- **No network access.** Nothing leaves the machine; the public suffix list is bundled.

## Install

### Chromium (Chrome, Brave, Edge)

1. Open `brave://extensions` (or `chrome://extensions`, `edge://extensions`).
2. Enable **Developer mode**.
3. **Load unpacked** and select this folder — or `dist/chrome` after running a build.
4. Pin **Sieve** to the toolbar.

Loading this folder directly keeps the extension ID stable, so your saved domain and log survive. Pointing the browser at a different folder produces a different ID and a fresh, empty store.

### Firefox

Firefox has no permanent "load unpacked" — temporary add-ons disappear when the browser closes.

**Temporary, for development:** open `about:debugging` → *This Firefox* → **Load Temporary Add-on** → select `dist/firefox/manifest.json`. Works immediately, gone on restart.

**Permanent:** the build must be signed by Mozilla. See [Publishing to AMO](#publishing-to-amo-unlisted).


## First run

Open the options page (gear icon in the popup, or *Details → Extension options*) and set the **domain** aliases should route to, e.g. `example.com`. Generate refuses to run until that's set.

Before relying on it, make sure your mail provider accepts a catch-all for that domain. **Sieve mints addresses; it does not create mailboxes.**

## How the alias is built

```
<slug>.<token>@<domain>
```

| Part | Rule |
| --- | --- |
| **slug** | Registrable domain of the current tab, reduced to `[a-z0-9-]`, max 24 chars. `www.netflix.com` → `netflix`, `shop.example.com.au` → `example`, `accounts.google.com` → `google`. |
| **token** | 6 chars from `abcdefghjkmnpqrstuvwxyz23456789`. No `0 o 1 l i`, so it survives being read aloud or retyped. Fresh on every generate. |
| **domain** | Whatever you saved in options. |

Pages with no registrable domain — `chrome://`, `file://`, `localhost`, bare IPs, the Web Store — fall back to the slug `site`, and the popup says so. Generate always produces something rather than failing silently.

## Logging and export

Every generate appends alias, site, domain and timestamp. Newest first, capped at **200** (oldest dropped).

- **JSON** — `{ exportedAt, version: 1, entries: [...] }`
- **CSV** — `alias,slug,sourceHost,targetDomain,generatedAt`, RFC 4180 quoting

Files are named `sieve-aliases-YYYY-MM-DD.*`. The log records the domain used *at generation time*, so entries stay truthful if you later switch domains. **Clear all** asks for confirmation.

The log lives in the browser's extension storage — clearing extension data wipes it, so export occasionally if it matters.

## Permissions

| Permission | Why |
| --- | --- |
| `activeTab` | Read the current tab's URL to derive the slug. Granted only when you click the icon, and never on `chrome://` pages. |
| `storage` | Remember the domain, the last alias, and the log. |
| `clipboardWrite` | Put the alias on the clipboard. |

No host permissions, no `tabs`, no content scripts. The extension never reads page content, never injects into a page, and makes **no network requests at runtime**.

## Repository layout

```
.
├── manifest.json          canonical manifest (Chromium)
├── popup.html / popup.css / popup.js
├── options.html / options.css / options.js
├── lib/
│   ├── alias.js           pure logic, no browser APIs
│   └── psl.js             generated public suffix data
├── icons/
│   ├── icon.svg           design source
│   └── icon16/32/48/128.png
├── scripts/
│   └── make-zip.ps1       forward-slash ZIP writer for AMO uploads
├── build.mjs              emits dist/chrome, dist/firefox, dist/amo
├── test/
│   └── alias.test.mjs
└── dist/                  build output, not committed
```

`lib/alias.js` deliberately contains no browser APIs so the same code runs under test.

## Building

```sh
bun run build
```

Emits three things from the single source:

| Output | Purpose |
| --- | --- |
| `dist/chrome` | Manifest as-is, for Chromium packaging |
| `dist/firefox` | Same code plus `browser_specific_settings` (Gecko ID, minimum version, update URL, `data_collection_permissions: none`) |
| `dist/amo/sieve-firefox-<version>.zip` | Upload this to AMO |
| `dist/amo/updates.json` | Update manifest to host alongside the signed `.xpi` |

Only the extension files are copied — no `test/`, no `build.mjs` — so the AMO zip is clean.

The source uses `const api = globalThis.browser ?? globalThis.chrome`, so the same JavaScript runs on both engines. Firefox's `chrome.*` is callback-based, which is why this shim matters rather than being cosmetic.

## Publishing to AMO (unlisted)

1. Run `bun run build`.
2. Upload `dist/amo/sieve-firefox-1.0.0.zip` at [addons.mozilla.org/developers](https://addons.mozilla.org/developers/) and choose the **unlisted** channel.
3. Mozilla reviews and returns a signed `.xpi`.
4. Host the `.xpi` and `updates.json` at the location in `UPDATE_URL` (set at the top of `build.mjs`; default `https://sieve.endrock.dev/`).
5. Install the signed `.xpi` in Firefox; it updates from `updates.json` on later releases.

Two things to keep in mind:

- The Gecko ID `sieve@endrock.dev` is the update identity. Changing it makes existing installs stop seeing updates.
- If the URL in `UPDATE_URL` is unreachable, Firefox silently skips the update check — the extension keeps working, it just never updates.

## Testing

```sh
bun test
```

`lib/psl.js` is generated from the [Public Suffix List](https://publicsuffix.org/list/public_suffix_list.dat) so multi-part suffixes (`.com.au`, `.co.uk`, `.co.jp`…) resolve correctly. It is ~137 KB of ASCII, bundled at build time and stamped with the list version in its header. Regenerate it when the list changes.


## Limitations

- **No per-alias kill switch.** Catch-all has no per-address exclusion, so disabling a single leaked alias requires an Email Worker in front.
- Requires a mail provider that accepts catch-all delivery for the configured domain.
- Chrome will not accept SVG for manifest icons, so the PNGs are rasterised from `icons/icon.svg`.

## Licence

[MIT](LICENSE) © 2026 Noah Smith

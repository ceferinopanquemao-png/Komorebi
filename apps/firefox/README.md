# Komorebi for Firefox

An independent Hobonichi-inspired daily journal with a Typora-inspired Markdown editor. Standalone Firefox WebExtension: no Electron, companion server, subscription, or account required for local use.

## Install the development build

Requires desktop Firefox 142 or newer on Windows, Linux, or macOS.

1. Open `about:debugging#/runtime/this-firefox` in Firefox.
2. Select **Load Temporary Add-on…**.
3. Select the supplied `komorebi-firefox-1.0.0-unsigned.xpi`, or select `manifest.json` in the unpacked extension folder.
4. The journal opens in its own tab. Use the toolbar button to reopen it.
5. Create a password of at least 10 characters. Keep it safe: there is no password recovery.

This package is **unsigned**. Standard Firefox requires Mozilla signing for permanent installation. Temporary add-ons are removed at browser restart. Do not depend on a temporary installation as the only copy of a journal: export encrypted backups. For permanent distribution, submit the XPI and reproducible source to Mozilla for signing, either listed on AMO or as an unlisted extension. Signing/publishing is not performed by this build.

## Write and save

Choose a day from the calendar, add a title, write in the rich Markdown editor or use the **Markdown** source toggle. Toolbar actions include bold, italic, heading, list, quote, divider, and undo. Add a mood, bookmark an entry, search unlocked content, or choose graph paper in settings.

Entries save locally after a short 100 ms debounce. Wait for **Saved locally**, or press Ctrl/Cmd+S before closing. Manual lock saves first; idle locking defaults to five minutes and is configurable. Abrupt browser termination can lose edits still in progress. A second journal tab is blocked using Web Locks to prevent concurrent local writers.

The download button exports an encrypted `.vault` backup. To import a backup or original Electron `.vault`, lock the journal and select **Import encrypted backup or desktop vault**. Enter that file’s password. Existing local data is replaced only after successful decryption and validation; the UI requires explicit replacement confirmation. Download the current local backup first. A desktop import retains the desktop vault’s password, converts it to the extension format, and leaves the original file untouched. Desktop import is one-way; the Electron app cannot read the new extension format.

## Optional WebDAV sync

Use an HTTPS WebDAV server, such as Nextcloud. You provide and operate the server or use an existing account. This extension does not create cloud resources or a hosted account.

1. Create a folder on the WebDAV server, e.g. `Journal`.
2. In Komorebi, open **Journal settings → Configure remote storage** (or click the cloud button).
3. Enter the full HTTPS file URL ending in `.vault`, e.g. `https://cloud.example/remote.php/dav/files/alice/Journal/komorebi.vault`.
4. Enter the WebDAV username and password. Prefer a restricted app password.
5. Consent to the transmission, approve Firefox’s optional host/data permissions, and select **Save connection and sync**.
6. Optionally enable sync after edits and when the open journal tab reconnects.

On another device/profile, install the extension and choose **Open an existing remote journal** on the initial/lock screen. Enter the same remote URL, server credentials, and journal password. Do not create a different local journal and point it at the same remote file: its key and identity differ. Opening a remote journal replaces that profile’s local copy after successful verification and explicit replacement confirmation when one exists.

Local changes persist offline. Sync runs only while the journal tab is open and unlocked. After edits it is debounced by five seconds; unlocking or reconnecting triggers it when enabled. A failed upload leaves local data intact. Use the cloud button to retry.

Independent changes to different dates merge. Changes to the same date on both devices, including delete/edit conflicts, open a resolution dialog showing both versions. Nothing uploads until every conflict has a choice. Cancel to leave both copies unchanged; export backups before discarding a version. Deletion tombstones prevent an unchanged old device from resurrecting deleted entries.

The server must return a **strong ETag** on GET and correctly enforce **If-Match / If-None-Match** conditional PUT. The extension refuses unversioned/weak-ETag servers and aborts if the remote file changes during upload. Redirects are rejected to avoid forwarding credentials to another endpoint. The parent folder must already exist; no MKCOL/PROPFIND is required. Some WebDAV servers, proxies, or authentication configurations may need adjustment. Nextcloud compatibility is based on standard WebDAV behaviour; no live customer Nextcloud server was used for testing.

## Encryption and privacy

- Entire entry data, including date/title/mood/bookmark, is encrypted before IndexedDB storage or remote transmission.
- AES-256-GCM with a fresh 96-bit nonce for every encryption. Record identity is authenticated as additional data.
- PBKDF2-SHA256 with 600,000 iterations and a random 128-bit salt derives separate encryption and HMAC keys; CryptoKeys are not extractable.
- HMAC-derived opaque record IDs conceal dates; an authenticated encrypted manifest detects missing/extra records.
- WebDAV URL, credentials, sync baseline, and last-sync state are encrypted separately in the local vault. They are excluded from exported/remote journal snapshots.
- Each entry is individually encrypted, but this first version transfers one complete encrypted WebDAV snapshot per sync, up to 50 MB. It is not incremental per-object network sync.
- Local paper/idle settings use Firefox extension preferences, without journal content. No Firefox Sync storage is used.
- No telemetry, remote executable code, remote fonts, content scripts, or access to unrelated browsing history. Network access is optional, HTTPS-only, requested for the configured server origin, and checked again before requests.
- Locking drops key references, clears the editor and dialogs, and removes plaintext journal state. JavaScript cannot guarantee immediate erasure of all copies from memory. Unlocked browser access or malicious software is outside the encryption boundary.
- The WebDAV provider can see your IP, account, object size/count within the encrypted snapshot, file timestamps, and connection timing. TLS protects credentials in transit; the chosen server receives them. Use a trusted endpoint.
- Losing the password means losing access. No recovery key, password rotation, or password-reset service is implemented. Browser profile loss, extension removal, or cleared storage can delete the local copy; maintain independent encrypted backups.

## Build from source

Install Node.js 22 or newer:

```sh
npm ci
npm test
npm run build
npm run lint:extension
npm run package
```

Load `dist/manifest.json` temporarily, or use the XPI produced under `packages/`. `npm run dev` is an encrypted local browser development harness, not the original unencrypted Electron preview. In the development harness, cross-origin WebDAV requests need server CORS support; installed Firefox extensions use the optional host permission instead.

All code is bundled locally. The source build is deliberately unminified for auditability. `web-ext lint` reports zero manifest/code errors and three vendor `innerHTML` warnings from DOMPurify’s inert parser, ProseMirror’s detached paste parser, and TipTap’s static style insertion. Application UI templates use DOMPurify fragments and journal Markdown is filtered before editor rendering. These warnings are retained for review, not suppressed; Mozilla approval/signing is not implied.

## Validation and limits

Nine Node tests cover browser-format encryption, authentication/tampering, manifest integrity, legacy scrypt import, password constraints, three-way merging, explicit conflicts, tombstones, encrypted IndexedDB persistence (fake-indexeddb), revision tracking after UI mutations, conditional WebDAV requests, remote races, and failed restore preservation.

Scripted UI checks passed in Chromium and Firefox for local creation, encrypted IndexedDB, Markdown/rich editing, moods, saves, downloads, backup import, single-tab exclusion, lock/unlock, and reload protection. A two-profile Chromium scenario with a simulated WebDAV endpoint passed remote creation/open, independent bidirectional edits, conflict resolution, and failure/retry. Firefox accepted the build as a temporary add-on using Mozilla web-ext. A real third-party WebDAV deployment and Firefox’s optional-permission prompts still require manual verification in the user’s environment.

Tables, math, local images, automatic recovery keys, background sync while closed/locked, Android support, and full Typora compatibility are not implemented.

## Source layout

- `src/main.js`: journal UI, dialogs, autosave, idle lock, sync scheduling.
- `src/crypto.js`: encrypted entry format and original desktop import.
- `src/db.js`: atomic IndexedDB document writes.
- `src/store.js`: journal session, persistence, imports, and sync orchestration.
- `src/merge.js`: three-way merge and conflict detection.
- `src/webdav.js`: HTTPS permission checks and conditional requests.
- `public/manifest.json`, `public/background.js`: Firefox extension shell.

MIT licensed. See `THIRD-PARTY-LICENSES.txt` for bundled library notices.

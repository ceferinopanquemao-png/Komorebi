# Komorebi

A local-first Electron journal for Windows and Linux, inspired by Hobonichi daily pages and Typora’s formatted Markdown editing. This is an independent implementation; it does not embed or redistribute Typora.

## Run

Install Node.js 22 or later, then:

```sh
npm ci
npm run desktop
```

`npm run dev` opens a browser development preview. This preview uses unencrypted localStorage with sample entries. **Use the Electron desktop application for private journaling.** The desktop application starts with an empty encrypted vault.

## Create installers

```sh
npm run dist:linux
npm run dist:windows
```

Build Linux AppImage on Linux, and Windows NSIS installer on Windows. Outputs are in `dist/`. Windows cross-compilation on Linux may require Wine; native Windows builds are recommended. Installers are unsigned; operating systems may display an unknown-publisher prompt. On Linux, AppImage may require FUSE or `--appimage-extract-and-run`.

## Features

- One page per calendar day, date navigation, full-text search, saved moments, and five mood choices.
- Formatted Markdown editor with headings, lists, quotes, code blocks, dividers, bold, italic, undo, and an editable source view. Type Markdown shortcuts directly in the editor. It is not a full Typora replacement: tables, local images, math, and exact source whitespace preservation are not implemented.
- Quiet and graph-paper appearances; word count, reading time, and autosave after 500 ms. Ctrl/Cmd+S saves immediately.
- Password-gated desktop vault, manual lock, idle lock (5, 15, or 30 minutes), system screen-lock/suspend lock, encrypted backups and restore.

## Privacy and backups

The complete journal (dates, titles, text, moods, and saved flags) is encrypted with AES-256-GCM. scrypt derives a 256-bit key from the password with a random 16-byte salt (N=32768, r=8, p=1); every save uses a fresh random 12-byte nonce. Authentication rejects wrong passwords and tampered content. The encrypted vault uses atomic replacement and is stored in Electron’s user-data folder:

- Windows: `%APPDATA%/Komorebi/journal.vault` (actual folder may use the package name `komorebi-journal`).
- Linux: `~/.config/Komorebi/journal.vault` (actual folder may use `komorebi-journal`).

The desktop renderer has no Node.js access; the preload exposes only explicit journal operations. Remote navigation, embedded images, scripts, and source links are disabled. No account, server, telemetry, or remote fonts are used.

Use the download button to save an encrypted `.vault` backup. To restore, lock the journal and select **Restore encrypted backup**. The old vault is preserved as `journal.vault.before-restore`. Unlock using the backup’s original password. A malformed or corrupted backup may fail to unlock; keep the original file until you verify restoration.

There is **no password recovery**. The vault protects data at rest, not against malware or someone with access while the journal is unlocked. Locking clears the key buffer and renderer journal references; JavaScript cannot guarantee immediate removal of all plaintext copies from memory. Settings such as paper appearance and lock timeout are not secret and are stored separately. Abrupt shutdown or a system-triggered lock can discard the last unsaved half-second of edits. Keep backups in a separate location.

## Validation

```sh
npm test
npm run build
```

Encryption tests cover round-trip integrity, concealed journal metadata, incorrect passwords, tampering, fresh nonces, and password length. Installers require native-platform smoke testing before release.

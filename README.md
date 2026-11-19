# Komorebi

An encrypted daily journaling system inspired by Hobonichi and Typora.

This repository contains the two applications built so far:

| Application | Source | Run / build |
| --- | --- | --- |
| Electron desktop app for Windows and Linux | [`apps/desktop`](apps/desktop) | `npm ci`, then `npm run desktop` |
| Standalone Firefox extension with encrypted local storage and optional WebDAV, S3-compatible, and Azure Blob sync | [`apps/firefox`](apps/firefox) | `npm ci`, then `npm run package` |

Each application has its own package.json, dependency lockfile, README, tests, and build configuration. Run commands inside the corresponding application directory. Use Node.js 22 or newer.

## Desktop

```sh
cd apps/desktop
npm ci
npm test
npm run desktop
```

Create installers on the appropriate native platform with `npm run dist:windows` or `npm run dist:linux`. The desktop browser development preview uses unencrypted sample data; run the Electron application for encrypted private journaling. See [the desktop guide](apps/desktop/README.md).

## Firefox

```sh
cd apps/firefox
npm ci
npm test
npm run package
```

The generated unsigned XPI is in `apps/firefox/packages/`. Load it temporarily in Firefox 142+ at `about:debugging#/runtime/this-firefox`. Permanent distribution requires Mozilla signing. Local journals are encrypted in IndexedDB; remote synchronisation is optional and supports user-supplied HTTPS WebDAV, S3-compatible, and Azure Blob storage. See [the extension guide](apps/firefox/README.md) and [privacy documentation](apps/firefox/PRIVACY.md).

## Storage and compatibility

The desktop app encrypts a complete local vault with scrypt and AES-256-GCM. The extension encrypts individual records with PBKDF2-SHA256-derived keys and AES-256-GCM, and supports importing the original desktop vault. Extension exports are not readable by the desktop app. Neither application currently implements password recovery.

The SaaS/cloud deployment was studied but has not been implemented; no SaaS backend is included here.

This source repository excludes generated installers, extension packages, build output, dependency folders, credentials, and journal data. Rebuild distributable files locally using the included lockfiles and scripts. Test code contains synthetic examples only.

Independent implementations; Typora is not bundled. The repository retains its existing GPLv3 LICENSE. Application directories retain their original license files and third-party notices.

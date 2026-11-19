# Privacy

Komorebi stores your encrypted journal locally in Firefox IndexedDB. Paper appearance and idle-lock preferences are stored separately using browser.storage.local. It sends no telemetry and loads no remotely hosted executable code.

Optional remote sync sends an encrypted journal snapshot to your chosen HTTPS WebDAV, S3-compatible, or Azure Blob endpoint, only after you consent and grant Firefox permission. WebDAV sends its username/password; S3 signs requests locally using the configured access key and optional session token (the secret access key itself is not sent); Azure authenticates with a SAS token in the request URL. SAS URLs are not shown in connection summaries or error messages. The developer does not operate a receiving server. The endpoint, credentials, and sync metadata are encrypted locally with the unlocked journal key. They are excluded from journal backups and remote snapshots. Your provider can observe network/account metadata, sizes, and timing. No browsing history or unrelated website content is accessed.

Locking removes the journal UI and drops plaintext/key references; JavaScript does not guarantee immediate memory erasure. Encryption protects stored content, not an unlocked or compromised device. No password recovery is provided. Uninstalling the extension or losing the profile can remove local data. Keep independent encrypted exports.

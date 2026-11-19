# Remote storage setup

In the Firefox extension, choose **Journal settings → Configure remote storage** (or the cloud button). Select WebDAV, AWS S3 / S3-compatible, or Azure Blob Storage. On another device, use **Open an existing remote journal** on the lock screen, choose the same provider and object, and supply the original journal password.

All backends store the same encrypted `.vault` snapshot and retain conditional writes, three-way merging, conflict choices, and deletion tombstones. Connection credentials are encrypted in local IndexedDB, not exported with a backup or uploaded inside the journal. A sync transfers the entire encrypted snapshot, up to 50 MB. Only one remote destination is configured per local journal; simultaneous replication to several providers is not implemented.

## AWS S3

1. Create a private S3 bucket in your chosen region. Do not enable public access.
2. Create an IAM identity restricted to the journal object. It needs `s3:GetObject` and `s3:PutObject` on that object. Do not use AWS root credentials.
3. For first creation, S3 must report a missing object as 404. A principal without `s3:ListBucket` can receive 403 for a missing key; grant appropriate bucket-level missing-object access or provision the initial encrypted object separately. Komorebi treats 403 as an authorization failure and never assumes it means a missing object.
4. Select **AWS S3 / S3-compatible** and enter the bucket, raw object key (e.g. `Journal/komorebi.vault`), exact AWS region, access key ID and secret access key. For temporary STS credentials, also enter the session token. Leave the endpoint empty for AWS, and leave path-style addressing off unless needed for your bucket/endpoint.
5. Approve the storage-host permission and sync. Your computer clock must be accurate for AWS request signing.

Requests are signed locally with AWS Signature V4, including the body hash and conditional headers. The secret access key is not sent in requests. Short-lived credentials expire; update them in the connection dialog. Changing credentials for the same object preserves the merge baseline. Changing provider, bucket, endpoint, or object destination resets the baseline and does not automatically copy data from a previous remote service.

For bucket names containing dots, HTTPS virtual-host certificates may not cover the bucket hostname. Use path-style addressing against the regional AWS endpoint if needed. Bucket naming/region mistakes and redirects are not followed automatically.

AWS supports `If-None-Match: *` for first creation and `If-Match` for updating the version just downloaded. Consider a bucket policy that enforces conditional writes. See [AWS conditional writes](https://docs.aws.amazon.com/AmazonS3/latest/userguide/conditional-writes.html).

## S3-compatible providers

Enter the provider's HTTPS endpoint host, bucket, object key, and signing region. The endpoint must be a host URL without a path or query. Path-style addressing is usually appropriate for custom endpoints. For example, an R2 endpoint has the form `https://ACCOUNT_ID.r2.cloudflarestorage.com` and uses signing region `auto`. Use the provider's exact values rather than guessing a region.

The provider must correctly implement strong ETags and conditional `PutObject`. S3 API compatibility alone does not guarantee conditional write support. Komorebi sends conditional headers and aborts 409/412; it cannot detect a server that silently ignores those headers. Verify this support before relying on multi-device sync. No live third-party account was used to validate provider-specific behaviour.

## Azure Blob Storage

1. Create a private Azure Storage container. No anonymous blob access is needed.
2. Generate a SAS granting **Read and Write** for the journal blob, or a narrowly scoped private container if blob-scoped provisioning is unavailable. Prefer a short-lived, HTTPS-only, blob-scoped user-delegation SAS. No storage account master key is needed by Komorebi.
3. Select **Azure Blob Storage**. Enter the full blob URL, such as `https://ACCOUNT.blob.core.windows.net/journals/komorebi.vault`.
4. Paste the SAS query string into **SAS token**, with or without the initial `?`. Alternatively paste the full signed URL into the Blob URL field and leave SAS token empty. The extension separates and encrypts the token; do not paste it into GitHub or chat.
5. Approve the storage-host permission and sync.

Use a current blob, not a snapshot/version URL. SAS tokens with explicit `sp` permissions must include `r` and `w`; a stored access policy may instead provide permissions using `si`. Expired tokens, insufficient permissions, or account firewall restrictions cause an error while leaving local changes saved. Replace an expired SAS in the connection dialog. Token refresh for the same blob preserves the merge baseline.

Uploads use `Put Blob`, `x-ms-blob-type: BlockBlob`, and conditional headers. The blob remains encrypted at rest even independently of Azure's own server-side encryption. SAS tokens are bearer credentials: the service receives the token in the request URL, and provider/proxy access logs may record it. Endpoint URLs shown in Komorebi summaries and error messages exclude the token. See [Azure Put Blob](https://learn.microsoft.com/en-us/rest/api/storageservices/put-blob).

## WebDAV

Use an existing HTTPS folder and a full `.vault` file URL. Username and app password authentication remain supported. Existing extension 1.0 WebDAV connections migrate automatically when loaded. The server must return a strong ETag on GET and enforce conditional PUT. Parent folders must already exist. No MKCOL, PROPFIND, bucket/container creation, or object listing is performed by Komorebi.

## Firefox host permission and CORS

An installed Firefox extension requests optional host access only for the chosen storage hostname. Permission is checked before every request. All connections require HTTPS; redirects are rejected so credentials do not travel to an unapproved redirect target. Development previews are ordinary browser pages and require storage CORS configuration. Some provider/proxy environments can also require CORS changes.

For an S3 bucket used from the local development preview on port 5174, this CORS rule permits the required operations without making the bucket public:

```json
[
  {
    "AllowedOrigins": ["http://127.0.0.1:5174"],
    "AllowedMethods": ["GET", "PUT"],
    "AllowedHeaders": ["authorization", "content-type", "if-match", "if-none-match", "x-amz-date", "x-amz-content-sha256", "x-amz-security-token"],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 300
  }
]
```

In Azure Storage's Blob service CORS settings, allow the actual preview origin, GET/PUT/OPTIONS, headers `content-type`, `if-match`, `if-none-match`, `x-ms-version`, `x-ms-blob-type`, and expose response header `ETag`. Use your actual preview port/origin when it differs. Do not remove authentication or enable public access to resolve a CORS failure.

## Safety and limitations

- Export encrypted backups separately and optionally enable provider versioning/soft delete. Komorebi does not configure backup retention or account recovery.
- A storage account and a journal vault are different identities. A new independent local vault cannot decrypt an existing remote vault, even if its password text matches; import/open the existing vault instead.
- Same-day concurrent changes require a choice. Independent edits merge. A stale conditional write aborts without retrying blindly.
- Sync runs only while the journal tab is open and unlocked. Background sync while closed/locked, OAuth/managed-identity login, presigned S3 URL management, Azure Shared Key authentication, and multipart uploads are not implemented.
- These storage options belong to the Firefox extension. The Electron desktop app retains its local encrypted vault and backup functions.

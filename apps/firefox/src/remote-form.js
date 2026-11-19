import {PROVIDERS, validateRemote} from './remote-config.js';
const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'}[c]));
export function remoteFields(config = {}) {
  const type = config.type || 'webdav';
  return `<label>Storage provider<select name="type" data-storage-provider>${Object.entries(PROVIDERS).map(([key, label]) => `<option value="${key}" ${key === type ? 'selected' : ''}>${label}</option>`).join('')}</select></label>
  <section data-storage-group="webdav">
    <label>HTTPS WebDAV file URL<input name="url" type="url" required placeholder="https://cloud.example/Journal/komorebi.vault" value="${type === 'webdav' ? escape(config.url) : ''}"></label>
    <label>WebDAV username<input name="user" autocomplete="username" value="${escape(config.user)}"></label>
    <label>WebDAV password / app password<input name="remotePassword" type="password" autocomplete="off" value="${escape(config.password)}"></label>
    <p class="fine">Create the parent folder first. The server must support strong ETags and conditional PUT.</p>
  </section>
  <section data-storage-group="s3">
    <label>Bucket name<input name="bucket" required placeholder="my-private-journal" value="${escape(config.bucket)}"></label>
    <label>Object key<input name="objectKey" required placeholder="Journal/komorebi.vault" value="${escape(config.objectKey || 'Journal/komorebi.vault')}"></label>
    <label>Signing region<input name="region" required placeholder="eu-west-1" value="${escape(config.region || 'us-east-1')}"></label>
    <label>S3-compatible endpoint (optional)<input name="endpoint" type="url" placeholder="https://s3.eu-west-1.amazonaws.com" value="${escape(config.endpoint)}"></label>
    <label class="checkbox"><input name="pathStyle" type="checkbox" ${config.pathStyle ? 'checked' : ''}> Path-style addressing (usually needed for custom endpoints)</label>
    <label>Access key ID<input name="accessKeyId" autocomplete="off" required value="${escape(config.accessKeyId)}"></label>
    <label>Secret access key<input name="secretAccessKey" type="password" autocomplete="off" required value="${escape(config.secretAccessKey)}"></label>
    <label>Session token (optional)<input name="sessionToken" type="password" autocomplete="off" value="${escape(config.sessionToken)}"></label>
    <p class="fine">Use an existing private bucket and a restricted IAM identity. Use temporary credentials when possible. For compatible providers, enter their endpoint and signing region (for example, auto for R2). Conditional writes must be enforced by the provider.</p>
  </section>
  <section data-storage-group="azure">
    <label>HTTPS Blob URL<input name="blobUrl" type="url" required placeholder="https://account.blob.core.windows.net/journals/komorebi.vault" value="${type === 'azure' ? escape(config.url) : ''}"></label>
    <label>SAS token<input name="sasToken" type="password" autocomplete="off" placeholder="sv=…&sp=rw&sig=…" value="${escape(config.sasToken)}"></label>
    <p class="fine">Use an existing private container. Supply an HTTPS-only SAS with Read and Write permission, preferably scoped to this blob and with an expiry. You can also paste the full SAS URL in the Blob URL field.</p>
  </section>`;
}
export function bindRemoteFields(form) {
  const select = form.querySelector('[data-storage-provider]');
  function update() {
    for (const group of form.querySelectorAll('[data-storage-group]')) {
      const enabled = group.dataset.storageGroup === select.value;
      group.hidden = !enabled;
      for (const input of group.querySelectorAll('input,select')) input.disabled = !enabled;
    }
  }
  select.addEventListener('change', update);
  update();
}
export function configFrom(form) {
  const f = new FormData(form), type = f.get('type'), auto = f.get('auto') === 'on';
  if (type === 's3') return validateRemote({type, auto, bucket: f.get('bucket'), objectKey: f.get('objectKey'),
    region: f.get('region'), endpoint: f.get('endpoint'), pathStyle: f.get('pathStyle') === 'on',
    accessKeyId: f.get('accessKeyId'), secretAccessKey: f.get('secretAccessKey'), sessionToken: f.get('sessionToken')});
  if (type === 'azure') return validateRemote({type, auto, url: f.get('blobUrl'), sasToken: f.get('sasToken')});
  return validateRemote({type: 'webdav', auto, url: f.get('url'), user: f.get('user'), password: f.get('remotePassword')});
}

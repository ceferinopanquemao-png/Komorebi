import {AwsV4Signer} from 'aws4fetch';
import {validateRemote, providerLabel, hostPermission} from './remote-config.js';
export {validateRemote, providerLabel, remoteIdentity, permission, PROVIDERS} from './remote-config.js';
export const MAX_REMOTE_BYTES = 50_000_000;
const encoder = new TextEncoder();
class RemoteResponseError extends Error {}
function basic(user, password) {
  let value = '';
  for (const byte of encoder.encode(user + ':' + password)) value += String.fromCharCode(byte);
  return 'Basic ' + btoa(value);
}
function strongETag(etag) { return typeof etag === 'string' && /^"[^"\r\n]+"$/.test(etag); }

async function readJSON(response) {
  if (Number(response.headers.get('Content-Length')) > MAX_REMOTE_BYTES) {
    await response.body?.cancel();
    throw new RemoteResponseError('Remote journal exceeds the 50 MB limit.');
  }
  // Enforce the limit for chunked responses as well, before allocating an unbounded string.
  const reader = response.body?.getReader();
  if (!reader) throw new RemoteResponseError('Remote journal has no content.');
  const chunks = [];
  let size = 0;
  for (;;) {
    const {done, value} = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_REMOTE_BYTES) {
      await reader.cancel();
      throw new RemoteResponseError('Remote journal exceeds the 50 MB limit.');
    }
    chunks.push(value);
  }
  const decoder = new TextDecoder();
  const text = chunks.map(chunk => decoder.decode(chunk, {stream: true})).join('') + decoder.decode();
  try { return JSON.parse(text); } catch { throw new RemoteResponseError('Remote journal is not valid JSON.'); }
}

export class RemoteObjectStorage {
  constructor(config, fetcher = (...args) => globalThis.fetch(...args)) {
    this.config = validateRemote(config);
    this.label = providerLabel(this.config);
    this.fetcher = fetcher;
  }
  async signedRequest(method, extra) {
    const config = this.config;
    const headers = {...extra.headers};
    let url = config.url;
    if (config.type === 'webdav') headers.Authorization = basic(config.user, config.password);
    if (config.type === 'azure') {
      url += '?' + config.sasToken;
      headers['x-ms-version'] = '2023-11-03';
      if (method === 'PUT') headers['x-ms-blob-type'] = 'BlockBlob';
    }
    if (config.type === 's3') {
      // Bind the payload to the signature; never retry a write without refetching/re-merging.
      headers['x-amz-content-sha256'] = [...new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(extra.body || '')))].map(b => b.toString(16).padStart(2, '0')).join('');
      const signed = await new AwsV4Signer({url, method, headers, body: extra.body,
        accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey,
        sessionToken: config.sessionToken || undefined, service: 's3', region: config.region,
        allHeaders: true}).sign();
      url = signed.url.toString();
      return {url, headers: Object.fromEntries(signed.headers)};
    }
    return {url, headers};
  }
  async request(method, extra = {}, consume = response => response) {
    if (globalThis.browser?.permissions && !await browser.permissions.contains({
      origins: [hostPermission(this.config)], data_collection: ['authenticationInfo', 'personalCommunications']
    })) throw Error('Remote permission was revoked. Reconnect in remote storage settings.');
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);
    try {
      const {url, headers} = await this.signedRequest(method, extra);
      const response = await this.fetcher(url, {method, headers, body: extra.body, signal: controller.signal,
        credentials: 'omit', cache: 'no-store', redirect: 'error', referrerPolicy: 'no-referrer'});
      return await consume(response);
    } catch (error) {
      if (error instanceof RemoteResponseError) throw error;
      // Never surface fetch/SDK exception text: it can contain a SAS URL or credentials.
      if (error.name === 'AbortError') throw Error(`${this.label} timed out. Your changes remain saved locally.`);
      throw Error(`Could not reach ${this.label}. Check the endpoint, permission, network, and server certificate. Redirects are not followed.`);
    } finally { clearTimeout(timeout); }
  }
  async read() {
    return this.request('GET', {}, async response => {
      if (response.status === 404) return {vault: null, etag: null};
      if (!response.ok) throw new RemoteResponseError(`${this.label} download failed (${response.status}). Check credentials, expiry, region, and object read permissions.`);
      const etag = response.headers.get('ETag');
      if (!strongETag(etag)) throw new RemoteResponseError('This server must return a strong ETag to synchronise safely. In a browser preview, expose ETag in the storage CORS settings.');
      return {vault: await readJSON(response), etag};
    });
  }
  async write(vault, etag) {
    const body = JSON.stringify(vault);
    if (encoder.encode(body).byteLength > MAX_REMOTE_BYTES) throw Error('Remote journal exceeds the 50 MB limit. Export a local backup.');
    if (etag != null && !strongETag(etag)) throw Error('A strong ETag is required before updating remote content.');
    return this.request('PUT', {headers: {'Content-Type': 'application/json',
      ...(etag == null ? {'If-None-Match': '*'} : {'If-Match': etag})}, body}, response => {
      if (response.status === 409 || response.status === 412) throw new RemoteResponseError('The remote journal changed during sync or is locked. Nothing was overwritten. Sync again.');
      if (!response.ok) throw new RemoteResponseError(`${this.label} upload failed (${response.status}). Check write permission and credential expiry. Your changes remain local.`);
      return response.headers.get('ETag');
    });
  }
}
export function createRemoteStorage(config, fetcher) { return new RemoteObjectStorage(config, fetcher); }

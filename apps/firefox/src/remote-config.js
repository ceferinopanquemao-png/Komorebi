export const PROVIDERS = {webdav: 'WebDAV', s3: 'AWS S3 / S3-compatible', azure: 'Azure Blob Storage'};

function httpsURL(value) {
  let url;
  try { url = new URL(value); } catch { throw Error('Enter a valid HTTPS storage URL.'); }
  if (url.protocol !== 'https:' || url.username || url.password || url.hash) {
    throw Error('Use an HTTPS URL without embedded credentials or a fragment.');
  }
  return url;
}
function text(value) { return typeof value === 'string' ? value.trim() : ''; }
function required(value, label) {
  const result = text(value);
  if (!result) throw Error(`${label} is required.`);
  if (/[\r\n\0]/.test(result)) throw Error(`${label} contains invalid characters.`);
  return result;
}

export function validateRemote(config) {
  if (!config || typeof config !== 'object') throw Error('Choose a remote storage provider.');
  const type = config.type || 'webdav'; // Existing 1.0 WebDAV settings migrate without a new vault.
  if (!Object.hasOwn(PROVIDERS, type)) throw Error('Unsupported remote storage provider.');
  const auto = config.auto === true;
  if (type === 'webdav') {
    const url = httpsURL(config.url);
    if (url.search) throw Error('Use a WebDAV URL without a query.');
    if (!url.pathname.endsWith('.vault')) throw Error('Enter the full remote filename ending in .vault. Create its parent folder on your WebDAV server first.');
    return {type, url: url.href, user: text(config.user), password: config.password || '', auto};
  }
  if (type === 's3') {
    const bucket = required(config.bucket, 'Bucket name');
    if (!/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(bucket) || bucket.includes('..')) throw Error('Enter a DNS-compatible S3 bucket name (3–63 lowercase characters).');
    const region = required(config.region, 'Signing region');
    if (!/^[a-z0-9-]+$/.test(region)) throw Error('Enter a valid signing region, such as eu-west-1 or auto.');
    const objectKey = required(config.objectKey, 'Object key');
    if (!objectKey.endsWith('.vault') || objectKey.startsWith('/') || objectKey.split('/').some(p => p === '.' || p === '..') || new TextEncoder().encode(objectKey).length > 1024) {
      throw Error('Use an object key ending in .vault, without a leading slash or dot path segments (maximum 1024 bytes).');
    }
    const custom = text(config.endpoint);
    const endpoint = httpsURL(custom || `https://s3.${region}.amazonaws.com`);
    if (endpoint.search || endpoint.pathname !== '/') throw Error('S3 endpoint must contain only the HTTPS host, without a path or query.');
    const pathStyle = config.pathStyle === true || (config.pathStyle == null && !!custom);
    const url = new URL(endpoint);
    if (pathStyle) url.pathname = '/' + bucket;
    else {
      if (/^[\d.]+$/.test(url.hostname) || url.hostname.includes(':')) throw Error('Use path-style addressing for an IP endpoint.');
      url.hostname = `${bucket}.${url.hostname}`;
    }
    url.pathname += (url.pathname.endsWith('/') ? '' : '/') + objectKey.split('/').map(encodeURIComponent).join('/');
    return {type, endpoint: custom ? endpoint.origin : '', bucket, region, objectKey, pathStyle,
      accessKeyId: required(config.accessKeyId, 'Access key ID'),
      secretAccessKey: required(config.secretAccessKey, 'Secret access key'),
      sessionToken: text(config.sessionToken), url: url.href, auto};
  }
  const url = httpsURL(config.url);
  if (!url.pathname.endsWith('.vault') || url.pathname.split('/').filter(Boolean).length < 2) throw Error('Enter a full Azure container/blob URL ending in .vault.');
  const supplied = text(config.sasToken).replace(/^\?/, '');
  if (url.search && supplied && url.search.slice(1) !== supplied) throw Error('Provide the SAS token either in the Blob URL or separately, not both.');
  const sasToken = supplied || url.search.slice(1);
  const params = new URLSearchParams(sasToken);
  if (!params.get('sig') || !/^\d{4}-\d{2}-\d{2}$/.test(params.get('sv') || '')) throw Error('An Azure SAS token with sig and sv is required.');
  const seen = new Set();
  for (const [key] of params) {
    if (seen.has(key) || ['comp', 'restype', 'snapshot', 'versionid'].includes(key.toLowerCase())) throw Error('Use an unambiguous SAS token for a single current blob.');
    seen.add(key);
  }
  if (params.has('spr') && params.get('spr') !== 'https') throw Error('Use an HTTPS-only SAS token (spr=https).');
  if (params.has('sp') && (!params.get('sp').includes('r') || !params.get('sp').includes('w'))) throw Error('The SAS token needs Read and Write permissions.');
  url.search = '';
  return {type, url: url.href, sasToken, auto};
}

export function remoteIdentity(config) {
  if (!config) return null;
  const normalized = validateRemote(config);
  return `${normalized.type}:${normalized.url}`;
}
export function providerLabel(config) { return PROVIDERS[config?.type || 'webdav'] || 'Remote storage'; }
export function hostPermission(config) {
  const url = new URL(validateRemote(config).url);
  // Firefox host match patterns do not narrow permissions to a TCP port.
  return `${url.protocol}//${url.hostname}/*`;
}
export async function permission(config) {
  config = validateRemote(config);
  if (globalThis.browser?.permissions) {
    const request = {origins: [hostPermission(config)], data_collection: ['authenticationInfo', 'personalCommunications']};
    // Must be called directly from the user's submit handler, before other asynchronous work.
    if (!await browser.permissions.request(request)) throw Error('Remote storage permission was not granted.');
  }
  return config;
}

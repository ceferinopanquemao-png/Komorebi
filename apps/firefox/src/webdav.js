// Compatibility exports for 1.0 callers and the existing WebDAV regression tests.
import {RemoteObjectStorage} from './remote-storage.js';
export {validateRemote, permission} from './remote-config.js';
export class WebDAV extends RemoteObjectStorage {
  constructor(config, fetcher) { super({...config, type: 'webdav'}, fetcher); }
}

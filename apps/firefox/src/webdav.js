export function validateRemote(config){const url=new URL(config.url);if(url.protocol!=='https:'||url.username||url.password||url.hash||url.search)throw Error('Use an HTTPS URL without embedded credentials, a query, or a fragment.');if(!url.pathname.endsWith('.vault'))throw Error('Enter the full remote filename ending in .vault. Create its parent folder on your WebDAV server first.');return {...config,url:url.href};}
function basic(user,password){const bytes=new TextEncoder().encode(user+':'+password);let text='';for(const b of bytes)text+=String.fromCharCode(b);return 'Basic '+btoa(text);}
export async function permission(config){
 config=validateRemote(config);
 if(globalThis.browser?.permissions){
  const request={origins:[new URL(config.url).origin+'/*'],data_collection:['authenticationInfo','personalCommunications']};
  // Start the request directly inside the user's submit handler so activation is retained.
  if(!await browser.permissions.request(request))throw Error('Remote storage permission was not granted.');
 }
 return config;
}
export class WebDAV{
 constructor(config,fetcher=(...args)=>globalThis.fetch(...args)){this.config=validateRemote(config);this.fetcher=fetcher;}
 async request(method,extra={}){if(globalThis.browser?.permissions&&!await browser.permissions.contains({origins:[new URL(this.config.url).origin+'/*'],data_collection:['authenticationInfo','personalCommunications']}))throw Error('Remote permission was revoked. Reconnect in remote storage settings.');const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),30000);try{return await this.fetcher(this.config.url,{method,headers:{Authorization:basic(this.config.user||'',this.config.password||''),...extra.headers},body:extra.body,signal:controller.signal,credentials:'omit',cache:'no-store',redirect:'error',referrerPolicy:'no-referrer'});}catch(e){if(e.name==='AbortError')throw Error('WebDAV timed out. Your changes remain saved locally.');throw Error('Could not reach WebDAV. Check the URL, permission, network, and server certificate.');}finally{clearTimeout(timeout);}}
 async read(){const r=await this.request('GET');if(r.status===404)return {vault:null,etag:null};if(!r.ok)throw Error(`WebDAV download failed (${r.status}). Check credentials and file access.`);const etag=r.headers.get('ETag');if(!etag||etag.startsWith('W/'))throw Error('This server must return a strong ETag to synchronise safely.');if(Number(r.headers.get('Content-Length'))>50_000_000)throw Error('Remote journal exceeds the 50 MB limit.');const raw=await r.text();if(raw.length>50_000_000)throw Error('Remote journal exceeds the 50 MB limit.');return {vault:JSON.parse(raw),etag};}
 async write(vault,etag){if(JSON.stringify(vault).length>50_000_000)throw Error('Remote journal exceeds the 50 MB limit. Export a local backup.');const r=await this.request('PUT',{headers:{'Content-Type':'application/json',...(etag?{'If-Match':etag}:{'If-None-Match':'*'})},body:JSON.stringify(vault)});if(r.status===409||r.status===412)throw Error('The remote journal changed during sync. Nothing was overwritten. Sync again.');if(!r.ok)throw Error(`WebDAV upload failed (${r.status}). Your changes remain local.`);return r.headers.get('ETag');}
}

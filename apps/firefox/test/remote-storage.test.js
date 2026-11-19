import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash, createHmac} from 'node:crypto';
import {createRemoteStorage, validateRemote, remoteIdentity, permission} from '../src/remote-storage.js';
import {hostPermission} from '../src/remote-config.js';
const s3 = {type:'s3',bucket:'my-journal',region:'eu-west-1',objectKey:'Journal/a b+é!.vault',accessKeyId:'TESTACCESSKEY',secretAccessKey:'synthetic-s3-secret',sessionToken:'synthetic-session-token'};
const sas = 'sv=2023-11-03&sp=rw&spr=https&sr=b&sig=synthetic%2Bsignature%3D';
const azure = {type:'azure',url:'https://account.blob.core.windows.net/journals/komorebi.vault',sasToken:sas};
const hex = x => createHash('sha256').update(x).digest('hex');
function verifySignature(url,args) {
 const headers=new Headers(args.headers), match=/Credential=([^/]+)\/([^,]+), SignedHeaders=([^,]+), Signature=([0-9a-f]+)/.exec(headers.get('Authorization'));
 assert.ok(match);const names=match[3].split(';'),u=new URL(url);
 const uri=u.pathname.split('/').map(segment=>encodeURIComponent(decodeURIComponent(segment)).replace(/[!'()*]/g,c=>'%'+c.charCodeAt(0).toString(16).toUpperCase())).join('/');
 const canonicalHeaders=names.map(name=>name+':'+(name==='host'?u.host:headers.get(name).trim().replace(/\s+/g,' '))).join('\n')+'\n';
 const canonical=[args.method,uri,'',canonicalHeaders,match[3],hex(args.body||'')].join('\n'),date=headers.get('x-amz-date');
 const stringToSign=['AWS4-HMAC-SHA256',date,match[2],hex(canonical)].join('\n');let key=Buffer.from('AWS4'+s3.secretAccessKey);
 for(const part of [date.slice(0,8),s3.region,'s3','aws4_request'])key=createHmac('sha256',key).update(part).digest();
 assert.equal(match[4],createHmac('sha256',key).update(stringToSign).digest('hex'));
 assert.equal(headers.get('x-amz-content-sha256'),hex(args.body||''));return headers;
}
test('S3 signs encoded paths, payloads, session tokens and conditional headers',async()=>{
 const calls=[],storage=createRemoteStorage(s3,async(url,args)=>{calls.push({url,args});return new Response('{}',{headers:{ETag:'"v1"'}});});
 await storage.read();await storage.write({ciphertext:'encrypted'},'"v1"');await storage.write({ciphertext:'encrypted'},null);
 assert.equal(new URL(calls[0].url).host,'my-journal.s3.eu-west-1.amazonaws.com');assert.equal(new URL(calls[0].url).search,'');
 for(const call of calls){const headers=verifySignature(call.url,call.args);assert.equal(headers.get('x-amz-security-token'),s3.sessionToken);assert.ok(!call.url.includes(s3.secretAccessKey));assert.equal(call.args.redirect,'error');}
 assert.equal(calls[1].args.headers['if-match'],'"v1"');assert.equal(calls[2].args.headers['if-none-match'],'*');assert.match(calls[1].args.headers.authorization,/SignedHeaders=content-type;host;if-match;/);
});
test('S3-compatible endpoints use path-style buckets and the configured signing region',async()=>{
 const config=validateRemote({...s3,endpoint:'https://account.r2.cloudflarestorage.com',region:'auto',objectKey:'journal.vault'});
 assert.equal(config.url,'https://account.r2.cloudflarestorage.com/my-journal/journal.vault');assert.equal(config.pathStyle,true);assert.equal(hostPermission(config),'https://account.r2.cloudflarestorage.com/*');
 const storage=createRemoteStorage(config,async(_,args)=>{assert.match(args.headers.authorization,/\/auto\/s3\/aws4_request/);return new Response(null,{status:404});});assert.deepEqual(await storage.read(),{vault:null,etag:null});
});
test('Azure splits full SAS URLs and sets BlockBlob and conditional headers',async()=>{
 const config=validateRemote({type:'azure',url:azure.url+'?'+sas});assert.equal(config.url,azure.url);assert.equal(config.sasToken,sas);
 const calls=[],storage=createRemoteStorage(config,async(url,args)=>{calls.push({url,args});return new Response('{}',{headers:{ETag:'"azure-1"'}});});
 await storage.read();await storage.write({encrypted:true},null);await storage.write({encrypted:true},'"azure-1"');
 assert.equal(calls[0].url,azure.url+'?'+sas);assert.equal(calls[0].args.headers['x-ms-version'],'2023-11-03');assert.equal(calls[1].args.headers['x-ms-blob-type'],'BlockBlob');assert.equal(calls[1].args.headers['If-None-Match'],'*');assert.equal(calls[2].args.headers['If-Match'],'"azure-1"');assert.equal(calls[1].args.headers.Authorization,undefined);
});
test('credential rotation preserves object identity and old WebDAV settings migrate',()=>{
 const old=validateRemote({url:'https://dav.example/journal.vault',user:'a',password:'b'});assert.equal(old.type,'webdav');assert.equal(remoteIdentity(old),'webdav:https://dav.example/journal.vault');
 assert.equal(remoteIdentity(azure),remoteIdentity({...azure,sasToken:sas.replace('synthetic','rotated')}));assert.equal(remoteIdentity(s3),remoteIdentity({...s3,secretAccessKey:'rotated'}));assert.notEqual(remoteIdentity(s3),remoteIdentity({...s3,objectKey:'other.vault'}));assert.notEqual(remoteIdentity(azure),remoteIdentity({type:'webdav',url:azure.url}));assert.ok(!JSON.stringify(validateRemote({...azure,secretAccessKey:'discard',password:'discard'})).includes('discard'));
});
test('unsafe endpoints, ambiguous SAS tokens and incomplete credentials fail validation',()=>{
 for(const config of [{...s3,region:''},{...s3,secretAccessKey:''},{...s3,objectKey:'../secret.vault'},{...s3,endpoint:'https://store.example/path'},{...s3,endpoint:'http://store.example'},{...azure,sasToken:''},{...azure,sasToken:sas.replace('sp=rw','sp=r')},{...azure,sasToken:sas+'&comp=metadata'},{...azure,sasToken:sas+'&sig=duplicate'},{...azure,sasToken:sas.replace('spr=https','spr=https,http')},{...azure,url:'https://user:password@account.example/container/file.vault'},{type:'unknown',url:azure.url}])assert.throws(()=>validateRemote(config));
});
test('both clouds reject stale writes, expired credentials and weak ETags without leaking tokens',async()=>{
 for(const config of [s3,azure]){
  for(const status of [409,412])await assert.rejects(createRemoteStorage(config,async()=>new Response(null,{status})).write({},'"old"'),/Nothing was overwritten/);
  await assert.rejects(createRemoteStorage(config,async()=>new Response(null,{status:403})).read(),/403/);
  for(const etag of [null,'W/"weak"'])await assert.rejects(createRemoteStorage(config,async()=>new Response('{}',{headers:etag?{ETag:etag}:{}})).read(),/strong ETag/);
  await assert.rejects(createRemoteStorage(config,async()=>{throw Error('Failed '+azure.url+'?'+sas);}).read(),e=>!e.message.includes('sig=')&&!e.message.includes('synthetic'));
 }
});
test('oversized and malformed remote snapshots fail without echoing response content',async()=>{
 await assert.rejects(createRemoteStorage(azure,async()=>new Response('{}',{headers:{ETag:'"v"','Content-Length':'50000001'}})).read(),/50 MB/);
 await assert.rejects(createRemoteStorage(azure,async()=>new Response('<secret-response>',{headers:{ETag:'"v"'}})).read(),e=>e.message==='Remote journal is not valid JSON.');
});
test('Firefox permissions are scoped to the configured host and revocation stops network calls',async()=>{
 const requests=[];globalThis.browser={permissions:{request:async value=>{requests.push(value);return true;},contains:async()=>false}};
 try{await permission(s3);await permission(azure);assert.deepEqual(requests.map(r=>r.origins[0]),['https://my-journal.s3.eu-west-1.amazonaws.com/*','https://account.blob.core.windows.net/*']);await assert.rejects(createRemoteStorage(azure,async()=>assert.fail('must not fetch')).read(),/revoked/);}finally{delete globalThis.browser;}
});

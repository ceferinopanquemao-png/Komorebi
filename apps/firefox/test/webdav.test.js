import {test} from 'node:test';
import assert from 'node:assert/strict';
import {WebDAV,validateRemote} from '../src/webdav.js';
const config={url:'https://dav.example/Journal/komorebi.vault',user:'alice',password:'private-app-password'};
test('WebDAV creates with If-None-Match and updates with If-Match',async()=>{
 const calls=[],dav=new WebDAV(config,async(url,args)=>{calls.push({url,args});return new Response('{}',{status:200,headers:{ETag:'"v1"'}});});
 const remote=await dav.read();assert.equal(remote.etag,'"v1"');
 await dav.write({encrypted:true},null);assert.equal(calls[1].args.headers['If-None-Match'],'*');
 await dav.write({encrypted:true},'"v1"');assert.equal(calls[2].args.headers['If-Match'],'"v1"');
 assert.equal(calls[0].args.redirect,'error');assert.equal(calls[0].args.credentials,'omit');
 assert.ok(calls[0].args.headers.Authorization.startsWith('Basic '));
});
test('remote races, authentication failures and unsafe servers fail closed',async()=>{
 await assert.rejects(new WebDAV(config,async()=>new Response(null,{status:412})).write({},'"old"'),/Nothing was overwritten/);
 await assert.rejects(new WebDAV(config,async()=>new Response('{}')).read(),/strong ETag/);
 await assert.rejects(new WebDAV(config,async()=>new Response('{}',{headers:{ETag:'W/"x"'}})).read(),/strong ETag/);
 await assert.rejects(new WebDAV(config,async()=>new Response(null,{status:401})).read(),/401/);
 assert.throws(()=>validateRemote({...config,url:'http://dav.example/file.vault'}),/HTTPS/);
 assert.throws(()=>validateRemote({...config,url:'https://user:secret@dav.example/file.vault'}),/credentials/);
});

import {test} from 'node:test';
import assert from 'node:assert/strict';
import 'fake-indexeddb/auto';
import {store} from '../src/store.js';
import {getDocument} from '../src/db.js';
import {unlockVault, readRecords, recordId, pack} from '../src/crypto.js';
import {ConflictError} from '../src/merge.js';
const password='cloud journal test password',date='2026-11-19';
const entry=title=>({title,body:'Private cloud journal text',mood:'happy',starred:false});
const configurations=[
 {type:'s3',bucket:'private-journal',region:'eu-west-1',objectKey:'journal.vault',accessKeyId:'synthetic-key',secretAccessKey:'synthetic-cloud-secret',sessionToken:'synthetic-session'},
 {type:'azure',url:'https://account.blob.core.windows.net/journals/test.vault',sasToken:'sv=2023-11-03&sp=rw&spr=https&sig=synthetic-azure-token'}
];
test('S3 and Azure round trip encrypted journals, rotate credentials, merge and reopen',async()=>{
 const objects=new Map();let version=0;
 globalThis.fetch=async(url,args)=>{
  const identity=url.split('?')[0],value=objects.get(identity),headers=new Headers(args.headers);
  if(args.method==='GET')return value?new Response(JSON.stringify(value.vault),{headers:{ETag:value.etag}}):new Response(null,{status:404});
  if(value?headers.get('If-Match')!==value.etag:headers.get('If-None-Match')!=='*')return new Response(null,{status:412});
  const etag='"'+(++version)+'"';objects.set(identity,{vault:JSON.parse(args.body),etag});return new Response(null,{status:201,headers:{ETag:etag}});
 };
 await store.create(password);
 for(const config of configurations){
  await store.save({entries:{[date]:entry('Original '+config.type)}});
  await store.configure(config);assert.deepEqual(store.control().base,{});
  await store.sync();const baseline=store.control().base;assert.ok(Object.keys(baseline).length);
  const rotated=config.type==='s3'?{...config,secretAccessKey:'rotated-cloud-secret'}:{...config,sasToken:config.sasToken.replace('synthetic','rotated')};
  await store.configure(rotated);assert.deepEqual(store.control().base,baseline);
  const serialized=JSON.stringify(await getDocument()),backup=await store.backup();
  for(const token of ['synthetic-key','rotated-cloud-secret','synthetic-session','rotated-azure-token','Private cloud journal text']){assert.ok(!serialized.includes(token));assert.ok(!backup.includes(token));}
  const identity=store.control().remote.url,current=objects.get(identity),keys=await unlockVault(current.vault,password),records=await readRecords(current.vault,keys),id=await recordId(date,keys);
  records[id]={...records[id],entry:entry('Remote edit '+config.type),rev:crypto.randomUUID()};
  objects.set(identity,{vault:await pack(current.vault,records,keys),etag:'"'+(++version)+'"'});
  const local=(await store.unlock(password)).entries;await store.save({entries:{...local,'2026-11-18':entry('Independent edit')}});
  const merged=await store.sync();assert.equal(merged.entries[date].title,'Remote edit '+config.type);assert.ok(merged.entries['2026-11-18']);
  const concurrent=objects.get(identity),other=await readRecords(concurrent.vault,keys);other[id]={...other[id],entry:entry('Concurrent remote'),rev:crypto.randomUUID()};
  objects.set(identity,{vault:await pack(concurrent.vault,other,keys),etag:'"'+(++version)+'"'});
  await store.save({entries:{...merged.entries,[date]:entry('Concurrent local')}});await assert.rejects(store.sync(),ConflictError);
  const resolved=await store.sync({[id]:'remote'});assert.equal(resolved.entries[date].title,'Concurrent remote');
  await store.lock();const opened=await store.openRemote(rotated,password);assert.equal(opened.entries[date].title,'Concurrent remote');
  objects.delete(identity);const before=await getDocument();await assert.rejects(store.sync(),/remote file is missing/);assert.deepEqual(await getDocument(),before);
 }
 await store.configure({type:'webdav',url:configurations[1].url,user:'user',password:'password'});assert.deepEqual(store.control().base,{});
});

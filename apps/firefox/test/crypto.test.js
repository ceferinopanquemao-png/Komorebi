import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes,createCipheriv,scryptSync} from 'node:crypto';
import {newVault,unlockVault,readRecords,recordId,pack,importDesktop} from '../src/crypto.js';
const password='a long private passphrase';
const date='2026-11-15',entry={title:'Secret title',body:'My confidential diary',mood:'peaceful',starred:true};
test('browser vault hides dates, content and titles; authenticates records and manifest',async()=>{
 const {vault,keys}=await newVault(password),id=await recordId(date,keys);
 const records={[id]:{date,entry,rev:'r1',deleted:false}},encrypted=await pack(vault,records,keys),raw=JSON.stringify(encrypted);
 for(const secret of [date,entry.title,entry.body])assert.ok(!raw.includes(secret));
 const recovered=await unlockVault(encrypted,password);assert.deepEqual(await readRecords(encrypted,recovered),records);
 assert.equal(id,await recordId(date,keys));
 const again=await pack(vault,records,keys);assert.notEqual(encrypted.records[id].iv,again.records[id].iv);
 await assert.rejects(unlockVault(encrypted,'a completely wrong password'),/Incorrect password/);
 const removed=structuredClone(encrypted);delete removed.records[id];await assert.rejects(readRecords(removed,keys),/manifest/);
 const tampered=structuredClone(encrypted);tampered.records[id].ciphertext='AA==';await assert.rejects(readRecords(tampered,keys),/damaged/);
 const changedHeader=structuredClone(encrypted);changedHeader.iterations=1;await assert.rejects(unlockVault(changedHeader,password),/unsupported/);
});
test('original Electron scrypt/AES-GCM vault imports with the same password',async()=>{
 const salt=randomBytes(16),iv=randomBytes(12),key=scryptSync(password,salt,32,{N:32768,r:8,p:1,maxmem:64*1024*1024});
 const cipher=createCipheriv('aes-256-gcm',key,iv),data={entries:{[date]:entry}};
 const ciphertext=Buffer.concat([cipher.update(JSON.stringify(data)),cipher.final()]);
 const raw=JSON.stringify({version:1,salt:salt.toString('base64'),iv:iv.toString('base64'),tag:cipher.getAuthTag().toString('base64'),ciphertext:ciphertext.toString('base64')});
 assert.deepEqual(await importDesktop(raw,password),data);
 await assert.rejects(importDesktop(raw,'an incorrect desktop password'),/Incorrect desktop password/);
});
test('new journals reject short passwords',async()=>{await assert.rejects(newVault('short'),/10–1024/);});

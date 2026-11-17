const {test} = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const {keyFor,seal,open} = require('../electron/vault.cjs');
const password='a long private passphrase';
test('vault encrypts all journal data and round trips',async()=>{
 const salt=crypto.randomBytes(16),key=await keyFor(password,salt);
 const data={entries:{'2026-11-15':{title:'Secret title',body:'Secret journal content',mood:'peaceful'}}};
 const raw=seal(data,key,salt);
 assert.ok(!raw.includes('Secret'));assert.ok(!raw.includes('2026-11-15'));
 assert.deepEqual((await open(raw,password)).data,data);
});
test('wrong password and modified ciphertext are rejected',async()=>{
 const salt=crypto.randomBytes(16),key=await keyFor(password,salt),raw=seal({entries:{}},key,salt);
 await assert.rejects(open(raw,'a completely different password'),/Incorrect password/);
 const v=JSON.parse(raw),b=Buffer.from(v.ciphertext,'base64');b[0]^=1;v.ciphertext=b.toString('base64');
 await assert.rejects(open(JSON.stringify(v),password),/damaged vault/);
});
test('each save uses a fresh nonce',async()=>{
 const salt=crypto.randomBytes(16),key=await keyFor(password,salt);
 assert.notEqual(JSON.parse(seal({},key,salt)).iv,JSON.parse(seal({},key,salt)).iv);
});
test('short passwords are refused',async()=>{await assert.rejects(keyFor('short',crypto.randomBytes(16)),/10 characters/);});

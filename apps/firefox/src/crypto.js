const enc=new TextEncoder(), dec=new TextDecoder();
export const FORMAT='komorebi-firefox';
export const ITERATIONS=600000;
export function b64(bytes){let s='';for(const v of new Uint8Array(bytes))s+=String.fromCharCode(v);return btoa(s);}
export function unb64(s){if(typeof s!=='string'||s.length>70_000_000)throw Error('Invalid encoded vault data.');return Uint8Array.from(atob(s),c=>c.charCodeAt(0));}
export function checkHeader(v){
 if(v?.format!==FORMAT||v.version!==1||v.kdf!=='PBKDF2-SHA256'||v.iterations!==ITERATIONS||typeof v.id!=='string'||v.id.length>80||unb64(v.salt).length!==16||!v.records||typeof v.records!=='object'||Array.isArray(v.records)||Object.keys(v.records).length>50000)throw Error('Invalid or unsupported encrypted journal.');
}
export async function derive(password,salt){
 if(typeof password!=='string'||password.length<10||password.length>1024)throw Error('Use a password of 10–1024 characters.');
 const material=await crypto.subtle.importKey('raw',enc.encode(password),'PBKDF2',false,['deriveBits']);
 const raw=new Uint8Array(await crypto.subtle.deriveBits({name:'PBKDF2',salt:unb64(salt),iterations:ITERATIONS,hash:'SHA-256'},material,512));
 const aes=await crypto.subtle.importKey('raw',raw.slice(0,32),'AES-GCM',false,['encrypt','decrypt']);
 const hmac=await crypto.subtle.importKey('raw',raw.slice(32),{name:'HMAC',hash:'SHA-256'},false,['sign']);raw.fill(0);
 return {aes,hmac};
}
export async function encrypt(value,key,aad){const iv=crypto.getRandomValues(new Uint8Array(12));const ciphertext=await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:enc.encode(aad)},key,enc.encode(JSON.stringify(value)));return {iv:b64(iv),ciphertext:b64(ciphertext)};}
export async function decrypt(box,key,aad){try{if(unb64(box.iv).length!==12)throw Error();return JSON.parse(dec.decode(await crypto.subtle.decrypt({name:'AES-GCM',iv:unb64(box.iv),additionalData:enc.encode(aad)},key,unb64(box.ciphertext))));}catch{throw Error('Incorrect password or damaged journal.');}}
export async function recordId(date,keys){return b64(await crypto.subtle.sign('HMAC',keys.hmac,enc.encode('entry:'+date))).replaceAll('/','_').replaceAll('+','-').replaceAll('=','');}
export async function newVault(password){const header={format:FORMAT,version:1,id:crypto.randomUUID(),kdf:'PBKDF2-SHA256',iterations:ITERATIONS,salt:b64(crypto.getRandomValues(new Uint8Array(16))),records:{}};const keys=await derive(password,header.salt);header.check=await encrypt('Komorebi journal',keys.aes,header.id+':check');header.manifest=await encrypt([],keys.aes,header.id+':manifest');return {vault:header,keys};}
export async function unlockVault(vault,password){checkHeader(vault);const keys=await derive(password,vault.salt);await verify(vault,keys);return keys;}
export async function verify(vault,keys){checkHeader(vault);if(await decrypt(vault.check,keys.aes,vault.id+':check')!=='Komorebi journal')throw Error('Invalid journal.');const ids=await decrypt(vault.manifest,keys.aes,vault.id+':manifest');if(!Array.isArray(ids)||JSON.stringify(ids)!==JSON.stringify(Object.keys(vault.records).sort()))throw Error('Journal manifest does not match its entries.');}
export async function readRecords(vault,keys){await verify(vault,keys);const records={};for(const [id,box] of Object.entries(vault.records)){const r=await decrypt(box,keys.aes,vault.id+':entry:'+id);validateRecord(r);if(await recordId(r.date,keys)!==id)throw Error('Invalid entry identity.');records[id]=r;}return records;}
export function validateRecord(r){if(!r||!/^\d{4}-\d{2}-\d{2}$/.test(r.date)||typeof r.rev!=='string'||r.rev.length>80||typeof r.deleted!=='boolean'||(!r.deleted&&(!r.entry||typeof r.entry.title!=='string'||typeof r.entry.body!=='string'||typeof r.entry.starred!=='boolean'||typeof r.entry.mood!=='string')))throw Error('Invalid journal entry.');}
export async function pack(vault,records,keys){const result={...vault,records:{}};for(const [id,r] of Object.entries(records))result.records[id]=await encrypt(r,keys.aes,vault.id+':entry:'+id);result.manifest=await encrypt(Object.keys(records).sort(),keys.aes,vault.id+':manifest');return result;}
export async function importDesktop(raw,password){
 const v=JSON.parse(raw);if(v.version!==1||v.format||unb64(v.salt).length!==16||unb64(v.iv).length!==12||unb64(v.tag).length!==16)throw Error('Not a supported desktop vault.');
 const {scryptAsync}=await import('@noble/hashes/scrypt');
 const rawKey=await scryptAsync(enc.encode(password),unb64(v.salt),{N:32768,r:8,p:1,dkLen:32,maxmem:64*1024*1024});
 try{const key=await crypto.subtle.importKey('raw',rawKey,'AES-GCM',false,['decrypt']);const ciphertext=unb64(v.ciphertext),tag=unb64(v.tag),full=new Uint8Array(ciphertext.length+tag.length);full.set(ciphertext);full.set(tag,ciphertext.length);const data=JSON.parse(dec.decode(await crypto.subtle.decrypt({name:'AES-GCM',iv:unb64(v.iv)},key,full)));if(!data.entries||typeof data.entries!=='object')throw Error();for(const [date,e] of Object.entries(data.entries))validateRecord({date,entry:e,deleted:false,rev:'import'});return data;}catch{throw Error('Incorrect desktop password or damaged vault.');}finally{rawKey.fill(0);}
}

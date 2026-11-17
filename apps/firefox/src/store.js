import {newVault,unlockVault,readRecords,recordId,pack,encrypt,decrypt,importDesktop,FORMAT} from './crypto.js';
import {getDocument,putDocument} from './db.js';
import {mergeRecords,revisions} from './merge.js';
import {WebDAV} from './webdav.js';
let session,queue=Promise.resolve(),lockListeners=[];
export function exclusive(fn){const job=queue.catch(()=>{}).then(fn);queue=job;return job;}
const emptyControl=()=>({base:{},remote:null,lastSync:null});
function active(){if(!session)throw Error('Journal is locked.');return session;}
function journal(records){const entries={};for(const r of Object.values(records))if(!r.deleted)entries[r.date]=structuredClone(r.entry);return {entries};}
async function commit(s){const vault=await pack(s.vault,s.records,s.keys),control=await encrypt(s.control,s.keys.aes,vault.id+':control');await putDocument({vault,control});s.vault=vault;}
export const store={
 async exists(){return !!await getDocument();},
 create(password){return exclusive(async()=>{if(await getDocument())throw Error('A local journal already exists. Unlock it instead.');const {vault,keys}=await newVault(password);const s={vault,keys,records:{},control:emptyControl()};await commit(s);session=s;return journal(s.records);});},
 unlock(password){return exclusive(async()=>{const doc=await getDocument();if(!doc)throw Error('No local journal exists.');const keys=await unlockVault(doc.vault,password),records=await readRecords(doc.vault,keys),control=doc.control?await decrypt(doc.control,keys.aes,doc.vault.id+':control'):emptyControl();session={vault:doc.vault,keys,records,control};return journal(records);});},
 save(data){return exclusive(async()=>{const s=active();for(const [date,entry] of Object.entries(data.entries)){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||typeof entry.title!=='string'||typeof entry.body!=='string'||typeof entry.mood!=='string'||typeof entry.starred!=='boolean')throw Error('Invalid entry.');
  const id=await recordId(date,s.keys),old=s.records[id];if(!old||old.deleted||JSON.stringify(old.entry)!==JSON.stringify(entry))s.records[id]={date,entry:structuredClone(entry),deleted:false,rev:crypto.randomUUID()};
 }for(const [id,r] of Object.entries(s.records))if(!r.deleted&&!data.entries[r.date])s.records[id]={date:r.date,deleted:true,rev:crypto.randomUUID()};await commit(s);});},
 lock(){return exclusive(async()=>{session=undefined;lockListeners.forEach(fn=>fn());});},onLock(fn){lockListeners.push(fn);},
 async backup(){await queue;return JSON.stringify(active().vault);},
 control(){return structuredClone(active().control);},
 configure(remote){return exclusive(async()=>{const s=active();if(s.control.remote?.url!==remote?.url)s.control.base={};s.control.remote=remote;await commit(s);});},
 sync(choices={}){return exclusive(async()=>{const s=active();if(!s.control.remote)throw Error('Connect a WebDAV server first.');const dav=new WebDAV(s.control.remote),{vault:remote,etag}=await dav.read();let records=s.records;if(remote){if(remote.id!==s.vault.id||remote.salt!==s.vault.salt)throw Error('The remote file belongs to a different journal. Lock this journal and open the remote journal, or choose another filename.');const other=await readRecords(remote,s.keys);records=mergeRecords(s.records,other,s.control.base,choices);}
  else if(Object.keys(s.control.base).length)throw Error('The previously synced remote file is missing. Check the server before creating a new remote copy.');
  const candidate=await pack(s.vault,records,s.keys);await dav.write(candidate,etag);
  s.records=records;s.vault=candidate;s.control.base=revisions(records);s.control.lastSync=new Date().toISOString();await commit(s);return journal(records);
 });},
 restore(raw,password){return exclusive(async()=>{if(session)throw Error('Lock the journal before restoring.');if(raw.length>50_000_000)throw Error('Backup exceeds 50 MB.');const v=JSON.parse(raw);let s;
  if(v.format===FORMAT){const keys=await unlockVault(v,password),records=await readRecords(v,keys);s={vault:v,keys,records,control:emptyControl()};}
  else {const data=await importDesktop(raw,password),{vault,keys}=await newVault(password);s={vault,keys,records:{},control:emptyControl()};for(const [date,entry] of Object.entries(data.entries)){const id=await recordId(date,keys);s.records[id]={date,entry:structuredClone(entry),deleted:false,rev:crypto.randomUUID()};}}
  await commit(s);session=s;return journal(s.records);
 });},
 openRemote(config,password){return exclusive(async()=>{if(session)throw Error('Lock the journal before opening a remote journal.');const {vault}=await new WebDAV(config).read();if(!vault)throw Error('No journal found at this remote URL.');const keys=await unlockVault(vault,password),records=await readRecords(vault,keys);const s={vault,keys,records,control:{...emptyControl(),remote:config,base:revisions(records),lastSync:new Date().toISOString()}};await commit(s);session=s;return journal(records);});}
};

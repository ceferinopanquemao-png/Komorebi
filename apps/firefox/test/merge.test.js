import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mergeRecords,ConflictError,revisions} from '../src/merge.js';
const record=(rev,date='2026-11-15',deleted=false)=>({rev,date,deleted,entry:deleted?undefined:{title:rev,body:'',mood:'',starred:false}});
test('independent offline edits merge and unchanged records stay intact',()=>{
 const a=record('a'),b=record('b','2026-11-16');
 assert.deepEqual(mergeRecords({a},{b},{}),{a,b});
 assert.equal(mergeRecords({a:record('new')},{a},{a:'a'}).a.rev,'new');
 assert.equal(mergeRecords({a},{a:record('new')},{a:'a'}).a.rev,'new');
 assert.deepEqual(revisions({a,b}),{a:'a',b:'b'});
});
test('same-day and delete/edit conflicts require explicit resolution',()=>{
 const local={a:record('local')},remote={a:record('remote')},base={a:'old'};
 assert.throws(()=>mergeRecords(local,remote,base),ConflictError);
 assert.equal(mergeRecords(local,remote,base,{a:'remote'}).a.rev,'remote');
 assert.equal(mergeRecords(local,remote,base,{a:'local'}).a.rev,'local');
 assert.throws(()=>mergeRecords({a:record('deleted',undefined,true)},remote,base),ConflictError);
});
test('deletion tombstones propagate and do not resurrect unchanged entries',()=>{
 const original=record('old'),deleted=record('deleted','2026-11-15',true);
 assert.equal(mergeRecords({a:original},{a:deleted},{a:'old'}).a.deleted,true);
 assert.equal(mergeRecords({a:deleted},{a:original},{a:'old'}).a.deleted,true);
});

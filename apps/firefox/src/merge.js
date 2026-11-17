export class ConflictError extends Error{constructor(conflicts){super('Some days changed on both devices. Choose which version to keep.');this.conflicts=conflicts;}}
export function mergeRecords(local,remote,base={},choices={}){
 const merged={},conflicts=[];
 for(const id of new Set([...Object.keys(local),...Object.keys(remote)])){
  const l=local[id],r=remote[id],b=base[id]??null,lr=l?.rev??null,rr=r?.rev??null;
  if(lr===rr){if(l)merged[id]=l;}
  else if(lr===b){if(r)merged[id]=r;}
  else if(rr===b){if(l)merged[id]=l;}
  else if(choices[id]==='local'){if(l)merged[id]=l;}
  else if(choices[id]==='remote'){if(r)merged[id]=r;}
  else conflicts.push({id,date:l?.date||r?.date,local:l,remote:r});
 }
 if(conflicts.length)throw new ConflictError(conflicts);
 return merged;
}
export function revisions(records){return Object.fromEntries(Object.entries(records).map(([id,r])=>[id,r.rev]));}

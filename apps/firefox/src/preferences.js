let values={};
export const preferences={
 async load(){if(globalThis.browser?.storage)values=await browser.storage.local.get(['paper','auto-lock']);else{try{values=JSON.parse(localStorage.getItem('komorebi-preferences')||'{}');}catch{values={};}}},
 get(key){return values[key]??null;},
 set(key,value){values[key]=value;if(globalThis.browser?.storage)browser.storage.local.set({[key]:value}).catch(()=>{});else localStorage.setItem('komorebi-preferences',JSON.stringify(values));}
};

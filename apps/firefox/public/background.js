async function openJournal() {
 const url=browser.runtime.getURL('index.html');
 // Firefox may restrict URL-filtered queries before any optional host grants.
 const tabs=await browser.tabs.query({url}).catch(()=>[]);
 if(tabs.length){await browser.tabs.update(tabs[0].id,{active:true});await browser.windows.update(tabs[0].windowId,{focused:true});}
 else await browser.tabs.create({url});
}
browser.action.onClicked.addListener(openJournal);
browser.runtime.onInstalled.addListener(details=>{if(details.reason==='install')openJournal();});

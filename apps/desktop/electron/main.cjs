const {app, BrowserWindow, ipcMain, dialog, powerMonitor} = require('electron');
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const {keyFor, seal, open} = require('./vault.cjs');
let win, session, allowClose = false, queue = Promise.resolve();
const vaultPath = () => path.join(app.getPath('userData'), 'journal.vault');
async function persist(data) {
  if (!session) throw new Error('Vault is locked.');
  if (!data || typeof data.entries !== 'object' || Array.isArray(data.entries)) throw new Error('Invalid journal data.');
  const raw = seal(data, session.key, session.salt);
  queue = queue.catch(() => {}).then(async () => {
    const tmp = vaultPath() + '.tmp';
    await fs.writeFile(tmp, raw, {mode: 0o600});
    await fs.rename(tmp, vaultPath());
  });
  await queue;
}
function lock() { if(session) session.key.fill(0); session = undefined; win?.webContents.send('vault:locked'); }
app.whenReady().then(() => {
  ipcMain.on('app:close-ready', () => {allowClose = true; win.close();});
  ipcMain.handle('vault:exists', async () => { try {await fs.access(vaultPath()); return true;} catch {return false;} });
  ipcMain.handle('vault:create', async (_, password) => {
    try {await fs.access(vaultPath());} catch {
      const salt = crypto.randomBytes(16); const key = await keyFor(password, salt);
      session = {key, salt}; const data = {entries: {}}; await persist(data); return data;
    }
    throw new Error('A vault already exists. Unlock it instead.');
  });
  ipcMain.handle('vault:unlock', async (_, password) => {const result = await open(await fs.readFile(vaultPath(), 'utf8'), password); if(session) session.key.fill(0); session = {key: result.key, salt: result.salt}; return result.data;});
  ipcMain.handle('vault:save', (_, data) => persist(data));
  ipcMain.handle('vault:lock', async () => {await queue; lock();});
  ipcMain.handle('vault:backup', async () => {
    await queue;
    const {filePath, canceled} = await dialog.showSaveDialog(win, {defaultPath: 'komorebi-backup.vault', filters: [{name:'Encrypted vault', extensions:['vault']}]});
    if(!canceled) {await fs.copyFile(vaultPath(), filePath); return true;} return false;
  });
  ipcMain.handle('vault:restore', async () => {
    if(session) throw new Error('Lock the journal before restoring.');
    const r = await dialog.showOpenDialog(win, {properties:['openFile'], filters:[{name:'Encrypted vault',extensions:['vault']}]});
    if(r.canceled) return false;
    const raw = await fs.readFile(r.filePaths[0], 'utf8'); const v = JSON.parse(raw);
    if(v.version !== 1 || !v.ciphertext || !v.salt || !v.tag || !v.iv) throw new Error('Invalid vault backup.');
    try {await fs.copyFile(vaultPath(), vaultPath()+'.before-restore');} catch(e) {if(e.code !== 'ENOENT') throw e;}
    await fs.writeFile(vaultPath()+'.tmp',raw,{mode:0o600}); await fs.rename(vaultPath()+'.tmp', vaultPath()); return true;
  });
  win = new BrowserWindow({width:1440,height:960,minWidth:920,minHeight:650,backgroundColor:'#f7f6f2',title:'Komorebi',webPreferences:{preload:path.join(__dirname,'preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true}});
  win.setMenuBarVisibility(false);
  win.on('close', e => {if(!allowClose && session) {e.preventDefault(); win.webContents.send('app:before-close');}});
  win.webContents.setWindowOpenHandler(() => ({action:'deny'}));
  win.webContents.on('will-navigate', e => e.preventDefault());
  win.loadFile(path.join(__dirname,'../dist/index.html'));
  powerMonitor.on('lock-screen', lock); powerMonitor.on('suspend', lock);
});
app.on('window-all-closed', () => {lock(); app.quit();});

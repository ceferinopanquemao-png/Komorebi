import {readFile,readdir,mkdir,writeFile} from 'node:fs/promises';
import {join,relative} from 'node:path';
import {zipSync,strToU8} from 'fflate';
const files={};
async function collect(dir){for(const e of await readdir(dir,{withFileTypes:true})){const path=join(dir,e.name);if(e.isDirectory())await collect(path);else files[relative('dist',path).replaceAll('\\','/')]=new Uint8Array(await readFile(path));}}
await collect('dist');
const manifest=JSON.parse(new TextDecoder().decode(files['manifest.json']));
await mkdir('packages',{recursive:true});
const path=`packages/komorebi-firefox-${manifest.version}-unsigned.xpi`;
await writeFile(path,zipSync(files,{level:6}));console.log('Created '+path+' (unsigned; use temporary installation or submit for Mozilla signing).');

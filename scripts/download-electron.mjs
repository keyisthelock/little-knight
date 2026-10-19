import fs from 'node:fs';
import crypto from 'node:crypto';
const version=JSON.parse(fs.readFileSync('node_modules/electron/package.json')).version;
const name=`electron-v${version}-win32-x64.zip`;
const filename='.sites-runtime/'+name;
fs.mkdirSync('.sites-runtime',{recursive:true});
if(!fs.existsSync(filename)){
  const r=await fetch(`https://github.com/electron/electron/releases/download/v${version}/${name}`);
  if(!r.ok)throw new Error('Electron download failed: '+r.status);
  fs.writeFileSync(filename,Buffer.from(await r.arrayBuffer()));
}
const hash=crypto.createHash('sha256').update(fs.readFileSync(filename)).digest('hex');
const checksums=JSON.parse(fs.readFileSync('node_modules/electron/checksums.json'));
const expected=checksums[name];
if(hash!==expected)throw new Error('Electron checksum mismatch: '+JSON.stringify({hash,expected}));
console.log('Electron Windows archive verified:',filename);

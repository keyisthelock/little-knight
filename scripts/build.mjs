import { build } from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
fs.mkdirSync('dist/engine',{recursive:true});
await build({ entryPoints:['src/app.js'], bundle:true, format:'esm', target:['chrome120','firefox120','safari17'], minify:true, sourcemap:false, outfile:'dist/app.js' });
fs.copyFileSync('src/style.css','dist/app.css');
fs.copyFileSync('index.html','dist/index.html');
fs.cpSync('public','dist',{recursive:true});
await build({entryPoints:['server/worker.js'],bundle:true,format:'esm',platform:'browser',target:'es2022',outfile:'dist/_worker.js'});
const engineDir='node_modules/stockfish/bin';
fs.copyFileSync(path.join(engineDir,'stockfish-18-lite-single.js'),'dist/engine/stockfish.js');
fs.copyFileSync(path.join(engineDir,'stockfish-18-lite-single.wasm'),'dist/engine/stockfish.wasm');
fs.copyFileSync(path.join(engineDir,'stockfish-18-single.js'),'dist/engine/stockfish-full.js');
const full=fs.readFileSync(path.join(engineDir,'stockfish-18-single.wasm'));
const fullDir='dist/engine/full-v18';fs.mkdirSync(fullDir,{recursive:true});
const parts=[];
for(let offset=0,index=0;offset<full.length;offset+=16*1024*1024,index++){
  const name=`part-${index}.bin`;parts.push(name);
  fs.writeFileSync(path.join(fullDir,name),full.subarray(offset,Math.min(full.length,offset+16*1024*1024)));
}
fs.writeFileSync(path.join(fullDir,'manifest.json'),JSON.stringify({version:'18.0.8',bytes:full.length,sha256:crypto.createHash('sha256').update(full).digest('hex'),parts}));
const obsolete=path.resolve('dist/engine/stockfish-18-lite-single.wasm');
if(fs.existsSync(obsolete))fs.unlinkSync(obsolete);
fs.mkdirSync('dist/engine/source',{recursive:true});
// Ship matching source and build instructions, with binary checksums.
if(!fs.existsSync('public/engine-source/stockfish-18.0.8-source.tgz')) throw new Error('Run node scripts/verify-engine-source.mjs first.');
if(fs.existsSync('.openai/hosting.json')){
  const manifest=JSON.parse(fs.readFileSync('.openai/hosting.json','utf8'));
  manifest.static={directory:'dist'};
  fs.writeFileSync('.openai/hosting.json',JSON.stringify(manifest,null,2)+'\n');
}
console.log('Built Little Knight: full Stockfish analysis + adjustable practice engine; one active worker, one thread.');

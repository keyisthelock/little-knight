import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
const root=path.resolve('dist');
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.wasm':'application/wasm','.svg':'image/svg+xml','.webmanifest':'application/manifest+json','.json':'application/json','.tgz':'application/gzip'};
export function makeServer() {return http.createServer((req,res)=>{
  let pathname;try{pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);}catch{res.writeHead(400).end();return;}
  const filename=path.resolve(root,'.'+pathname+(pathname.endsWith('/')?'index.html':''));
  if(!filename.startsWith(root+path.sep)){res.writeHead(403).end();return;}
  try { const stat=fs.statSync(filename);if(!stat.isFile())throw new Error();res.writeHead(200,{'Content-Type':mime[path.extname(filename)]||'application/octet-stream','Cache-Control':'no-cache','X-Content-Type-Options':'nosniff'});fs.createReadStream(filename).pipe(res); }
  catch {res.writeHead(404,{'Content-Type':'text/plain'}).end('File not found');}
});}
if(process.argv[1]&&path.resolve(process.argv[1])===path.resolve('scripts/serve.mjs'))makeServer().listen(4173,'127.0.0.1',()=>console.log('Local: http://127.0.0.1:4173'));

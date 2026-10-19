const CACHE='little-knight-v5';
const ASSETS=['./','./index.html','./app.js','./app.css','./icon.svg','./manifest.webmanifest','./engine/stockfish.js','./engine/stockfish.wasm','./licenses.html'];
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS)).then(()=>self.skipWaiting())));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('little-knight-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',event=>{
 const url=new URL(event.request.url);
 if(event.request.method!=='GET'||url.origin!==self.location.origin||url.pathname.startsWith('/api/'))return;
 const fullAsset=url.pathname.includes('/engine/full-v18/')||url.pathname.endsWith('/engine/stockfish-full.js');
 event.respondWith((async()=>{
   const cache=await caches.open(CACHE);
   if(fullAsset){const cached=await cache.match(event.request);if(cached)return cached;}
   try{
     const response=await fetch(event.request);
     if(response.ok&&(fullAsset||ASSETS.some(a=>new URL(a,self.registration.scope).href===event.request.url))){
       const copy=response.clone();event.waitUntil(cache.put(event.request,copy).catch(()=>{}));
     }
     return response;
   }catch{return(await cache.match(event.request))||new Response('Not available offline yet',{status:503});}
 })());
});

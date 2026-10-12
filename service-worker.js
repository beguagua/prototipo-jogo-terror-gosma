const CACHE_NAME = "grey-eyes-shell-v045";
const CONTENT_CACHE = "grey-eyes-content-v2";
const SHELL = ["./","./index.html","./style.css","./game.js","./asset-downloader.js","./manifest.webmanifest","./ASSET_CATALOG.html","./assets/manifest.json"];
self.addEventListener("install",event=>event.waitUntil(caches.open(CACHE_NAME).then(c=>c.addAll(SHELL)).then(()=>self.skipWaiting())));
self.addEventListener("activate",event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith("grey-eyes-shell-")&&k!==CACHE_NAME).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener("fetch",event=>{
 const req=event.request;
 if(req.method!=="GET")return;
 event.respondWith(caches.match(req).then(hit=>{
  if(hit)return hit;
  const url=new URL(req.url);
  if(url.origin!==self.location.origin){
   return caches.open(CONTENT_CACHE).then(c=>c.match(req).then(saved=>saved||fetch(req)));
  }
  return fetch(req).then(res=>{if(res.ok){const copy=res.clone();caches.open(CACHE_NAME).then(c=>c.put(req,copy));}return res;});
 }));
});

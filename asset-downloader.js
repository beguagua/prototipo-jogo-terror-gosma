(() => {
"use strict";
const API = "https://api.polyhaven.com";
const CACHE_NAME = "grey-eyes-content-v1";
const MAX_BYTES = 120 * 1024 * 1024;
const META_KEY = "grey-eyes-downloaded-assets-v1";
let cancelRequested = false;
const MODEL_INDEX_URL = new URL("./__greyeyes_model_index__.json", location.href).href;
const statusEl = () => document.getElementById("assetDownloadStatus");
const detailsEl = () => document.getElementById("assetDownloadDetails");
const barEl = () => document.getElementById("assetDownloadBar");
const fmt = n => n < 1024 ? `${n} B` : n < 1048576 ? `${(n/1024).toFixed(1)} KB` : `${(n/1048576).toFixed(1)} MB`;
function readMeta(){try{return JSON.parse(localStorage.getItem(META_KEY)||"[]");}catch(_){return [];}}
function writeMeta(items){try{localStorage.setItem(META_KEY,JSON.stringify(items));}catch(e){console.warn("Não foi possível salvar metadados",e);}}
function say(message, detail="") { if(statusEl()) statusEl().textContent=message; if(detailsEl()) detailsEl().textContent=detail; }
function walkFiles(node, path="", out=[]) {
  if (!node || typeof node !== "object") return out;
  if (typeof node.url === "string" && Number.isFinite(Number(node.size))) {
    out.push({url:node.url,size:Number(node.size)||0,path,md5:node.md5||""});
    return out;
  }
  for (const [key,value] of Object.entries(node)) walkFiles(value, path ? `${path}/${key}` : key, out);
  return out;
}
async function json(url) {
  const res=await fetch(url,{mode:"cors",cache:"no-cache"});
  if(!res.ok) throw new Error(`Servidor respondeu ${res.status} para ${url}`);
  return res.json();
}
async function searchAssets(query,type,limit=3) {
  const data=await json(`${API}/search?q=${encodeURIComponent(query)}&t=${encodeURIComponent(type)}&limit=${limit}`);
  return (data.results||[]).map(x=>x.slug).filter(Boolean);
}
function selectFiles(files,type) {
  const good=files.filter(f=>f.size>0 && f.size<MAX_BYTES && !/\.blend1?(\?|$)/i.test(f.url));
  if(type==="models") {
    const glb=good.filter(f=>/\.glb(\?|$)/i.test(f.url));
    const gltf=good.filter(f=>/\.gltf(\?|$)/i.test(f.url));
    const chosen=glb.length?glb:gltf;
    return chosen.sort((a,b)=>a.size-b.size).slice(0,3);
  }
  // Prefer 1K/2K texture files and standard image formats; avoid very large resolutions.
  const images=good.filter(f=>/\.(jpg|jpeg|png|webp|exr|hdr)(\?|$)/i.test(f.url));
  const small=images.filter(f=>/1k|2k/i.test(f.path+" "+f.url));
  const candidates=(small.length?small:images).sort((a,b)=>a.size-b.size);
  // Keep a useful set of maps but do not exceed the package budget.
  const chosen=[];let total=0;
  for(const f of candidates){if(chosen.length>=5)break;if(total+f.size>45*1024*1024)continue;chosen.push(f);total+=f.size;}
  return chosen;
}
async function prepareQueries(pack) {
  if(pack==="textures") return [
    {q:"cracked asphalt",type:"textures"},
    {q:"dirty concrete wall",type:"textures"}
  ];
  if(pack==="models") return [
    {q:"abandoned car",type:"models"},
    {q:"street lamp",type:"models"},
    {q:"industrial barrel",type:"models"}
  ];
  return [
    {q:"cracked asphalt",type:"textures"},
    {q:"dirty concrete wall",type:"textures"},
    {q:"abandoned car",type:"models"}
  ];
}
async function runDownload() {
  if(!window.isSecureContext || !("caches" in window)) {
    say("Não foi possível guardar no jogo.","Abra o projeto por HTTPS ou localhost. Abrir o HTML diretamente como arquivo não permite o cache persistente."); return;
  }
  if(!navigator.onLine){say("Sem conexão com a internet.","Conecte-se e tente novamente.");return;}
  cancelRequested=false;
  document.getElementById("startAssetDownload").disabled=true;
  document.getElementById("cancelAssetDownload").disabled=false;
  barEl().style.width="0%";
  let done=0,totalBytes=0,errors=[];
  try {
    const pack=document.getElementById("downloadPack").value;
    const queries=await prepareQueries(pack);
    const queue=[];
    for(let i=0;i<queries.length;i++){
      if(cancelRequested) throw new Error("Cancelado pelo usuário.");
      const q=queries[i]; say(`Procurando ${q.type}: ${q.q}…`,`${i+1}/${queries.length} buscas no catálogo CC0 do Poly Haven.`);
      const slugs=await searchAssets(q.q,q.type,3);
      let found=false;
      for(const slug of slugs){
        try {
          const tree=await json(`${API}/files/${encodeURIComponent(slug)}`);
          const selected=selectFiles(walkFiles(tree),q.type);
          if(selected.length){
            selected.forEach(f=>queue.push({...f,slug,type:q.type}));
            found=true;break;
          }
        } catch(e) { errors.push(`${slug}: ${e.message}`); }
      }
      if(!found) errors.push(`Nenhum arquivo compatível encontrado para “${q.q}”.`);
    }
    // Remove duplicate URLs and enforce a conservative total-size limit before fetching.
    const unique=[...new Map(queue.map(f=>[f.url,f])).values()];
    const limited=[];let estimate=0;
    for(const f of unique){if(estimate+f.size<=MAX_BYTES){limited.push(f);estimate+=f.size;}}
    if(!limited.length) throw new Error("Não encontrei arquivos diretos compatíveis. Tente outro pacote ou mais tarde.");
    const cache=await caches.open(CACHE_NAME);
    const modelIndex=[];
    say(`Preparando ${limited.length} arquivo(s)…`,`Tamanho informado pelos servidores: aproximadamente ${fmt(estimate)}. Os servidores podem não fornecer tamanho exato.`);
    for(let i=0;i<limited.length;i++){
      if(cancelRequested) throw new Error("Cancelado pelo usuário.");
      const f=limited[i];
      say(`Baixando ${i+1}/${limited.length}: ${f.slug}`,`${fmt(f.size)} • ${f.path||f.url}`);
      const response=await fetch(f.url,{mode:"cors",cache:"no-store"});
      if(!response.ok || response.type==="opaque") throw new Error(`Download bloqueado ou indisponível: ${f.url}`);
      // Cache.put streams the response into persistent browser storage without constructing a giant ZIP in memory.
      await cache.put(f.url,response.clone());
      const meta=readMeta();
      if(!meta.some(x=>x.url===f.url)) meta.push({url:f.url,slug:f.slug,type:f.type,path:f.path||"",size:f.size,contentType:response.headers.get("content-type")||""});
      writeMeta(meta);
      totalBytes+=f.size;done++;
      barEl().style.width=`${Math.round(done/limited.length*100)}%`;
    }
    if(modelIndex.length){const payload=new Response(JSON.stringify(modelIndex),{headers:{"Content-Type":"application/json"}});await cache.put(MODEL_INDEX_URL,payload);}
    say(`Concluído: ${done} arquivo(s) guardados no jogo.`,`${fmt(totalBytes)} estimados. Os arquivos permanecem no cache deste navegador/dispositivo; isto não cria uma pasta ZIP visível.`);
    await showStored();
    window.dispatchEvent(new CustomEvent("greyeyes-assets-updated"));
  } catch(e) {
    say(e.message||"O download falhou.",errors.length?errors.slice(0,3).join(" • "):"Verifique a conexão, o espaço livre e se o servidor permite downloads pelo navegador.");
  } finally {
    document.getElementById("startAssetDownload").disabled=false;
    document.getElementById("cancelAssetDownload").disabled=true;
  }
}
async function getModelIndex(){try{const hit=await caches.match(MODEL_INDEX_URL);return hit?await hit.json():[];}catch(e){return [];}}
async function showStored(){
  const list=document.getElementById("storedAssets"); if(!list)return; list.replaceChildren();
  try{
    const cache=await caches.open(CACHE_NAME);const requests=await cache.keys();
    if(!requests.length){const li=document.createElement("li");li.textContent="Ainda não há arquivos guardados.";list.append(li);return;}
    for(const req of requests){const li=document.createElement("li");const u=new URL(req.url);li.textContent=u.pathname.split("/").pop()||u.hostname;li.title=req.url;list.append(li);}
  }catch(e){const li=document.createElement("li");li.textContent="Não foi possível consultar o cache.";list.append(li);}
}
async function getStoredModels(){
  const cache=await caches.open(CACHE_NAME), meta=readMeta();
  return meta.filter(x=>x.type==="models" && /\.glb(?:\?|$)/i.test(x.url)).filter(x=>true);
}
window.GreyEyesAssetDownloader={run:runDownload,showStored,cancel:()=>{cancelRequested=true;},getStoredModels,cacheName:CACHE_NAME};
})();
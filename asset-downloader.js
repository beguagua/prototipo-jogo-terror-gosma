(() => {
"use strict";
const API = "https://api.polyhaven.com";
const CACHE_NAME = "grey-eyes-content-v2";
const META_KEY = "grey-eyes-downloaded-assets-v2";
const MODEL_INDEX_KEY = "grey-eyes-model-index-v2";
const MAX_FILE_BYTES = 80 * 1024 * 1024;
const MAX_TOTAL_BYTES = 120 * 1024 * 1024;
let cancelRequested = false;
const statusEl = () => document.getElementById("assetDownloadStatus");
const detailsEl = () => document.getElementById("assetDownloadDetails");
const barEl = () => document.getElementById("assetDownloadBar");
const startEl = () => document.getElementById("startAssetDownload");
const fmt = n => n < 1024 ? `${n} B` : n < 1048576 ? `${(n/1024).toFixed(1)} KB` : `${(n/1048576).toFixed(1)} MB`;
function say(message, detail="") { if(statusEl()) statusEl().textContent=message; if(detailsEl()) detailsEl().textContent=detail; }
function readMeta(){try{return JSON.parse(localStorage.getItem(META_KEY)||"[]");}catch(_){return [];}}
function writeMeta(items){try{localStorage.setItem(META_KEY,JSON.stringify(items));}catch(e){throw new Error("O navegador bloqueou o armazenamento local. Abra o jogo por HTTPS e permita dados do site.");}}
function walkFiles(node, path="", out=[]) {
  if (!node || typeof node !== "object") return out;
  if (typeof node.url === "string" && Number.isFinite(Number(node.size))) { out.push({url:node.url,size:Number(node.size)||0,path,md5:node.md5||""}); return out; }
  for (const [key,value] of Object.entries(node)) walkFiles(value, path ? `${path}/${key}` : key, out);
  return out;
}
async function json(url) {
  const res=await fetch(url,{mode:"cors",cache:"no-store"});
  if(!res.ok) throw new Error(`Servidor de recursos respondeu HTTP ${res.status}.`);
  return res.json();
}
async function searchAssets(query,type,limit=5) {
  const data=await json(`${API}/search?q=${encodeURIComponent(query)}&t=${encodeURIComponent(type)}&limit=${limit}`);
  if(!Array.isArray(data.results)) throw new Error("A API de recursos retornou um formato inesperado.");
  return data.results.map(x=>x.slug).filter(Boolean);
}
function pickTextureFiles(files) {
  const images=files.filter(f=>f.size>0 && f.size<MAX_FILE_BYTES && /\.(jpg|jpeg|png|webp|exr|hdr)(\?|$)/i.test(f.url));
  const preferred=images.filter(f=>/(1k|2k)/i.test(f.path+" "+f.url));
  const candidates=(preferred.length?preferred:images).sort((a,b)=>a.size-b.size);
  const chosen=[]; let total=0;
  for(const f of candidates){ if(chosen.length>=4) break; if(total+f.size>35*1024*1024) continue; chosen.push(f); total+=f.size; }
  return chosen;
}
function pickModelFiles(files) {
  const usable=files.filter(f=>f.size>0 && f.size<MAX_FILE_BYTES && !/\.blend1?(\?|$)/i.test(f.url));
  // A standalone GLB is the safest format for browser loading.
  const glbs=usable.filter(f=>/\.glb(\?|$)/i.test(f.url));
  if(glbs.length) return [glbs.sort((a,b)=>a.size-b.size)[0]];
  // Poly Haven commonly supplies glTF plus .bin/images. Download the complete same-folder glTF bundle.
  const gltfs=usable.filter(f=>/\.gltf(\?|$)/i.test(f.url)).sort((a,b)=>a.size-b.size);
  if(!gltfs.length) return [];
  const main=gltfs[0];
  const dir=main.path.includes("/")?main.path.slice(0,main.path.lastIndexOf("/")):"";
  return usable.filter(f=>{
    const fdir=f.path.includes("/")?f.path.slice(0,f.path.lastIndexOf("/")):"";
    return fdir===dir && (/\.(gltf|bin|png|jpe?g|webp|ktx2)(\?|$)/i.test(f.url));
  });
}
async function prepareQueries(pack) {
  if(pack==="textures") return [{q:"cracked asphalt",type:"textures"},{q:"dirty concrete wall",type:"textures"}];
  if(pack==="models") return [{q:"abandoned car",type:"models"},{q:"street lamp",type:"models"},{q:"industrial barrel",type:"models"}];
  return [{q:"cracked asphalt",type:"textures"},{q:"dirty concrete wall",type:"textures"},{q:"abandoned car",type:"models"}];
}
async function runDownload() {
  if(!window.isSecureContext || !("caches" in window)) {
    say("DOWNLOAD NÃO INICIADO: o jogo está aberto no modo arquivo.","No iPad, o jogo precisa estar hospedado em HTTPS. Abrir index.html pelo app Arquivos/ZIP não permite armazenamento persistente. Hospede o projeto e abra o endereço https://…"); return;
  }
  if(!navigator.onLine){say("Sem internet — nenhum arquivo foi baixado.","Conecte-se à internet e tente novamente.");return;}
  cancelRequested=false;
  if(startEl()) startEl().disabled=true;
  const cancelEl=document.getElementById("cancelAssetDownload"); if(cancelEl) cancelEl.disabled=false;
  if(barEl()) barEl().style.width="0%";
  let done=0,totalBytes=0; const errors=[];
  try {
    say("Testando conexão com o catálogo…","Conectando à API pública do Poly Haven.");
    await json(`${API}/types`);
    const pack=document.getElementById("downloadPack")?.value||"starter";
    const queries=await prepareQueries(pack), queue=[];
    for(let i=0;i<queries.length;i++){
      if(cancelRequested) throw new Error("Download cancelado.");
      const q=queries[i]; say(`Buscando ${q.type}: ${q.q}…`,`${i+1}/${queries.length} consultas no catálogo.`);
      const slugs=await searchAssets(q.q,q.type,5);
      let found=false;
      for(const slug of slugs){
        try {
          const tree=await json(`${API}/files/${encodeURIComponent(slug)}`);
          const all=walkFiles(tree);
          const selected=q.type==="models"?pickModelFiles(all):pickTextureFiles(all);
          if(selected.length){selected.forEach(f=>queue.push({...f,slug,type:q.type}));found=true;break;}
        } catch(e){errors.push(`${slug}: ${e.message}`);}
      }
      if(!found) errors.push(`Nenhum arquivo direto compatível para ${q.q}.`);
    }
    const unique=[...new Map(queue.map(f=>[f.url,f])).values()];
    const limited=[];let estimate=0;
    for(const f of unique){if(estimate+f.size<=MAX_TOTAL_BYTES){limited.push(f);estimate+=f.size;}}
    if(!limited.length) throw new Error("A busca terminou, mas não encontrou arquivos baixáveis compatíveis. Veja os detalhes abaixo.");
    const cache=await caches.open(CACHE_NAME);
    say(`Encontrados ${limited.length} arquivo(s).`, `Tamanho estimado: ${fmt(estimate)}. Iniciando transferência…`);
    for(let i=0;i<limited.length;i++){
      if(cancelRequested) throw new Error("Download cancelado pelo usuário.");
      const f=limited[i]; say(`Baixando ${i+1}/${limited.length}: ${f.slug}`,`${fmt(f.size)} • ${f.path}`);
      let response;
      try { response=await fetch(f.url,{mode:"cors",cache:"no-store"}); }
      catch(e){throw new Error(`O servidor bloqueou o download do arquivo ${f.slug}. Tente novamente por HTTPS ou outra rede.`);}
      if(!response.ok || response.type==="opaque") throw new Error(`O servidor não permitiu baixar ${f.slug} (HTTP ${response.status||"bloqueado"}).`);
      const actual=Number(response.headers.get("content-length"))||f.size;
      if(actual>MAX_FILE_BYTES) throw new Error(`Arquivo grande demais para o limite seguro: ${f.slug}.`);
      await cache.put(f.url,response.clone());
      const meta=readMeta();
      if(!meta.some(x=>x.url===f.url)) meta.push({url:f.url,slug:f.slug,type:f.type,path:f.path||"",size:f.size,contentType:response.headers.get("content-type")||""});
      writeMeta(meta);
      if(f.type==="models" && /\.(glb|gltf)(\?|$)/i.test(f.url)) {
        const models=meta.filter(x=>x.type==="models" && /\.(glb|gltf)(\?|$)/i.test(x.url));
        const payload=new Response(JSON.stringify(models),{headers:{"Content-Type":"application/json"}});
        await cache.put(new URL("./__greyeyes_model_index__.json",location.href).href,payload);
      }
      totalBytes+=f.size;done++;
      if(barEl()) barEl().style.width=`${Math.round(done/limited.length*100)}%`;
    }
    say(`Concluído: ${done} arquivo(s) guardados.`,`${fmt(totalBytes)} estimados. Agora toque em “CARREGAR MODELOS NO CENÁRIO 3D” para inserir os modelos baixados.`);
    await showStored();
    window.dispatchEvent(new CustomEvent("greyeyes-assets-updated"));
  } catch(e) {
    say(e.message||"O download falhou.",errors.length?`Detalhes: ${errors.slice(0,4).join(" • ")}`:"Confira se o projeto está em HTTPS, se há espaço livre e se a rede permite acessar Poly Haven.");
  } finally {
    if(startEl()) startEl().disabled=false;
    if(cancelEl) cancelEl.disabled=true;
  }
}
async function showStored(){
  const list=document.getElementById("storedAssets");if(!list)return;list.replaceChildren();
  try{
    const cache=await caches.open(CACHE_NAME), requests=await cache.keys();
    if(!requests.length){const li=document.createElement("li");li.textContent="Nenhum arquivo encontrado no armazenamento do jogo.";list.append(li);return;}
    for(const req of requests){const li=document.createElement("li");const u=new URL(req.url);li.textContent=u.pathname.split("/").pop()||u.hostname;li.title=req.url;list.append(li);}
  }catch(e){const li=document.createElement("li");li.textContent="Não foi possível ler o cache. Abra por HTTPS.";list.append(li);}
}
async function getStoredModels(){
  const meta=readMeta();
  return meta.filter(x=>x.type==="models" && /\.(glb|gltf)(\?|$)/i.test(x.url));
}
window.GreyEyesAssetDownloader={run:runDownload,showStored,getStoredModels,cancel:()=>{cancelRequested=true;},cacheName:CACHE_NAME};
})();

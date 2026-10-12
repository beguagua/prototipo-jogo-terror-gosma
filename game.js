(() => {
"use strict";
const canvas = document.getElementById("renderCanvas");
const loading = document.getElementById("loading"), loadBar = document.getElementById("loadBar"), loadText = document.getElementById("loadText");
const hud = document.getElementById("hud"), menu = document.getElementById("menu"), toastEl = document.getElementById("toast");
if (!window.BABYLON) { loadText.textContent = "Babylon.js não carregou. Confira a conexão e recarregue."; return; }
const engine = new BABYLON.Engine(canvas, true, {preserveDrawingBuffer:false, stencil:false, antialias:false, powerPreference:"high-performance"});
engine.setHardwareScalingLevel(1.15);
let scene, camera, player, groundMat, time=0, paused=false, running=false, quality="medium", viewDistance=2;
const loadedChunks = new Map(), chunkSize=48, chunkRadius=2, input={x:0,z:0}, keys={};
const importedAssets=new Map(); let importedModels=[];
const materials = {};
function mat(name,color,rough=.9){let m=new BABYLON.StandardMaterial(name,scene);m.diffuseColor=BABYLON.Color3.FromHexString(color);m.specularColor=new BABYLON.Color3(.08,.08,.08);m.roughness=rough;materials[name]=m;return m;}
function box(name,x,y,z,sx,sy,sz,material,parent=null){const m=BABYLON.MeshBuilder.CreateBox(name,{width:sx,height:sy,depth:sz},scene);m.position.set(x,y,z);m.material=material;if(parent)m.parent=parent;return m;}
function makeBuilding(root,x,z,seed){
 const wall=[materials.wall1,materials.wall2,materials.wall3][seed%3];
 const w=7+(seed%3)*1.5,d=7+((seed+1)%3)*1.2,h=5+(seed%4)*.7;
 box("house",x,h/2,z,w,h,d,wall,root);
 const roof=box("roof",x,h+.35,z,w+0.6,.5,d+0.6,materials.roof,root); roof.rotation.z=(seed%2?-.06:.06);
 box("door",x-w*.12,1.1,z+d/2+.025,.9,2.2,.08,materials.door,root);
 for(let row=0;row<2;row++)for(let col=0;col<2;col++){
  let wx=x-w*.3+col*w*.42, wy=2.2+row*1.6;
  box("window",wx,wy,z+d/2+.035,1.05,.9,.07,materials.glass,root);
  box("windowframe",wx,wy,z+d/2+.08,1.15,1,.06,materials.frame,root);
 }
}
function createChunk(cx,cz){
 const key=`${cx},${cz}`; if(loadedChunks.has(key))return;
 const root=new BABYLON.TransformNode("chunk_"+key,scene); root.metadata={cx,cz};
 const ox=cx*chunkSize, oz=cz*chunkSize;
 // Road cross and sidewalks
 box("road",ox,0,oz,chunkSize,.12,chunkSize,materials.asphalt,root);
 box("sidewalkN",ox,.08,oz-18,chunkSize,.16,5,materials.concrete,root);
 box("sidewalkS",ox,.08,oz+18,chunkSize,.16,5,materials.concrete,root);
 box("sidewalkE",ox+18,.08,oz,5,.16,chunkSize,materials.concrete,root);
 box("sidewalkW",ox-18,.08,oz,5,.16,chunkSize,materials.concrete,root);
 // Faded lane marking
 for(let i=-2;i<=2;i++) box("lane",ox+i*7,.07,oz,.14,.02,chunkSize,materials.line,root);
 const seed=Math.abs((cx*73856093)^(cz*19349663))%1000;
 for(let i=0;i<5;i++){
  const side=i%2===0?-1:1;
  const bx=ox+side*(11+(i%3)*2), bz=oz-18+(i*9);
  if(i===0 && cx===0 && cz===0) continue;
  makeBuilding(root,bx,bz,(seed+i*7)%99);
 }
 // street light / trees / abandoned car proxies
 for(let i=0;i<3;i++){
  const tx=ox+(i-1)*14, tz=oz+(i%2?15:-15);
  box("lampPole",tx,2.4,tz,.16,4.8,.16,materials.metal,root);
  box("lampHead",tx,4.85,tz,.7,.18,.35,materials.lamp,root);
 }
 if(seed%3!==0){
  const car=box("abandonedCar",ox+5,.7,oz+6,2,1.25,4,materials.car,root);
  car.rotation.y=(seed%4)*.35;
  for(const dx of [-.8,.8])for(const dz of [-1.2,1.2]){
   const wheel=BABYLON.MeshBuilder.CreateCylinder("wheel",{diameter:.58,height:.2,tessellation:10},scene);
   wheel.rotation.z=Math.PI/2;wheel.position.set(car.position.x+dx,.38,car.position.z+dz);wheel.material=materials.tire;wheel.parent=root;
  }
 }
 loadedChunks.set(key,root);
}
function updateChunks(){
 const cx=Math.round(player.position.x/chunkSize), cz=Math.round(player.position.z/chunkSize);
 const radius=viewDistance===1?1:viewDistance===2?2:3;
 for(let x=cx-radius;x<=cx+radius;x++)for(let z=cz-radius;z<=cz+radius;z++)createChunk(x,z);
 for(const [key,root] of loadedChunks){const [x,z]=key.split(",").map(Number);if(Math.abs(x-cx)>radius+1||Math.abs(z-cz)>radius+1){root.getChildMeshes().forEach(m=>m.dispose());root.dispose();loadedChunks.delete(key);}}
}
async function integrateDownloadedModels(){
 if(!scene || !window.GreyEyesAssetDownloader || !BABYLON.SceneLoader) return;
 try{
  const models=await window.GreyEyesAssetDownloader.getStoredModels();
  if(!models.length){toast("Nenhum modelo 3D guardado. Baixe primeiro um pacote de modelos.");return;}
  let placed=0;
  const placements=[{x:8,z:12},{x:-8,z:12},{x:8,z:24},{x:-8,z:24},{x:14,z:-10},{x:-14,z:-10}];
  for(const item of models){
   if(placed>=placements.length) break;
   const nodeName="downloaded-root-"+placed;
   if(scene.getTransformNodeByName(nodeName)) { placed++; continue; }
   try{
    const ext=/\.gltf(\?|$)/i.test(item.url)?".gltf":".glb";
    // Load the original URL rather than a blob URL. This preserves relative glTF .bin/texture paths;
    // the service worker can serve previously cached files when the site is controlled by it.
    const container=await BABYLON.SceneLoader.LoadAssetContainerAsync("",item.url,scene,undefined,ext);
    const root=new BABYLON.TransformNode(nodeName,scene);
    container.addAllToScene();
    const meshes=container.meshes.filter(m=>m.getTotalVertices && m.getTotalVertices()>0);
    if(!meshes.length){container.removeAllFromScene();container.dispose();root.dispose();continue;}
    for(const mesh of meshes){if(!mesh.parent)mesh.parent=root;}
    const place=placements[placed];root.position.set(place.x,0,place.z);
    scene.updateTransformMatrix(true);
    let min=new BABYLON.Vector3(Infinity,Infinity,Infinity),max=new BABYLON.Vector3(-Infinity,-Infinity,-Infinity);
    for(const mesh of meshes){mesh.computeWorldMatrix(true);const b=mesh.getBoundingInfo().boundingBox;min=BABYLON.Vector3.Minimize(min,b.minimumWorld);max=BABYLON.Vector3.Maximize(max,b.maximumWorld);}
    const size=max.subtract(min),largest=Math.max(size.x,size.y,size.z);
    if(Number.isFinite(largest)&&largest>0) root.scaling.setAll(Math.min(4,Math.max(.15,3.5/largest)));
    root.metadata={downloadedAsset:true,source:item.url,assetName:item.slug};
    placed++;
   }catch(err){console.warn("Falha ao integrar modelo",item.url,err);}
  }
  if(placed) toast(`${placed} modelo(s) do catálogo conectado(s) ao cenário 3D.`);
  else toast("Não foi possível carregar os modelos. Verifique se o pacote contém GLB/glTF compatível.");
 }catch(err){console.warn("Integração de assets indisponível",err);toast("Erro ao consultar os modelos baixados. Abra o jogo por HTTPS e tente novamente.");}
}
function createScene(){
 scene=new BABYLON.Scene(engine);scene.clearColor=new BABYLON.Color4(.38,.46,.51,1);scene.fogMode=BABYLON.Scene.FOGMODE_EXP2;scene.fogDensity=.004;scene.fogColor=new BABYLON.Color3(.38,.46,.51);
 const light=new BABYLON.HemisphericLight("sky",new BABYLON.Vector3(0,1,0),scene);light.intensity=.82;
 const sun=new BABYLON.DirectionalLight("sun",new BABYLON.Vector3(-.5,-1,.3),scene);sun.position=new BABYLON.Vector3(20,40,-20);sun.intensity=.55;
 mat("wall1","#827f79");mat("wall2","#706e69");mat("wall3","#938c81");mat("roof","#383d42");mat("door","#40332b");mat("glass","#263d48",.25);mat("frame","#b6b2a7");mat("asphalt","#292e31");mat("concrete","#64696b");mat("line","#8b8a7e");mat("metal","#30383c");mat("lamp","#d7d3a6");mat("car","#4a5558");mat("tire","#171a1c");
 const ground=BABYLON.MeshBuilder.CreateGround("ground",{width:2000,height:2000},scene);ground.position.y=-.14;ground.material=materials.asphalt;
 camera=new BABYLON.UniversalCamera("playerCamera",new BABYLON.Vector3(0,1.7,-4),scene);camera.attachControl(canvas,true);camera.minZ=.1;camera.fov=1.05;camera.angularSensibility=3500;camera.speed=.22;camera.inertia=.6;
 camera.keysUp=[87,38];camera.keysDown=[83,40];camera.keysLeft=[65,37];camera.keysRight=[68,39];camera.applyGravity=false;camera.checkCollisions=false;
 player=camera;player.position.set(0,1.7,0);
 // Basic interaction clues are simple markers until real assets are integrated.
 const clueMat=mat("clue","#a4c4c9",.3);
 const clue=BABYLON.MeshBuilder.CreateSphere("clue",{diameter:.35,segments:10},scene);clue.position.set(4,.5,7);clue.material=clueMat;clue.metadata={clue:true};
 const beacon=box("targetBeacon",4,.2,7,.6,.1,.6,materials.lamp);beacon.metadata={clue:true};
 updateChunks();
 scene.onBeforeRenderObservable.add(()=>{
  const dt=Math.min(engine.getDeltaTime()/16.67,2);time+=dt;
  let ix=input.x, iz=input.z;
  if(keys.KeyW||keys.ArrowUp)iz+=1;if(keys.KeyS||keys.ArrowDown)iz-=1;if(keys.KeyA||keys.ArrowLeft)ix-=1;if(keys.KeyD||keys.ArrowRight)ix+=1;
  const len=Math.hypot(ix,iz)||1;ix/=len;iz/=len;
  const speed=(running?0.22:0.13)*dt;
  const forward=camera.getDirection(BABYLON.Axis.Z), right=camera.getDirection(BABYLON.Axis.X);
  player.position.addInPlace(forward.scale(iz*speed));player.position.addInPlace(right.scale(ix*speed));
  player.position.y=1.7;
  updateChunks();
  clue.rotation.y+=.01*dt;clue.position.y=.5+Math.sin(time*.08)*.12;
 });
 return scene;
}
function toast(s){toastEl.textContent=s;toastEl.style.opacity="1";clearTimeout(toast._t);toast._t=setTimeout(()=>toastEl.style.opacity="0",2400);}
function setQuality(q){quality=q;engine.setHardwareScalingLevel(q==="low"?1.7:q==="high"?.8:1.15);scene.fogDensity=q==="low"?.006:q==="high"?.0028:.004;toast("Qualidade: "+({low:"Baixa",medium:"Média",high:"Alta"}[q]));}
function bindControls(){
 document.addEventListener("keydown",e=>{keys[e.code]=true;if(["Space","ArrowUp","ArrowDown","ArrowLeft","ArrowRight"].includes(e.code))e.preventDefault();if(e.code==="Escape")toggleMenu();});
 document.addEventListener("keyup",e=>keys[e.code]=false);
 document.getElementById("run").addEventListener("pointerdown",()=>running=true);["pointerup","pointercancel","pointerleave"].forEach(ev=>document.getElementById("run").addEventListener(ev,()=>running=false));
 document.getElementById("attack").addEventListener("click",()=>toast("Ainda não há combate nesta versão. Próxima etapa: arma e IA."));
 document.getElementById("interact").addEventListener("click",()=>{if(BABYLON.Vector3.Distance(player.position,new BABYLON.Vector3(4,1.7,7))<4){toast("Pista encontrada: marcas cinzentas perto da janela.");document.getElementById("mission").textContent="Pista encontrada. Investigue a casa do outro lado da rua.";}else toast("Aproxime-se do objeto brilhante para investigar.");});
 document.getElementById("menuBtn").addEventListener("click",toggleMenu);document.getElementById("resume").addEventListener("click",toggleMenu);
 document.getElementById("quality").addEventListener("change",e=>setQuality(e.target.value));
 document.getElementById("viewDistance").addEventListener("change",e=>{viewDistance=+e.target.value;updateChunks();});
 document.getElementById("assetInfo").addEventListener("click",()=>{const p=document.getElementById("assetPanel");p.hidden=!p.hidden;});
 document.getElementById("downloadAssets").addEventListener("click",()=>{const p=document.getElementById("assetPanel");p.hidden=!p.hidden;});
 document.getElementById("startAssetDownload").addEventListener("click",()=>window.GreyEyesAssetDownloader?.run());
 document.getElementById("cancelAssetDownload").addEventListener("click",()=>{if(window.GreyEyesAssetDownloader){window.GreyEyesAssetDownloader.cancel?.();}toast("O cancelamento será aplicado ao terminar o arquivo atual.");});
 document.getElementById("showStoredAssets").addEventListener("click",()=>window.GreyEyesAssetDownloader?.showStored());
 document.getElementById("integrateAssets")?.addEventListener("click",()=>integrateDownloadedModels());
 const stick=document.getElementById("stick"),nub=document.getElementById("stickNub");let pointer=null;
 function moveStick(e){const r=stick.getBoundingClientRect(),cx=r.left+r.width/2,cy=r.top+r.height/2;let dx=e.clientX-cx,dy=e.clientY-cy;const max=r.width*.34,len=Math.hypot(dx,dy)||1;if(len>max){dx=dx/len*max;dy=dy/len*max;}nub.style.left=(r.width/2-22+dx)+"px";nub.style.top=(r.height/2-22+dy)+"px";input.x=dx/max;input.z=-dy/max;}
 stick.addEventListener("pointerdown",e=>{pointer=e.pointerId;stick.setPointerCapture(pointer);moveStick(e);});
 stick.addEventListener("pointermove",e=>{if(pointer===e.pointerId)moveStick(e);});
 function endStick(){pointer=null;input.x=input.z=0;nub.style.left="32px";nub.style.top="32px";}
 stick.addEventListener("pointerup",endStick);stick.addEventListener("pointercancel",endStick);
 // Touch-look: drag on the right half of screen, excluding buttons.
 let look=null;
 canvas.addEventListener("pointerdown",e=>{if(e.pointerType==="touch"&&e.clientX>innerWidth*.42){look={x:e.clientX,y:e.clientY,id:e.pointerId};canvas.setPointerCapture(e.pointerId);}});
 canvas.addEventListener("pointermove",e=>{if(!look||e.pointerId!==look.id)return;const dx=e.clientX-look.x,dy=e.clientY-look.y;camera.rotation.y+=dx*.004;camera.rotation.x+=dy*.003;camera.rotation.x=Math.max(-1.25,Math.min(1.25,camera.rotation.x));look.x=e.clientX;look.y=e.clientY;});
 canvas.addEventListener("pointerup",()=>look=null);canvas.addEventListener("pointercancel",()=>look=null);
}
function toggleMenu(){paused=!paused;menu.hidden=!paused;hud.hidden=paused;if(paused)running=false;}
async function start(){
 try{
  loadText.textContent="Criando iluminação, materiais e primeiro setor...";
  scene=createScene();bindControls();hud.hidden=false;
  window.addEventListener("greyeyes-assets-updated",()=>integrateDownloadedModels());
  await new Promise(r=>setTimeout(r,200));loadBar.style.width="100%";loadText.textContent="Pronto — cidade procedural carregada.";
  await new Promise(r=>setTimeout(r,350));loading.hidden=true;
  engine.runRenderLoop(()=>{if(scene&&!paused)scene.render();});
  setInterval(()=>{document.getElementById("fps").textContent=Math.round(engine.getFps())+" FPS";},500);
  window.addEventListener("resize",()=>engine.resize());
  if("serviceWorker" in navigator && (location.protocol==="https:"||location.hostname==="localhost"))navigator.serviceWorker.register("./service-worker.js").catch(()=>{});
 }catch(err){console.error(err);loadText.textContent="Erro ao iniciar: "+err.message;}
}
start();
})();
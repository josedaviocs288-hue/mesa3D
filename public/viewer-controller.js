import {browserCapabilities} from './ar-capabilities.js';

export function createViewerController({viewer,photo,feedback,retryButton,arButton,quickLookLink,detectCapabilities=browserCapabilities,setTimer=setTimeout,clearTimer=clearTimeout}){
 let selected,assets,currentUrl='',loaded=false,failed=false,dead=false,timer,revision=0,caps;
 const listeners=[];
 const on=(el,name,fn)=>{el.addEventListener(name,fn);listeners.push(()=>el.removeEventListener(name,fn));};
 const clear=()=>{if(timer!==undefined)clearTimer(timer);timer=undefined;};
 const say=text=>{feedback.textContent=text;};
 const showPhoto=()=>{photo.hidden=false;loaded=false;arButton.disabled=true;};
 const fail=message=>{clear();failed=true;showPhoto();retryButton.hidden=false;say(message);};
 function start(url){
  clear();loaded=false;failed=false;showPhoto();retryButton.hidden=true;viewer.hidden=false;
  currentUrl=url;viewer.src=url;
  say('Carregando 3D… A foto permanece disponível.');
  const token=revision;
  timer=setTimer(()=>{if(!dead&&token===revision&&!loaded)fail('O 3D está demorando. Você pode tentar novamente.');},25000);
 }
 function select(portion){
  if(dead)return;
  revision++;clear();selected=portion;currentUrl='';loaded=false;failed=false;caps=detectCapabilities();
  viewer.removeAttribute('src');viewer.removeAttribute('ios-src');viewer.hidden=true;showPhoto();retryButton.hidden=true;quickLookLink.hidden=true;quickLookLink.removeAttribute('href');
  assets=portion.assets||{originalUrl:portion.modelUrl,posterUrl:portion.photos?.[0]};
  const image=photo.querySelector?.('img');if(image)image.src=assets.posterUrl||'/assets/placeholder.svg';
  arButton.textContent='Abrir na câmera ↗';
  if(portion.modelStatus!=='ready'||!assets.originalUrl){say('Esta porção está disponível em foto. Ainda não tem modelo 3D aprovado.');return;}
  if(caps.apple&&assets.iosUrl&&/^\/media\/[\w-]+\.usdz$/.test(assets.iosUrl)){
   quickLookLink.href=assets.iosUrl+'#allowsContentScaling=0';quickLookLink.hidden=false;
   viewer.setAttribute('ios-src',assets.iosUrl);
  }
  if(!caps.webgl){say('O 3D não está disponível neste navegador. A foto continua disponível.');retryButton.hidden=false;return;}
  start(assets.webUrl||assets.originalUrl);
 }
 function retry(){if(dead||!selected||!assets.originalUrl)return;caps=detectCapabilities();if(!caps.webgl){say('O navegador ainda não oferece suporte ao 3D. A foto continua disponível.');return;}start(failed?assets.originalUrl:(assets.webUrl||assets.originalUrl));}
 function launchAr(){
  if(dead||!loaded)return;
  if(!caps.secure){say('A câmera AR exige HTTPS. Abra um endereço seguro no celular.');return;}
  if(!viewer.canActivateAR){say('AR indisponível neste aparelho. Explore o prato em 3D nesta página.');return;}
  const token=revision;
  say('Tentando abrir AR. Aponte para uma mesa iluminada.');
  try{Promise.resolve(viewer.activateAR()).catch(()=>{if(!dead&&token===revision)say('Não foi possível abrir AR. Você pode continuar no 3D.');});}
  catch{say('Não foi possível abrir AR. Você pode continuar no 3D.');}
 }
 on(viewer,'load',event=>{
  if(dead||!currentUrl||!event.detail?.url)return;
  if(new URL(event.detail.url,caps.origin).href!==new URL(currentUrl,caps.origin).href)return;
  clear();loaded=true;failed=false;photo.hidden=true;arButton.disabled=false;retryButton.hidden=true;
  say(selected.demo?'Demonstração ilustrativa. Confira a escala no aparelho real.':'3D pronto. Explore o prato ou abra AR em um celular compatível.');
 });
 on(viewer,'progress',event=>{if(!loaded&&!failed&&currentUrl){const value=Number(event.detail?.totalProgress);if(Number.isFinite(value))say(`Carregando 3D: ${Math.round(Math.max(0,Math.min(1,value))*100)}%.`);}});
 on(viewer,'error',()=>{if(currentUrl)fail('O modelo 3D não carregou. A foto continua disponível. Tente novamente.');});
 on(viewer,'webglcontextlost',()=>fail('A visualização 3D foi interrompida. Tente novamente.'));
 on(viewer,'ar-status',event=>{if(event.detail?.status==='object-placed')say('Prato posicionado. Caminhe ao redor para observar.');if(event.detail?.status==='failed')say('AR não iniciou. A visualização 3D continua disponível.');});
 on(viewer,'ar-tracking',event=>{if(event.detail?.status==='not-tracking')say('Rastreamento perdido. Aponte para uma mesa iluminada com textura.');});
 on(arButton,'click',launchAr);on(retryButton,'click',retry);
 return {select,retry,launchAr,destroy(){dead=true;revision++;clear();listeners.forEach(fn=>fn());viewer.removeAttribute('src');}};
}

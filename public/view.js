import {createViewerController} from './viewer-controller.js';
import {browserCapabilities} from './ar-capabilities.js';
import {ensureViewerLibrary} from './viewer-library.js';
import {api,money,escapeHtml,toast,portionPhoto,publicUrl} from './common.js';

const $=id=>document.getElementById(id);
const params=new URLSearchParams(location.search);
let restaurant,dish,selected,controller,viewerReady=false,libraryLoading=false;

async function loadViewer(){
  if(viewerReady||libraryLoading)return;
  libraryLoading=true;
  $('viewerFeedback').textContent='Carregando visualizador 3D. A foto permanece disponível.';
  try{
    const Viewer=await ensureViewerLibrary();
    Viewer.dracoDecoderLocation='/decoders/draco/';viewerReady=true;
    controller.select(selected);renderComparison();
  }catch{
    $('viewerFeedback').textContent='O visualizador 3D não carregou. A foto permanece disponível; tente novamente.';
    $('retryModel').hidden=false;
  }finally{libraryLoading=false;}
}

async function init(){
  try{
    controller=createViewerController({viewer:$('mainModel'),photo:$('photoPreview'),feedback:$('viewerFeedback'),retryButton:$('retryModel'),arButton:$('launchAR'),quickLookLink:$('quickLook'),detectCapabilities:()=>{const caps=browserCapabilities();return {...caps,webgl:viewerReady&&caps.webgl};}});
    $('retryModel').addEventListener('click',()=>{if(!viewerReady)loadViewer()});
    const state=await api(`/api/state${params.get('loja')?'?loja='+encodeURIComponent(params.get('loja')):''}`);restaurant=state.restaurant;
    dish=state.dishes.find(x=>x.id===params.get('id')&&x.published);
    if(!dish || (params.get('loja')&&params.get('loja')!==restaurant.slug))throw new Error('Prato não encontrado neste cardápio.');
    selected=dish.portions.find(x=>x.id===params.get('porcao'))||dish.portions[0];
    $('viewRestaurant').textContent=restaurant.name;$('viewName').textContent=dish.name;$('viewDescription').textContent=dish.description;
    $('viewerBack').href=publicUrl(restaurant.slug);$('backToDish').href=publicUrl(restaurant.slug);
    document.title=`${dish.name} · Veja em 3D`;
    render();loadViewer();
  }catch(e){$('viewerFeedback').textContent=e.message;toast(e.message)}
}
function render(){
  $('portionOptions').innerHTML=dish.portions.map(p=>`<button class="portion-pill ${p.id===selected.id?'active':''}" data-portion="${escapeHtml(p.id)}"><strong>${escapeHtml(p.label)} · ${p.grams} g</strong><small>${money(p.price)}</small></button>`).join('');
  $('measureWeight').textContent=`${selected.grams} g`;
  $('measureWidth').textContent=`${selected.dimensions.width} cm`;
  $('measureDepth').textContent=`${selected.dimensions.depth} cm`;
  $('measureHeight').textContent=`${selected.dimensions.height} cm`;
  $('viewStatus').textContent=selected.modelStatus==='ready'?'ESCALA CADASTRADA':'APENAS FOTO';
  controller.select(selected);
}
function renderComparison(){
  if(!viewerReady)return;
  const ready=dish.portions.filter(p=>p.modelUrl&&p.modelStatus==='ready');
  $('comparison').hidden=ready.length<2;
  if(ready.length<2)return;
  $('compareGrid').innerHTML=ready.slice(0,2).map(p=>`<div class="compare-card"><model-viewer src="${escapeHtml(p.modelUrl)}" loading="lazy" interaction-prompt="none" camera-controls camera-orbit="25deg 70deg 0.58m" camera-target="0m 0.07m 0m" field-of-view="32deg" min-camera-orbit="auto auto 0.58m" max-camera-orbit="auto auto 0.58m" shadow-intensity=".6" exposure="1.05" environment-image="neutral" alt="${escapeHtml(dish.name)} em ${p.grams} gramas"></model-viewer><div class="compare-card-footer"><strong>${escapeHtml(p.label)} · ${p.grams} g</strong><span>${p.dimensions.width} × ${p.dimensions.depth} × ${p.dimensions.height} cm</span></div></div>`).join('');
}
document.addEventListener('click',event=>{
  const button=event.target.closest('[data-portion]');
  if(button){selected=dish.portions.find(p=>p.id===button.dataset.portion);render();const url=new URL(location.href);url.searchParams.set('porcao',selected.id);history.replaceState(null,'',url)}
});
window.addEventListener('pagehide',event=>{if(!event.persisted)controller?.destroy()});
init();

import {api,money,escapeHtml,toast,portionPhoto,publicUrl} from './common.js';

const $=id=>document.getElementById(id);
const params=new URLSearchParams(location.search);
let restaurant,dish,selected,modelLoaded=false;

async function init(){
  try{
    const state=await api(`/api/state${params.get('loja')?'?loja='+encodeURIComponent(params.get('loja')):''}`);restaurant=state.restaurant;
    dish=state.dishes.find(x=>x.id===params.get('id')&&x.published);
    if(!dish || (params.get('loja')&&params.get('loja')!==restaurant.slug))throw new Error('Prato não encontrado neste cardápio.');
    selected=dish.portions.find(x=>x.id===params.get('porcao'))||dish.portions[0];
    $('viewRestaurant').textContent=restaurant.name;$('viewName').textContent=dish.name;$('viewDescription').textContent=dish.description;
    $('viewerBack').href=publicUrl(restaurant.slug);$('backToDish').href=publicUrl(restaurant.slug);
    document.title=`${dish.name} · Veja em 3D`;
    render();renderComparison();
  }catch(e){$('viewerFeedback').textContent=e.message;toast(e.message)}
}
function render(){
  $('portionOptions').innerHTML=dish.portions.map(p=>`<button class="portion-pill ${p.id===selected.id?'active':''}" data-portion="${escapeHtml(p.id)}"><strong>${escapeHtml(p.label)} · ${p.grams} g</strong><small>${money(p.price)}</small></button>`).join('');
  $('measureWeight').textContent=`${selected.grams} g`;
  $('measureWidth').textContent=`${selected.dimensions.width} cm`;
  $('measureDepth').textContent=`${selected.dimensions.depth} cm`;
  $('measureHeight').textContent=`${selected.dimensions.height} cm`;
  const ready=Boolean(selected.modelUrl&&selected.modelStatus==='ready');
  $('mainModel').hidden=!ready;$('photoPreview').hidden=ready;
  modelLoaded=false;
  $('launchAR').disabled=true;
  $('launchAR').textContent=ready?'Carregando 3D…':'Câmera indisponível';
  $('viewStatus').textContent=ready?'ESCALA CADASTRADA':'APENAS FOTO';
  $('viewerFeedback').textContent=selected.demo?'Demonstração ilustrativa: a forma e as medidas não representam um prato real.':ready?'Carregando o modelo. Depois aponte a câmera para uma mesa bem iluminada.':'Essa porção ainda não tem modelo 3D aprovado. O restaurante pode enviar um GLB ou gerar um a partir de fotos.';
  if(ready){$('mainModel').src=selected.modelUrl;$('mainModel').alt=`Modelo 3D de ${dish.name}, porção ${selected.label}, ${selected.grams} gramas`;}
  else $('previewImage').src=portionPhoto(selected);
}
function renderComparison(){
  const ready=dish.portions.filter(p=>p.modelUrl&&p.modelStatus==='ready');
  $('comparison').hidden=ready.length<2;
  if(ready.length<2)return;
  $('compareGrid').innerHTML=ready.slice(0,2).map(p=>`<div class="compare-card"><model-viewer src="${escapeHtml(p.modelUrl)}" loading="lazy" interaction-prompt="none" camera-controls camera-orbit="25deg 70deg 0.58m" camera-target="0m 0.07m 0m" field-of-view="32deg" min-camera-orbit="auto auto 0.58m" max-camera-orbit="auto auto 0.58m" shadow-intensity=".6" exposure="1.05" environment-image="neutral" alt="${escapeHtml(dish.name)} em ${p.grams} gramas"></model-viewer><div class="compare-card-footer"><strong>${escapeHtml(p.label)} · ${p.grams} g</strong><span>${p.dimensions.width} × ${p.dimensions.depth} × ${p.dimensions.height} cm</span></div></div>`).join('');
}
document.addEventListener('click',event=>{
  const button=event.target.closest('[data-portion]');
  if(button){selected=dish.portions.find(p=>p.id===button.dataset.portion);render();const url=new URL(location.href);url.searchParams.set('porcao',selected.id);history.replaceState(null,'',url)}
});
$('mainModel').addEventListener('load',()=>{
  if(!selected?.modelUrl || $('mainModel').getAttribute('src')!==selected.modelUrl)return;
  modelLoaded=true;
  $('launchAR').disabled=false;
  $('launchAR').textContent='Abrir na câmera ↗';
  $('viewerFeedback').textContent=selected.demo?'Demonstração ilustrativa. Teste a escala com a régua virtual de 10 cm antes de avaliar um prato real.':'3D pronto. Na câmera, toque na mesa para posicionar e caminhe ao redor para ver outros ângulos.';
});
$('launchAR').addEventListener('click',()=>{
  if(!selected?.modelUrl||!modelLoaded)return;
  const viewer=$('mainModel');
  if(!window.isSecureContext && location.hostname!=='localhost'){
    $('viewerFeedback').textContent='A câmera AR exige HTTPS. Abra o link público seguro no celular.';
    return;
  }
  if(viewer.canActivateAR){
    $('viewerFeedback').textContent='Buscando uma superfície horizontal. Aponte para a mesa, mova o celular lentamente e toque para posicionar.';
    // The browser's user gesture must reach activateAR without an await first.
    try{Promise.resolve(viewer.activateAR()).catch(()=>{$('viewerFeedback').textContent='Não foi possível iniciar a câmera AR neste aparelho.'})}
    catch{$('viewerFeedback').textContent='Não foi possível iniciar a câmera AR neste aparelho.'}
    return;
  }
  $('viewerFeedback').textContent='AR indisponível neste navegador ou aparelho. A visualização 3D acima continua disponível.';
  toast('AR indisponível neste aparelho.');
});
$('mainModel').addEventListener('ar-status',event=>{
  const status=event.detail?.status;
  if(status==='session-started')$('viewerFeedback').textContent='Aponte a câmera para a mesa e toque na superfície para posicionar o prato.';
  if(status==='object-placed')$('viewerFeedback').textContent='Prato posicionado. Mova o celular ao redor da mesa para ver todos os lados; o tamanho fica fixo.';
  if(status==='failed')$('viewerFeedback').textContent='A câmera AR não iniciou. Verifique as permissões e tente outro navegador compatível.';
});
$('mainModel').addEventListener('ar-tracking',event=>{if(event.detail?.status==='not-tracking')$('viewerFeedback').textContent='Rastreamento perdido. Ilumine a mesa, aponte para uma textura visível e mova o celular devagar.'});
$('mainModel').addEventListener('error',()=>{modelLoaded=false;$('launchAR').disabled=true;$('launchAR').textContent='Modelo indisponível';$('viewerFeedback').textContent='O modelo 3D não carregou. Peça ao restaurante para reenviar este arquivo.'});
init();

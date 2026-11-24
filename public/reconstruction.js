import {api,escapeHtml} from './common.js';
const $=id=>document.getElementById(id),params=new URLSearchParams(location.search);
const dishId=params.get('dishId'),portionId=params.get('portionId'),shop=params.get('loja');
const endpoint=path=>{const query=new URLSearchParams();if(shop)query.set('loja',shop);if(path==='/jobs'&&dishId&&portionId){query.set('dishId',dishId);query.set('portionId',portionId);}return '/api/reconstruction'+path+(query.size?'?'+query:'');};
const labels={queued:'Na fila',processing:'Processando',review:'Aguardando sua revisão',completed:'Concluído',failed:'Falhou',cancelled:'Cancelado'};
const stages={VALIDATING:'Validando captura',EXTRACTING:'Preparando fotografias',MATCHING:'Comparando ângulos',RECONSTRUCTING:'Reconstruindo geometria',DENSIFYING:'Detalhando a superfície',TEXTURING:'Preparando textura',PREPARING_PREVIEW:'Recortando e exportando a prévia',PREPARING_ASSETS:'Preparando arquivos web e iPhone'};
const errors={CAPTURE_QUALITY:'As fotos não permitem reconstruir esta porção. Capture novamente com boa luz e mais sobreposição.',INVALID_PHOTOS:'As fotos não passaram pela validação.',INVALID_SCALE:'O resultado não corresponde às medidas cadastradas.',INVALID_MODEL:'O modelo produzido não passou pela validação.',MODEL_TOO_COMPLEX:'O modelo ultrapassou os limites de visualização.',STALE_RESULT:'O prato ou suas medidas mudaram. Gere uma nova versão.',LEASE_EXPIRED:'A execução foi interrompida e será recuperada quando possível.',TIMEOUT:'O processamento atingiu o prazo máximo.',DISK_LIMIT:'O servidor atingiu o limite de espaço.',RUNTIME_UNAVAILABLE:'O ambiente de reconstrução está indisponível.'};
let ready=false,busy=false,previewId=null,disposed=false,polling=false,targetValid=false;
const feedback=text=>{$('generationFeedback').textContent=text;};
function validateFiles(){const files=[...$('generationPhotos').files],total=files.reduce((n,f)=>n+f.size,0);$('generationCount').textContent=`${files.length} fotos · ${(total/1024**2).toFixed(1)} MiB`;return files.length>=30&&files.length<=100&&total<=300*1024**2&&files.every(f=>f.size>0&&f.size<=12*1024**2&&['image/jpeg','image/png'].includes(f.type));}
async function refresh(){
 if(disposed||polling)return;polling=true;
 try{
  const [status,jobs]=await Promise.all([api(endpoint('/status')),api(endpoint('/jobs'))]);
  ready=status.ready;const inProgress=jobs.some(j=>j.kind==='photos'&&j.dishId===dishId&&j.portionId===portionId&&['queued','processing','review'].includes(j.status));
  $('generationStatus').textContent=ready?'Servidor disponível para reconstruir fotos.':'O servidor de geração ainda não está pronto. A importação manual de GLB continua disponível.';
  $('generationSubmit').disabled=!ready||!targetValid||busy||inProgress;$('generationPhotos').disabled=!ready||!targetValid||busy||inProgress;
  const visible=jobs.filter(j=>!dishId||j.dishId===dishId&&j.portionId===portionId);
  $('generationJobs').innerHTML=visible.length?visible.map(j=>`<article class="generation-job"><div><strong>${j.kind==='assets'?'Arquivos web/iPhone':'Modelo por fotos'} · ${escapeHtml(labels[j.status]||j.status)}</strong><p>${j.cancelRequested&&j.status==='processing'?'Cancelando: aguardando a interrupção do processo.':j.status==='processing'?escapeHtml(stages[j.stage]||'Processando captura'):j.status==='failed'?escapeHtml(errors[j.errorCode]||'Não foi possível concluir. O modelo publicado foi preservado.'):'O modelo publicado só muda após sua aprovação.'}</p></div><div class="generation-actions">${j.status==='review'?`<button type="button" class="button outline" data-preview-job="${escapeHtml(j.id)}">Revisar resultado</button>`:''}${['queued','processing','review'].includes(j.status)?`<button type="button" class="button outline" data-cancel-job="${escapeHtml(j.id)}" ${j.cancelRequested?'disabled':''}>${j.status==='review'?'Descartar':'Cancelar'}</button>`:''}</div></article>`).join(''):'<p>Nenhuma tarefa para esta porção.</p>';
  if(previewId&&!jobs.some(j=>j.id===previewId&&j.status==='review'))closePreview();
 }catch{ready=false;$('generationStatus').textContent='Não foi possível consultar a geração. Entre no estúdio e tente atualizar o status.';$('generationSubmit').disabled=true;$('generationPhotos').disabled=true;}
 finally{polling=false;}
}
function closePreview(){previewId=null;$('generationReview').hidden=true;$('generationPreviewModel').removeAttribute('src');$('generationPreviewPhoto').removeAttribute('src');}
$('generationPhotos').addEventListener('change',validateFiles);
$('refreshGeneration').addEventListener('click',refresh);
$('generationForm').addEventListener('submit',async event=>{
 event.preventDefault();if(!ready||!targetValid||busy)return;
 if(!validateFiles()){feedback('Selecione 30–100 fotos JPG/PNG, até 12 MiB por foto e 300 MiB no total.');return;}
 busy=true;$('generationSubmit').disabled=true;feedback('Enviando as fotos. Aguarde a confirmação antes de fechar esta página.');
 try{const body=new FormData();body.append('dishId',dishId);body.append('portionId',portionId);for(const f of $('generationPhotos').files)body.append('photos',f);await api(endpoint('/jobs'),{method:'POST',body});$('generationPhotos').value='';$('generationCount').textContent='Fotos enviadas.';feedback('Tarefa registrada. O processamento continua no servidor mesmo se você fechar o navegador.');}
 catch(error){feedback(error.message);}finally{busy=false;await refresh();}
});
$('generationJobs').addEventListener('click',async event=>{
 const cancel=event.target.closest('[data-cancel-job]'),preview=event.target.closest('[data-preview-job]');
 try{
  if(cancel){cancel.disabled=true;await api(endpoint('/jobs/'+encodeURIComponent(cancel.dataset.cancelJob)+'/cancel'),{method:'POST',body:'{}'});await refresh();}
  if(preview){previewId=preview.dataset.previewJob;$('generationReview').hidden=false;$('generationShape').checked=false;$('generationScale').checked=false;$('generationPreviewModel').setAttribute('src',endpoint('/jobs/'+encodeURIComponent(previewId)+'/model'));$('generationPreviewPhoto').src=endpoint('/jobs/'+encodeURIComponent(previewId)+'/poster');$('generationReview').scrollIntoView({behavior:'auto',block:'start'});}
 }catch(error){feedback(error.message);await refresh();}
});
$('generationApprove').addEventListener('click',async()=>{
 if(!previewId||!$('generationShape').checked||!$('generationScale').checked){feedback('Confira e confirme o formato e a escala antes de publicar.');return;}
 $('generationApprove').disabled=true;
 try{await api(endpoint('/jobs/'+encodeURIComponent(previewId)+'/approve'),{method:'POST',body:JSON.stringify({shapeConfirmed:true,scaleConfirmed:true})});closePreview();feedback('Modelo aprovado. O GLB já está disponível; as variantes web/iPhone serão preparadas pelo worker.');await refresh();}
 catch(error){feedback(error.message);}finally{$('generationApprove').disabled=false;}
});
async function initialize(){
 if(dishId&&portionId){try{const state=await api('/api/manage/state'+(shop?'?loja='+encodeURIComponent(shop):''));const dish=state.dishes.find(d=>d.id===dishId),portion=dish?.portions.find(p=>p.id===portionId);if(portion){targetValid=true;$('generationTarget').textContent=dish.name+' · '+portion.label;}}catch{}}
 if(!targetValid)$('generationTarget').textContent='Abra uma porção salva no estúdio e escolha “Gerar a partir de fotos”.';
 await refresh();
}
const timer=setInterval(()=>{if(!document.hidden)refresh()},5000);
window.addEventListener('pagehide',event=>{if(!event.persisted){disposed=true;clearInterval(timer);closePreview();}});
initialize();

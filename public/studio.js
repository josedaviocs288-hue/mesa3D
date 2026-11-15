import {api as request,money,escapeHtml,toast,firstPhoto,publicUrl,viewerUrl} from './common.js';

// The platform owner may manage any restaurant from the owner dashboard.
const ownerShop=new URLSearchParams(location.search).get('loja');
const api=(url,options)=>request(ownerShop&&/^\/api\/(?:manage|restaurant|dishes)(?:\/|$)/.test(url)?`${url}${url.includes('?')?'&':'?'}loja=${encodeURIComponent(ownerShop)}`:url,options);

const $=id=>document.getElementById(id);
let state=null,section='overview',editing=null,reviewing=null,busy=false;
let capturedPhotos=new Map(),previewUrls=[];
const sections=['overview','dishes','orders','restaurant','payments','share','account'];

async function refresh(){state=await api('/api/manage/state');renderAll();refreshExtras()}
async function refreshExtras(){
  try{
    const [orders,payments]=await Promise.all([api('/api/manage/orders'),api('/api/manage/payments')]);
    $('ordersList').innerHTML=orders.length?orders.map(o=>`<article class="order-line"><div><strong>#${escapeHtml(o.id.slice(0,8))} · ${escapeHtml(o.customer_name||'Cliente')} <span class="payment-status">${o.payment_status==='paid'?'Pago online':o.status==='awaiting_payment'?'Aguardando pagamento':'Pagamento na mesa'}</span></strong><small>${escapeHtml(o.table_number||'Sem mesa')} · ${new Date(o.created_at).toLocaleString('pt-BR')} · ${money(o.total_cents/100)}</small><p>${o.items.map(i=>`${i.qty}× ${escapeHtml(i.name)} · ${escapeHtml(i.portion)}`).join('<br>')}</p>${o.notes?`<p>Observações: ${escapeHtml(o.notes)}</p>`:''}</div><label>Status<br><select data-order="${escapeHtml(o.id)}">${['awaiting_payment','received','preparing','ready','delivered','cancelled'].map(s=>`<option value="${s}" ${o.status===s?'selected':''}>${({awaiting_payment:'Aguardando pagamento',received:'Recebido',preparing:'Preparando',ready:'Pronto',delivered:'Entregue',cancelled:'Cancelado'})[s]}</option>`).join('')}</select></label></article>`).join(''):'<p>Ainda não há pedidos.</p>';
    $('merchantStatus').textContent=payments.connected?'Conta conectada. Clientes podem pagar online no seu cardápio.':'Conta ainda não conectada. Pedidos podem ser pagos na mesa.';
    $('connectMp').textContent=payments.connected?'Reconectar Mercado Pago ↗':'Conectar Mercado Pago ↗';
    $('billingPrice').textContent=payments.monthlyCents? `Valor configurado: ${money(payments.monthlyCents/100)} por cobrança. ${payments.lastBill?'Última cobrança: '+(payments.lastBill.status==='paid'?'paga':payments.lastBill.status)+'.':''}`:'Valor do plano ainda não configurado.';
    $('paySubscription').disabled=!payments.monthlyCents;
  }catch(e){toast(e.message)}
}
function go(name){
  if(!sections.includes(name))return;
  section=name;
  for(const s of sections)$(`section-${s}`).hidden=s!==name;
  document.querySelectorAll('[data-section]').forEach(b=>b.classList.toggle('active',b.dataset.section===name));
  $('crumbCurrent').textContent=({overview:'VISÃO GERAL',dishes:'PRATOS E PORÇÕES',orders:'PEDIDOS',restaurant:'RESTAURANTE',payments:'PAGAMENTOS',share:'LINK E QR CODE',account:'CONTA'})[name];
  window.scrollTo({top:0,behavior:'smooth'});
}
function renderAll(){
  const dishes=state.dishes;
  document.querySelectorAll('[data-public-cardapio]').forEach(link=>link.href=publicUrl(state.restaurant.slug));
  for(const ownerReturn of [$('ownerReturn'),$('ownerReturnTop')])if(ownerReturn)ownerReturn.hidden=!ownerShop;
  $('metricPublished').textContent=dishes.filter(d=>d.published).length;
  $('metricModels').textContent=dishes.flatMap(d=>d.portions).filter(p=>p.modelUrl&&p.modelStatus==='ready').length;
  $('metricPhotos').textContent=dishes.flatMap(d=>d.portions).reduce((n,p)=>n+(p.photos?.length||0),0);
  const rows=dishes.map(d=>{
    const models=d.portions.filter(p=>p.modelUrl&&p.modelStatus==='ready').length;
    return `<article class="admin-dish-row"><img src="${escapeHtml(firstPhoto(d))}" alt=""><div class="admin-dish-name"><strong>${escapeHtml(d.name)}</strong><small>${escapeHtml(d.category)} · ${d.portions.length} ${d.portions.length===1?'porção':'porções'} · ${models} com 3D</small></div><span class="status-pill ${d.published?'':'draft'}">${d.published?'Publicado':'Rascunho'}</span><div class="row-actions"><button data-edit="${escapeHtml(d.id)}">Editar</button><button class="delete" data-delete="${escapeHtml(d.id)}">Excluir</button></div></article>`;
  }).join('') || '<div class="empty-state"><h3>Seu cardápio começa aqui.</h3><p>Cadastre o primeiro prato e uma porção medida.</p></div>';
  $('recentDishes').innerHTML=rows;$('dishAdminList').innerHTML=rows;
  const form=$('restaurantForm');for(const [key,value] of Object.entries(state.restaurant)){const input=form.elements.namedItem(key);if(input)input.value=value??''}
  const url=publicUrl(state.restaurant.slug);
  $('publicUrl').value=url;$('openPublicUrl').href=url;$('qrImage').src=`/api/qr.svg?url=${encodeURIComponent(url)}`;$('qrName').textContent=state.restaurant.name;
}
function blankPortion(){return{id:crypto.randomUUID(),label:'Individual',grams:'',price:'',dimensions:{width:'',depth:'',height:''},upAxis:'auto',photos:[],modelSource:'',modelUrl:'',modelStatus:'missing'}}
function portionCard(p,index){
  const hasPhotos=(p.photos?.length||0)>0,hasModel=Boolean(p.modelUrl);
  const canGenerate=state.capabilities.meshyConfigured && (p.photos?.length||0)>=2 && !p.modelStatus?.includes('processing') && !p.demo;
  return `<article class="portion-card" data-id="${escapeHtml(p.id)}"><div class="portion-head"><strong>Porção ${index+1}</strong><button type="button" data-remove-portion="${escapeHtml(p.id)}">Remover porção</button></div><div class="portion-fields"><label class="field"><span>Nome da porção *</span><input data-field="label" required maxlength="50" value="${escapeHtml(p.label)}" placeholder="Ex.: Individual"></label><label class="field"><span>Peso servido (g) *</span><input data-field="grams" type="number" min="1" max="10000" required value="${escapeHtml(p.grams)}"></label><label class="field"><span>Preço (R$) *</span><input data-field="price" type="number" min="0" step="0.01" required value="${escapeHtml(p.price)}"></label><label class="field"><span>Largura (cm) *</span><input data-field="width" type="number" min="3" max="150" step="0.1" required value="${escapeHtml(p.dimensions.width)}"></label><label class="field"><span>Profundidade (cm) *</span><input data-field="depth" type="number" min="3" max="150" step="0.1" required value="${escapeHtml(p.dimensions.depth)}"></label><label class="field"><span>Altura (cm) *</span><input data-field="height" type="number" min="0.5" max="100" step="0.1" required value="${escapeHtml(p.dimensions.height)}"></label></div><div class="portion-media"><label class="file-label"><span>Fotos da mesma porção</span><input data-files="photos" type="file" accept="image/jpeg,image/png" multiple><small>2 a 4 vistas JPG/PNG: frente, lateral e 45°. A primeira vira a foto principal.</small><span class="media-status">${hasPhotos?`${p.photos.length} ${p.photos.length===1?'foto salva':'fotos salvas'}`:'Nenhuma foto salva'}</span></label><label class="file-label"><span>Modelo 3D próprio (GLB)</span><input data-files="model" type="file" accept=".glb,model/gltf-binary"><small>O arquivo será calibrado automaticamente com as medidas acima.</small><span class="media-status">${hasModel?'✓ Modelo 3D pronto':'Nenhum modelo 3D'}</span></label></div>${hasPhotos?`<div class="thumb-row">${p.photos.map(url=>`<img src="${escapeHtml(url)}" alt="Foto da porção">`).join('')}</div>`:''}<button type="button" class="generate-button" data-generate="${escapeHtml(p.id)}" ${canGenerate?'':'disabled'}>${p.modelStatus==='processing'?'Gerando modelo...':state.capabilities.meshyConfigured?'Gerar 3D das fotos':'Gerar 3D das fotos · configurar API'}</button><div class="media-status">${p.demo?'Exemplo com medidas ilustrativas. Substitua fotos, medidas e modelo pelos dados do seu prato.':p.modelStatus==='failed'?'A geração falhou. Confira as fotos e tente novamente.':'A geração usa um serviço externo e pode consumir créditos. Revise o resultado antes de publicar.'}</div></article>`;
}
function addAxisSelector(card,axis='auto'){
  const label=document.createElement('label');label.className='file-label axis-select';
  label.innerHTML='<span>Orientação vertical do GLB</span><select data-axis><option value="auto">Detectar automaticamente</option><option value="y">Y para cima (padrão glTF)</option><option value="z">Z para cima (alguns scans)</option></select><small>Se o prato aparecer de lado, escolha outro eixo e salve novamente.</small>';
  label.querySelector('select').value=axis;
  card.querySelector('.portion-media').after(label);
  const photoLabel=card.querySelector('[data-files="photos"]').closest('.file-label');
  photoLabel.insertAdjacentHTML('afterend','<div class="capture-box"><button type="button" class="camera-capture" data-camera>+ Tirar foto com a câmera</button><input data-files="camera" type="file" accept="image/jpeg,image/png" capture="environment" hidden><span class="capture-count"></span><div class="pending-photos"></div></div>');
}
function updatePhotoPreview(card){
  const files=[...card.querySelector('[data-files="photos"]').files,...(capturedPhotos.get(card.dataset.id)||[])];
  const preview=card.querySelector('.pending-photos');
  preview.querySelectorAll('img').forEach(img=>{if(img.src.startsWith('blob:'))URL.revokeObjectURL(img.src)});
  preview.innerHTML='';
  for(const file of files){const img=document.createElement('img');img.src=URL.createObjectURL(file);preview.appendChild(img);previewUrls.push(img.src)}
  card.querySelector('.capture-count').textContent=files.length?`${files.length} ${files.length===1?'foto selecionada':'fotos selecionadas'} para salvar`:'';
}
function renderEditorPortions(portions){
  $('portionEditor').innerHTML='<div class="model-help"><strong>Para ver o prato real na câmera</strong><p>Escaneie a porção servida de vários ângulos e envie o GLB texturizado. O site ajusta a escala, mas a fidelidade depende do scan e da comparação com o prato físico. Esse caminho não precisa de API.</p><a href="/guia-3d.html" target="_blank" rel="noopener">Como escanear e testar sem API ↗</a></div>'+portions.map(portionCard).join('');
  [...$('portionEditor').querySelectorAll('.portion-card')].forEach((card,i)=>{
    const p=portions[i];addAxisSelector(card,p.upAxis||'auto');
    const status=p.modelStatus==='ready'?'3D aprovado':p.modelStatus==='review'?'3D para revisar':p.photos?.length?'Fotos salvas · falta modelo 3D':'Comece pelas fotos e medidas';
    card.querySelector('.portion-head').insertAdjacentHTML('beforeend',`<span class="portion-progress">${status}</span>`);
    if(!state.capabilities.meshyConfigured)card.querySelector('.generate-button').textContent='Geração por API opcional (não configurada)';
    const link=document.createElement('a');link.className='generate-button';
    link.textContent='Criar GLB local com 20–80 fotos (sem API) ↗';
    if(editing?.id){const qs=new URLSearchParams({dishId:editing.id,portionId:p.id});if(ownerShop)qs.set('loja',ownerShop);link.href='/laboratorio-3d.html?'+qs.toString()}
    else{link.href='#';link.addEventListener('click',ev=>{ev.preventDefault();toast('Salve o prato e depois abra novamente para gerar o 3D local.')})}
    card.querySelector('.generate-button').after(link);
    if(p.modelStatus==='review'&&p.modelUrl)card.querySelector('.generate-button').insertAdjacentHTML('afterend',`<button type="button" class="generate-button" data-review="${escapeHtml(p.id)}">Revisar e aprovar modelo ↗</button>`);
  });
}
function openEditor(dish=null){
  editing=dish;
  for(const url of previewUrls)URL.revokeObjectURL(url);previewUrls=[];capturedPhotos=new Map();
  const form=$('dishForm');form.reset();
  form.elements.namedItem('id').value=dish?.id||'';
  form.elements.namedItem('name').value=dish?.name||'';
  form.elements.namedItem('category').value=dish?.category||'';
  form.elements.namedItem('description').value=dish?.description||'';
  form.elements.namedItem('allergens').value=dish?.allergens||'';
  form.elements.namedItem('prepMinutes').value=dish?.prepMinutes??20;
  form.elements.namedItem('published').checked=dish?.published??true;
  form.elements.namedItem('featured').checked=dish?.featured??false;
  $('editorTitle').textContent=dish?'Editar prato':'Novo prato';
  renderEditorPortions(dish?.portions||[blankPortion()]);
  $('editorDialog').showModal();
}
function readPortionCard(card){
  const get=name=>card.querySelector(`[data-field="${name}"]`).value;
  return {id:card.dataset.id,label:get('label'),grams:Number(get('grams')),price:Number(get('price')),upAxis:card.querySelector('[data-axis]').value,dimensions:{width:Number(get('width')),depth:Number(get('depth')),height:Number(get('height'))}};
}
async function saveDish(event){
  event.preventDefault();if(busy)return;
  busy=true;const button=$('saveDishButton');button.disabled=true;button.textContent='Salvando prato e arquivos...';
  try{
    const form=$('dishForm');const cards=[...$('portionEditor').querySelectorAll('.portion-card')];
    if(!cards.length)throw new Error('Adicione pelo menos uma porção.');
    if(cards.length>6)throw new Error('O limite é de seis porções por prato.');
    const payload={id:form.elements.namedItem('id').value||undefined,name:form.elements.namedItem('name').value,category:form.elements.namedItem('category').value,description:form.elements.namedItem('description').value,allergens:form.elements.namedItem('allergens').value,prepMinutes:Number(form.elements.namedItem('prepMinutes').value),published:form.elements.namedItem('published').checked,featured:form.elements.namedItem('featured').checked,portions:cards.map(readPortionCard)};
    if(payload.published && cards.some(card=>!card.querySelector('[data-files="photos"]').files.length && !(capturedPhotos.get(card.dataset.id)||[]).length && !editing?.portions.find(p=>p.id===card.dataset.id)?.photos?.length))throw new Error('Envie ao menos uma foto de cada porção antes de publicar.');
    const saved=await api('/api/dishes',{method:'POST',body:JSON.stringify(payload)});
    for(const card of cards){
      const id=card.dataset.id, photos=[...card.querySelector('[data-files="photos"]').files,...(capturedPhotos.get(id)||[])], model=card.querySelector('[data-files="model"]').files[0];
      if(photos.length>4)throw new Error('Use no máximo quatro fotos por porção.');
      if(photos.length){const data=new FormData();for(const photo of photos)data.append('photos',photo);await api(`/api/dishes/${saved.id}/portions/${id}/photos`,{method:'POST',body:data})}
      if(model){const data=new FormData();data.append('model',model);await api(`/api/dishes/${saved.id}/portions/${id}/model`,{method:'POST',body:data})}
    }
    await refresh();$('editorDialog').close();go('dishes');toast('Prato salvo no cardápio.');
  }catch(e){toast(e.message)}finally{busy=false;button.disabled=false;button.textContent='Salvar prato e arquivos ↗'}
}
async function generate(portionId){
  if(!editing){toast('Salve o prato antes de gerar o modelo.');return}
  const portion=editing.portions.find(p=>p.id===portionId);
  if(!portion || portion.demo){toast('Envie fotos reais desta porção e salve antes de gerar.');return}
  if(!confirm('Gerar este modelo em um serviço externo? As fotos serão enviadas e a operação pode consumir créditos.'))return;
  try{await api(`/api/dishes/${editing.id}/portions/${portionId}/generate`,{method:'POST',body:'{}'});await refresh();editing=state.dishes.find(d=>d.id===editing.id);renderEditorPortions(editing.portions);toast('Geração iniciada. O andamento aparece neste estúdio.')}catch(e){toast(e.message)}
}
function openReview(portionId){
  if(!editing)return;
  const portion=editing.portions.find(p=>p.id===portionId);
  if(!portion?.modelUrl)return;
  reviewing={dishId:editing.id,portionId};
  $('reviewShape').checked=false;$('reviewScale').checked=false;
  $('reviewModel').src=portion.modelUrl;
  $('reviewPhotos').innerHTML=(portion.photos||[]).map((url,index)=>`<figure><img src="${escapeHtml(url)}" alt="Foto real ${index+1} da porção"><figcaption>Foto real ${index+1}</figcaption></figure>`).join('');
  const report=portion.modelReport;
  const mobileInfo=report?` · ${(report.bytes/1024/1024).toFixed(1)} MB · ${Math.round(report.triangles/1000)} mil triângulos · escala resultante ${report.actualSizeCm?.join(' × ')} cm`:'';
  $('reviewMeasures').textContent=`${editing.name} · ${portion.label} · ${portion.grams} g · medidas cadastradas ${portion.dimensions.width} × ${portion.dimensions.depth} × ${portion.dimensions.height} cm${mobileInfo}`;
  $('reviewDialog').showModal();
}
async function pollJobs(){
  if(!state || busy || !state.capabilities.meshyConfigured)return;
  const pending=state.dishes.flatMap(d=>d.portions.filter(p=>p.modelStatus==='processing').map(p=>({dishId:d.id,portionId:p.id})));
  if(!pending.length)return;
  for(const job of pending){try{const result=await api(`/api/dishes/${job.dishId}/portions/${job.portionId}/job`);if(['review','ready','failed'].includes(result.status)){await refresh();if($('editorDialog').open && editing?.id===job.dishId){editing=state.dishes.find(d=>d.id===job.dishId);renderEditorPortions(editing.portions)}toast(result.status==='review'?'Modelo gerado. Revise e aprove antes de mostrar ao cliente.':result.status==='ready'?'Modelo 3D pronto.':`Falha na geração: ${result.error||'tente novamente.'}`)}}catch(e){console.warn(e.message)}}
}

document.addEventListener('click',async event=>{
  const side=event.target.closest('[data-section]');if(side)go(side.dataset.section);
  const next=event.target.closest('[data-go]');if(next)go(next.dataset.go);
  const edit=event.target.closest('[data-edit]');if(edit)openEditor(state.dishes.find(d=>d.id===edit.dataset.edit));
  const del=event.target.closest('[data-delete]');if(del && confirm('Excluir este prato do cardápio?')){try{await api(`/api/dishes/${del.dataset.delete}`,{method:'DELETE'});await refresh();toast('Prato excluído.')}catch(e){toast(e.message)}}
  const remove=event.target.closest('[data-remove-portion]');if(remove){const cards=[...$('portionEditor').querySelectorAll('.portion-card')];if(cards.length===1){toast('O prato precisa de ao menos uma porção.');return}remove.closest('.portion-card').remove();[...$('portionEditor').querySelectorAll('.portion-head strong')].forEach((e,i)=>e.textContent=`Porção ${i+1}`)}
  const gen=event.target.closest('[data-generate]');if(gen)generate(gen.dataset.generate);
  const review=event.target.closest('[data-review]');if(review)openReview(review.dataset.review);
  const camera=event.target.closest('[data-camera]');if(camera)camera.closest('.portion-card').querySelector('[data-files="camera"]').click();
  const close=event.target.closest('[data-close]');if(close)document.getElementById(close.dataset.close)?.close();
});
for(const id of ['newDishOverview','newDishFeature','newDishList'])$(id).addEventListener('click',()=>openEditor());
$('addPortion').addEventListener('click',()=>{const cards=[...$('portionEditor').querySelectorAll('.portion-card')];if(cards.length>=6){toast('O limite é de seis porções.');return}$('portionEditor').insertAdjacentHTML('beforeend',portionCard(blankPortion(),cards.length));addAxisSelector($('portionEditor').lastElementChild)});
$('portionEditor').addEventListener('change',event=>{
  const card=event.target.closest('.portion-card');if(!card)return;
  if(event.target.matches('[data-files="camera"]')){
    const file=event.target.files?.[0];if(!file)return;
    const current=capturedPhotos.get(card.dataset.id)||[];
    if(current.length+card.querySelector('[data-files="photos"]').files.length>=4){toast('Use no máximo quatro fotos por porção.');event.target.value='';return}
    current.push(file);capturedPhotos.set(card.dataset.id,current);event.target.value='';updatePhotoPreview(card);
  }
  if(event.target.matches('[data-files="photos"]'))updatePhotoPreview(card);
});
$('dishForm').addEventListener('submit',saveDish);
$('restaurantForm').addEventListener('submit',async event=>{event.preventDefault();try{const values=Object.fromEntries(new FormData(event.target));const updated=await api('/api/restaurant',{method:'PUT',body:JSON.stringify(values)});if(ownerShop&&updated.restaurant.slug!==ownerShop){location.href=`/studio.html?loja=${encodeURIComponent(updated.restaurant.slug)}`;return}await refresh();toast('Restaurante atualizado.')}catch(e){toast(e.message)}});
$('copyPublicUrl').addEventListener('click',async()=>{try{await navigator.clipboard.writeText($('publicUrl').value);toast('Link copiado.')}catch{toast('Não foi possível copiar o link.')}});
$('downloadQr').addEventListener('click',()=>{const link=document.createElement('a');link.href=$('qrImage').src;link.download=`qr-${state.restaurant.slug}.svg`;link.click()});
$('approveModel').addEventListener('click',async()=>{
  if(!reviewing)return;
  if(!$('reviewShape').checked||!$('reviewScale').checked){toast('Confirme o formato e a escala no celular antes de aprovar.');return}
  try{await api(`/api/dishes/${reviewing.dishId}/portions/${reviewing.portionId}/approve`,{method:'POST',body:JSON.stringify({shapeConfirmed:true,scaleConfirmed:true})});await refresh();editing=state.dishes.find(d=>d.id===reviewing.dishId);renderEditorPortions(editing.portions);$('reviewDialog').close();reviewing=null;toast('Modelo aprovado para o cardápio.')}catch(e){toast(e.message)}
});
$('ordersList').addEventListener('change',async event=>{const select=event.target.closest('[data-order]');if(!select)return;try{await api(`/api/manage/orders/${select.dataset.order}`,{method:'PATCH',body:JSON.stringify({status:select.value})});toast('Status atualizado.')}catch(e){toast(e.message);refreshExtras()}});
$('connectMp').addEventListener('click',async()=>{try{const result=await api('/api/manage/mp/connect');location.href=result.url}catch(e){toast(e.message)}});
$('paySubscription').addEventListener('click',async()=>{try{const result=await api('/api/manage/billing/checkout',{method:'POST',body:'{}'});location.href=result.url}catch(e){toast(e.message)}});
$('passwordForm').addEventListener('submit',async event=>{event.preventDefault();try{await api('/api/auth/password',{method:'POST',body:JSON.stringify(Object.fromEntries(new FormData(event.target)))});event.target.reset();toast('Senha alterada.')}catch(e){toast(e.message)}});
$('logoutStudio').addEventListener('click',async()=>{await api('/api/auth/logout',{method:'POST',body:'{}'});location.href='/acesso.html'});
$('logoutTop').addEventListener('click',async()=>{await api('/api/auth/logout',{method:'POST',body:'{}'});location.href='/acesso.html'});
$('editorDialog').addEventListener('click',event=>{if(event.target===$('editorDialog'))$('editorDialog').close()});
refresh().catch(e=>{if(e.message.includes('login'))location.href='/acesso.html';else toast(`Não foi possível abrir o estúdio: ${e.message}`)});
setInterval(pollJobs,12000);

import {api,money,escapeHtml,toast,firstPhoto,portionPhoto,viewerUrl} from './common.js';

let restaurant,dishes=[],category='Todos',search='',activeDish=null,activePortion=null,paymentAvailable=false;
let cart=readCart();
const $=id=>document.getElementById(id);
function readCart(){try{return JSON.parse(localStorage.getItem('mesa3d-cart-v5'))||[]}catch{return []}}
function saveCart(){localStorage.setItem('mesa3d-cart-v5',JSON.stringify(cart));renderCartCount()}
function renderCartCount(){$('bagCount').textContent=String(cart.reduce((n,x)=>n+x.qty,0))}

async function init(){
  try{
    const requested=new URLSearchParams(location.search).get('loja');
    const state=await api(`/api/state${requested?('?loja='+encodeURIComponent(requested)):''}`); restaurant=state.restaurant; dishes=state.dishes.filter(d=>d.published).sort((a,b)=>Number(b.featured)-Number(a.featured));paymentAvailable=Boolean(state.capabilities?.payments);
    if(requested && requested!==restaurant.slug){$('dishGrid').innerHTML='<div class="empty-state"><h3>Cardápio não encontrado.</h3><p>Confira o endereço usado no QR Code.</p></div>';return}
    $('brandName').textContent=restaurant.name;$('restaurantLabel').textContent=restaurant.name;$('footerName').textContent=[restaurant.name,restaurant.address].filter(Boolean).join(' · ');
    $('heroDish').src=firstPhoto(dishes[0]);$('heroDish').alt=dishes[0]?`Prato em destaque: ${dishes[0].name}`:'Prato ilustrativo';
    $('heroDish').closest('.hero-art').classList.toggle('uploaded-photo',!$('heroDish').src.includes('filet-demo.webp'));
    $('heroIntro').textContent=[restaurant.tagline,restaurant.intro].filter(Boolean).join(' ') || 'Conheça o prato de perto, compare porções e veja como ele ocupa a sua mesa.';
    document.title=`${restaurant.name} · Cardápio`;
    cart=cart.filter(item=>dishes.some(d=>d.id===item.dishId&&d.portions.some(p=>p.id===item.portionId)));
    saveCart();renderCategories();renderDishes();renderCartCount();
  }catch(e){toast(e.message);$('dishGrid').innerHTML='<div class="empty-state"><h3>Não foi possível abrir o cardápio.</h3><p>Atualize a página ou tente novamente em instantes.</p></div>'}
}
function renderCategories(){
  const categories=['Todos',...new Set(dishes.map(d=>d.category))];
  $('categories').innerHTML=categories.map(c=>`<button class="category-chip ${c===category?'active':''}" data-category="${escapeHtml(c)}">${escapeHtml(c)}</button>`).join('');
}
function renderDishes(){
  const query=search.toLocaleLowerCase('pt-BR');
  const shown=dishes.filter(d=>(category==='Todos'||d.category===category)&&`${d.name} ${d.category} ${d.description}`.toLocaleLowerCase('pt-BR').includes(query));
  $('dishGrid').innerHTML=shown.map(d=>{
    const from=Math.min(...d.portions.map(p=>p.price));
    const count=d.portions.length;
    const ready=d.portions.some(p=>p.modelUrl&&p.modelStatus==='ready');
    return `<article class="dish-card"><button type="button" class="dish-image" data-open="${escapeHtml(d.id)}" aria-label="Ver ${escapeHtml(d.name)}"><img src="${escapeHtml(firstPhoto(d))}" alt="${escapeHtml(d.name)}"><span class="dish-badge">${d.portions.some(p=>p.demo)?'DEMONSTRAÇÃO':ready?'VISUALIZAÇÃO 3D':'FOTO DO PRATO'}</span></button><div class="dish-card-body"><div class="dish-card-meta">${escapeHtml(d.category)} · ${count} ${count===1?'PORÇÃO':'PORÇÕES'}</div><h3>${escapeHtml(d.name)}</h3><p>${escapeHtml(d.description)}</p><div class="dish-card-footer"><div><small>A PARTIR DE</small><strong>${money(from)}</strong></div><button type="button" class="dish-open" data-open="${escapeHtml(d.id)}" aria-label="Abrir detalhes">↗</button></div></div></article>`;
  }).join('');
  if(shown.length===1 && shown[0].portions.length>=2 && shown[0].portions.some(p=>p.modelStatus==='ready')){
    const d=shown[0], sorted=[...d.portions].sort((a,b)=>a.grams-b.grams),small=sorted[0],large=sorted[sorted.length-1];
    const smallW=Math.round(210*small.dimensions.width/large.dimensions.width),smallH=Math.round(155*small.dimensions.depth/large.dimensions.depth);
    $('dishGrid').insertAdjacentHTML('beforeend',`<aside class="size-story"><div class="size-story-copy"><span class="eyebrow light"><span class="eyebrow-line"></span> PORÇÃO É UMA ESCOLHA PESSOAL</span><h3>O mesmo prato. <em>Outro tamanho.</em></h3><p>Veja as medidas de ${small.grams} g e ${large.grams} g sob a mesma lente antes de pedir. Cada versão ocupa seu próprio espaço na mesa.</p><a class="button cream" href="${viewerUrl(d.id,small.id,restaurant.slug)}">Comparar em 3D <span>↗</span></a></div><div class="size-orbits" aria-hidden="true"><div class="size-orbit-wrap"><div class="size-orbit small" style="width:${smallW}px;height:${smallH}px"><strong>${small.grams}<span>g</span></strong></div><small>${small.dimensions.width} × ${small.dimensions.depth} cm</small></div><div class="size-orbit-wrap"><div class="size-orbit large"><strong>${large.grams}<span>g</span></strong></div><small>${large.dimensions.width} × ${large.dimensions.depth} cm</small></div></div></aside>`);
  }
  $('emptyState').hidden=shown.length>0;
}
function openDish(id){
  activeDish=dishes.find(d=>d.id===id);if(!activeDish)return;
  activePortion=activeDish.portions[0];renderDetail();$('dishDialog').showModal();
}
function renderDetail(){
  const d=activeDish,p=activePortion;
  $('dishDetail').innerHTML=`<div class="detail-grid"><div class="detail-image"><img src="${escapeHtml(portionPhoto(p))}" alt="${escapeHtml(d.name)}"><span>${p.demo?'EXEMPLO ILUSTRATIVO':'FOTO DA PORÇÃO SELECIONADA'}</span></div><div class="detail-copy"><span class="eyebrow"><span class="eyebrow-line"></span> ${escapeHtml(d.category.toUpperCase())}</span><h2>${escapeHtml(d.name)}</h2><p>${escapeHtml(d.description)}</p><div class="detail-facts"><span>◷ ${d.prepMinutes} min de preparo</span>${d.allergens?`<span>◇ ${escapeHtml(d.allergens)}</span>`:''}</div><div class="detail-label">ESCOLHA SUA PORÇÃO</div><div class="detail-portions">${d.portions.map(x=>`<button type="button" class="detail-option ${x.id===p.id?'active':''}" data-portion="${escapeHtml(x.id)}"><span><strong>${escapeHtml(x.label)} · ${x.grams} g</strong><small>${x.modelUrl&&x.modelStatus==='ready'?'3D em tamanho cadastrado':'Foto disponível'} · ${x.dimensions.width} × ${x.dimensions.depth} cm</small></span><b>${money(x.price)}</b></button>`).join('')}</div><div class="detail-measures">Dimensões servidas: <strong>${p.dimensions.width} × ${p.dimensions.depth} × ${p.dimensions.height} cm</strong> (largura × profundidade × altura)${p.demo?' · medidas de demonstração':''}</div><div class="detail-actions"><button type="button" class="button terracotta" id="detailAdd" ${p.demo?'disabled':''}>${p.demo?'Exemplo não disponível':'Adicionar à sacola <span>+</span>'}</button>${p.modelUrl&&p.modelStatus==='ready'?`<a class="button outline" href="${viewerUrl(d.id,p.id,restaurant.slug)}">Ver em 3D <span>↗</span></a>`:''}</div></div></div>`;
}
function addToCart(){const key=`${activeDish.id}:${activePortion.id}`;const item=cart.find(x=>x.key===key);if(item)item.qty++;else cart.push({key,dishId:activeDish.id,portionId:activePortion.id,qty:1});saveCart();toast('Porção adicionada à sacola.');$('dishDialog').close()}
function activeCartItems(){return cart.map(item=>{const dish=dishes.find(d=>d.id===item.dishId),portion=dish?.portions.find(p=>p.id===item.portionId);return dish&&portion?{...item,dish,portion}:null}).filter(Boolean)}
function renderCart(){
  const items=activeCartItems();
  $('cartItems').innerHTML=items.length?items.map(i=>`<div class="cart-row"><div><strong>${i.qty}× ${escapeHtml(i.dish.name)}</strong><small>${escapeHtml(i.portion.label)} · ${i.portion.grams} g</small><button data-remove="${escapeHtml(i.key)}">Remover</button></div><strong>${money(i.qty*i.portion.price)}</strong></div>`).join(''):'<p class="cart-note">Sua sacola ainda está vazia. Explore o cardápio e escolha uma porção.</p>';
  $('cartTotal').textContent=money(items.reduce((n,i)=>n+i.qty*i.portion.price,0));
  $('sendOrder').disabled=!items.length;$('payOnline').disabled=!items.length;$('payOnline').hidden=!paymentAvailable;
  $('cartNote').textContent=paymentAvailable?'Escolha pagar agora ou na mesa. O restaurante receberá o pedido nos dois casos.':'O pedido será registrado para pagamento na mesa.';
}
async function sendOrder(payOnline=false){
  const items=activeCartItems();if(!items.length)return;
  const name=$('customerName').value.trim(),table=$('tableNumber').value.trim(),notes=$('orderNotes').value.trim();
  if(!name||!table){toast('Informe seu nome e a mesa ou comanda.');return}
  const buttons=[$('sendOrder'),$('payOnline')];buttons.forEach(b=>b.disabled=true);
  try{
    const order=await api(`/api/orders?loja=${encodeURIComponent(restaurant.slug)}`,{method:'POST',body:JSON.stringify({items:items.map(i=>({dishId:i.dishId,portionId:i.portionId,qty:i.qty})),customerName:name,tableNumber:table,notes,paymentIntent:payOnline})});
    if(payOnline){const checkout=await api(`/api/orders/${order.id}/checkout`,{method:'POST',body:'{}'});cart=[];saveCart();location.href=checkout.url;return}
    cart=[];saveCart();location.href=`/pedido.html?id=${encodeURIComponent(order.id)}`;
  }catch(e){toast(e.message)}finally{buttons.forEach(b=>b.disabled=false)}
}

document.addEventListener('click',event=>{
  const open=event.target.closest('[data-open]');if(open)openDish(open.dataset.open);
  const categoryButton=event.target.closest('[data-category]');if(categoryButton){category=categoryButton.dataset.category;renderCategories();renderDishes()}
  const portionButton=event.target.closest('[data-portion]');if(portionButton){activePortion=activeDish.portions.find(p=>p.id===portionButton.dataset.portion);renderDetail()}
  if(event.target.closest('#detailAdd'))addToCart();
  const remove=event.target.closest('[data-remove]');if(remove){cart=cart.filter(i=>i.key!==remove.dataset.remove);saveCart();renderCart()}
  const close=event.target.closest('[data-close]');if(close)document.getElementById(close.dataset.close)?.close();
});
$('search').addEventListener('input',event=>{search=event.target.value;renderDishes()});
$('openCart').addEventListener('click',()=>{renderCart();$('cartDialog').showModal()});
$('sendOrder').addEventListener('click',()=>sendOrder(false));
$('payOnline').addEventListener('click',()=>sendOrder(true));
for(const dialog of document.querySelectorAll('dialog'))dialog.addEventListener('click',event=>{if(event.target===dialog)dialog.close()});
init();

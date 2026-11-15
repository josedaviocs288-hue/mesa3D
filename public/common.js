export const money = value => new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(Number(value)||0);
export const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
export async function api(url,options={}) {
  const response=await fetch(url,{...options,headers:{...(options.body instanceof FormData?{}:{'Content-Type':'application/json'}),...(options.headers||{})}});
  const data=await response.json().catch(()=>({}));
  if (!response.ok) throw new Error(data.error || `Falha ${response.status}`);
  return data;
}
export function toast(message) {
  const el=document.getElementById('toast'); if (!el) return;
  el.textContent=message;el.classList.add('show');
  clearTimeout(toast.timer);toast.timer=setTimeout(()=>el.classList.remove('show'),3600);
}
export const firstPhoto = dish => dish?.portions?.find(p=>p.photos?.length)?.photos[0] || '/assets/placeholder.svg';
export const portionPhoto = portion => portion?.photos?.[0] || '/assets/placeholder.svg';
export function publicUrl(slug) {const url=new URL('/',location.origin);url.searchParams.set('loja',slug);return url.href}
export function viewerUrl(dishId,portionId,slug) {const url=new URL('/ver.html',location.origin);url.searchParams.set('id',dishId);if(portionId)url.searchParams.set('porcao',portionId);if(slug)url.searchParams.set('loja',slug);return url.href}

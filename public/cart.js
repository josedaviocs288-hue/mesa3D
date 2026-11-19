export const cartKey = slug => 'mesa3d-cart:'+encodeURIComponent(slug);
export function readCart(storage,slug) {
 try {
  if(typeof storage==='function')storage=storage();
  const value=JSON.parse(storage.getItem(cartKey(slug))||'[]');
  return Array.isArray(value)?value.filter(x=>x&&typeof x.dishId==='string'&&typeof x.portionId==='string'&&Number.isInteger(x.qty)&&x.qty>0&&x.qty<=99):[];
 }catch{return [];}
}

import {createHash} from 'node:crypto';

export function modelIdentity(modelUrl,dimensions,upAxis='auto') {
 const dims=['width','depth','height'].map(k=>Number(dimensions?.[k]));
 if(!dims.every(n=>Number.isFinite(n)&&n>0))return '';
 return createHash('sha256').update(JSON.stringify([modelUrl,...dims,upAxis])).digest('hex');
}
const safeUrl=(value,ext)=>typeof value==='string'&&new RegExp('^/(?:media|assets)/[a-zA-Z0-9_-]+\\.'+ext+'$').test(value)?value:'';
export function selectModelAssets(portion) {
 const posterUrl=(portion.photos||[]).map(x=>safeUrl(x,'(?:jpg|jpeg|png|webp|svg)')).find(Boolean)||'/assets/placeholder.svg';
 const none={originalUrl:'',webUrl:'',iosUrl:'',posterUrl};
 if(portion.modelStatus!=='ready')return none;
 const originalUrl=safeUrl(portion.modelUrl,'glb');
 const a=portion.modelAssets;
 if(!originalUrl||!a||a.identity!==modelIdentity(portion.modelUrl,portion.dimensions,portion.upAxis)||!/^[a-f0-9]{64}$/.test(a.sourceSha256||''))return {...none,originalUrl};
 return {originalUrl,webUrl:safeUrl(a.webUrl,'glb'),iosUrl:safeUrl(a.iosUrl,'usdz'),posterUrl:safeUrl(a.posterUrl,'(?:jpg|jpeg|png|webp)')||posterUrl};
}
export function invalidateModelAssets(portion){delete portion.modelAssets;delete portion.reviewedAt;delete portion.reviewedBy;}
const fields=(object,names)=>Object.fromEntries(names.filter(k=>object[k]!==undefined).map(k=>[k,object[k]]));
export function publicDish(dish) {
 return {...fields(dish,['id','name','category','description','allergens','prepMinutes','featured','published']),portions:dish.portions.map(p=>{
  const assets=selectModelAssets(p);
  return {...fields(p,['id','label','grams','price','dimensions','upAxis','photos','modelStatus','modelReport','demo']),modelUrl:assets.originalUrl,assets};
 })};
}

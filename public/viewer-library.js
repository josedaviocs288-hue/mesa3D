let pending;
export function ensureViewerLibrary({registry=customElements,load=()=>import('/vendor/model-viewer.min.js?retry='+Date.now()),timeoutMs=10000}={}) {
 if(registry.get('model-viewer'))return Promise.resolve(registry.get('model-viewer'));
 if(pending)return pending;
 let timer;
 pending=Promise.race([
  Promise.resolve().then(load).then(()=>registry.whenDefined('model-viewer')).then(()=>registry.get('model-viewer')),
  new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('Visualizador 3D indisponível. A foto permanece disponível.')),timeoutMs);}),
 ]).finally(()=>{clearTimeout(timer);pending=undefined;});
 return pending;
}

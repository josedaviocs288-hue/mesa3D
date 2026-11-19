export function isAppleMobile(userAgent,platform,touchPoints){return /iPhone|iPad|iPod/i.test(userAgent)||(platform==='MacIntel'&&touchPoints>1);}
export function supportsWebGl2(canvas){try{const c=canvas.getContext('webgl2');if(!c)return false;c.getExtension('WEBGL_lose_context')?.loseContext();return true;}catch{return false;}}
export function browserCapabilities(){return {apple:isAppleMobile(navigator.userAgent,navigator.platform,navigator.maxTouchPoints),webgl:supportsWebGl2(document.createElement('canvas')),secure:window.isSecureContext,origin:location.origin};}

import test from 'node:test';
import assert from 'node:assert/strict';
import {createViewerController} from '../public/viewer-controller.js';
class Element extends EventTarget {
 hidden=false;disabled=false;textContent='';src='';attrs={};
 setAttribute(k,v){this.attrs[k]=v;}removeAttribute(k){delete this.attrs[k];if(k==='src')this.src='';}
 getAttribute(k){return this.attrs[k];}click(){this.clicked=true;this.dispatchEvent(new Event('click'));}
}
const emit=(el,name,detail={})=>el.dispatchEvent(new CustomEvent(name,{detail}));
const p=(id='one')=>({id,modelStatus:'ready',modelUrl:'/media/'+id+'.glb',photos:['/assets/photo.jpg'],assets:{originalUrl:'/media/'+id+'.glb',webUrl:'/media/optimized.glb',posterUrl:'/assets/photo.jpg',iosUrl:''}});
function setup(caps={}){
 const elements=Object.fromEntries(['viewer','photo','feedback','retryButton','arButton','quickLookLink'].map(k=>[k,new Element()]));
 let activations=0;elements.viewer.canActivateAR=true;elements.viewer.activateAR=()=>{activations++};
 const timers=new Set();const c=createViewerController({...elements,detectCapabilities:()=>({webgl:true,apple:false,secure:true,origin:'http://localhost',...caps}),setTimer:fn=>{timers.add(fn);return fn},clearTimer:fn=>timers.delete(fn)});
 return {...elements,c,timers,activations:()=>activations};
}
test('noWebGlKeepsPhoto',()=>{const s=setup({webgl:false});s.c.select(p());assert.equal(s.photo.hidden,false);assert.equal(s.viewer.src,'');assert.match(s.feedback.textContent,/3D/);s.c.destroy()});
test('androidRequiresClick',()=>{const s=setup();s.c.select(p());emit(s.viewer,'load',{url:'/media/optimized.glb'});assert.equal(s.activations(),0);s.arButton.click();assert.equal(s.activations(),1);s.c.destroy()});
test('matchingUsdzUsesNativeLink',()=>{const s=setup({apple:true,webgl:false});const portion=p();portion.assets.iosUrl='/media/model.usdz';s.c.select(portion);assert.equal(s.quickLookLink.hidden,false);assert.match(s.quickLookLink.href,/allowsContentScaling=0/);assert.equal(s.viewer.src,'');s.c.destroy()});
test('staleLoadIgnored',()=>{const s=setup();s.c.select(p());const next=p('two');next.assets.webUrl='/media/two-web.glb';s.c.select(next);emit(s.viewer,'load',{url:'/media/optimized.glb'});assert.equal(s.arButton.disabled,true);assert.equal(s.photo.hidden,false);emit(s.viewer,'load',{url:'/media/two-web.glb'});assert.equal(s.photo.hidden,true);s.c.destroy()});
test('failedOptimizedModelRetriesOriginal',()=>{const s=setup();s.c.select(p());emit(s.viewer,'error',{type:'loadfailure'});assert.equal(s.photo.hidden,false);assert.equal(s.retryButton.hidden,false);s.retryButton.click();assert.equal(s.viewer.src,'/media/one.glb');s.c.destroy()});
test('contextLossRestoresPhoto; destroyClearsTimers',()=>{const s=setup();s.c.select(p());emit(s.viewer,'load',{url:'/media/optimized.glb'});emit(s.viewer,'error',{type:'webglcontextlost'});assert.equal(s.photo.hidden,false);s.c.retry();assert.ok(s.timers.size);s.c.destroy();assert.equal(s.timers.size,0)});
test('timeoutKeepsPhotoAndOffersRetry',()=>{const s=setup();s.c.select(p());for(const fn of s.timers)fn();assert.equal(s.photo.hidden,false);assert.equal(s.retryButton.hidden,false);s.c.destroy()});

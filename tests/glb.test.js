import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {calibrateGlb,getBounds,inspectGlb} from '../glb.js';

const source=await fs.readFile(new URL('../public/assets/filet-source.glb',import.meta.url));

test('GLB de porções diferentes mantém dimensões físicas distintas',()=>{
  for(const dimensions of [{width:21,depth:19,height:6},{width:27,depth:25,height:8}]){
    const output=calibrateGlb(source,dimensions).buffer;
    const {size,min}=getBounds(output);
    assert.ok(Math.abs(size[0]-dimensions.width/100)<1e-5);
    assert.ok(Math.abs(size[1]-dimensions.height/100)<1e-5);
    assert.ok(Math.abs(size[2]-dimensions.depth/100)<1e-5);
    assert.ok(Math.abs(min[1])<1e-5,'a base deve tocar o plano da mesa');
  }
});

test('medida zero é rejeitada',()=>{
  assert.throws(()=>calibrateGlb(source,{width:0,depth:20,height:5}),/Medidas físicas/);
});

test('porção real com proporções incompatíveis não é deformada',()=>{
  assert.throws(()=>calibrateGlb(source,{width:20,depth:20,height:20},'z',true),/proporções do GLB/);
});

test('escala de prato real é uniforme e preserva o formato',()=>{
  const realSource=fs.readFile(new URL('../public/assets/filet-demo-optimized.glb',import.meta.url));
  return realSource.then(buffer=>{
  const result=calibrateGlb(buffer,{width:34,depth:20,height:3.1},'z',true);
  assert.ok(Math.max(...result.appliedScale)-Math.min(...result.appliedScale)<1e-12);
  assert.ok(result.actualSizeCm.every((v,i)=>Math.abs(v-[34,3.1,20][i])<0.2));
  assert.ok(inspectGlb(result.buffer).triangles>0);
  });
});

test('régua de referência mede dez centímetros no GLB',async()=>{
  const ruler=await fs.readFile(new URL('../public/assets/regua-10cm.glb',import.meta.url));
  const bounds=getBounds(ruler);
  assert.ok(Math.abs(bounds.size[0]-0.1)<1e-6);
  assert.ok(Math.abs(bounds.min[1])<1e-6);
});

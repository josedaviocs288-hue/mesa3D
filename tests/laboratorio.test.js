import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {inspectGlb,calibrateGlb,getBounds} from '../glb.js';
const root=path.resolve(fileURLToPath(new URL('..',import.meta.url)));
test('modelo demonstrativo pode ser analisado sem upload remoto',async()=>{
 const glb=await fs.readFile(path.join(root,'public/assets/filet-demo-optimized.glb'));
 const report=inspectGlb(glb);
 assert.ok(report.triangles>0,'geometria com triângulos');
 assert.ok(report.bytes<=20*1024*1024,'modelo cabe no limite móvel');
 assert.ok(report.triangles<=180000,'triângulos dentro da cota');
 const calibrated=calibrateGlb(glb,{width:34,depth:20,height:3.1},'z',true);
 const bounds=getBounds(calibrated.buffer);
 assert.ok(Math.abs(bounds.size[0]-.34)<.002);
 assert.ok(Math.abs(bounds.size[1]-.031)<.002);
 assert.ok(Math.abs(bounds.size[2]-.2)<.002);
});
test('arquivo inválido é rejeitado sem geometria criada artificialmente',()=>{
 assert.throws(()=>inspectGlb(Buffer.from('não é GLB')),/inválido/);
});
test('laboratório tem visualizador AR e controle de qualidade',async()=>{
 const html=await fs.readFile(path.join(root,'public/laboratorio-3d.html'),'utf8');
 assert.match(html,/<model-viewer/);
 assert.match(html,/ar-modes="webxr scene-viewer quick-look"/);
 assert.match(html,/id="referenceImages"/);
 assert.match(html,/id="analyze"/);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {Local3D,nativeStatus} from '../local-3d.js';
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9WlJhL8AAAAASUVORK5CYII=','base64');

test('ferramentas locais reportam requisitos, sem inventar geracao',()=>{
  const status=nativeStatus();
  assert.deepEqual(Object.keys(status.tools),['DensifyPointCloud','ReconstructMesh','TextureMesh','TransformScene','CreateStructure','colmap','InterfaceCOLMAP']);
  assert.equal(status.ready,(status.tools.CreateStructure || (status.tools.colmap && status.tools.InterfaceCOLMAP)) && ['DensifyPointCloud','ReconstructMesh','TextureMesh'].every(name=>status.tools[name]));
  assert.equal(status.minPhotos,20);
});

test('20 fotos locais geram trabalho rastreavel sem fingir sucesso',async()=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'mesa-local3d-'));
  try{
    const engine=new Local3D(dir);await engine.init();
    const user={id:'admin-a',role:'restaurant',restaurant_id:'loja-a'};
    const paths=[];
    for(let i=0;i<20;i++){
      const file=path.join(dir,`foto-${i}.png`);await fs.writeFile(file,png);paths.push({path:file,size:png.length});
    }
    const job=await engine.create({files:paths,user,restaurantId:'loja-a',dishId:'prato',portionId:'porcao'});
    assert.equal(job.status,'queued');assert.equal(job.photos,20);
    assert.equal(engine.get(job.id,{id:'admin-b',role:'owner'}),null);
    assert.equal(engine.get(job.id,{id:'admin-a',role:'restaurant',restaurant_id:'loja-b'}),null);
    assert.ok(engine.get(job.id,user));
    await assert.rejects(engine.resultFile(engine.get(job.id,user)),/ainda nao esta pronto/);
    const saved=JSON.parse(await fs.readFile(path.join(engine.base,job.id,'job.json'),'utf8'));
    assert.equal(saved.photos,20);
    assert.equal((await fs.readdir(path.join(engine.base,job.id,'images'))).length,20);
    await new Promise(r=>setTimeout(r,400));
    if(!nativeStatus().ready){
      assert.equal(engine.get(job.id,user).status,'failed');
      assert.match(engine.get(job.id,user).error,/Motor 3D não disponível/);
    }
  }finally{await fs.rm(dir,{force:true,recursive:true});}
});

test('rejeita quantidade e formato incorretos',async()=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'mesa-local3d-'));
  try{
    const engine=new Local3D(dir);await engine.init();
    const user={id:'x',role:'restaurant',restaurant_id:'a'};
    await assert.rejects(engine.create({files:[],user,restaurantId:'a'}),/entre 20 e 80/);
    const invalid=[];
    for(let i=0;i<20;i++){const file=path.join(dir,`bad${i}.png`);await fs.writeFile(file,'arquivo nao e foto');invalid.push({path:file,size:17})}
    await assert.rejects(engine.create({files:invalid,user,restaurantId:'a'}),/nao e JPG ou PNG valido/);
  }finally{await fs.rm(dir,{force:true,recursive:true});}
});

test('recupera trabalho interrompido como falha, nunca como pronto',async()=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'mesa-local3d-'));
  try{
    const engine=new Local3D(dir);await engine.init();
    const id='11111111-2222-3333-4444-555555555555';
    await fs.mkdir(path.join(engine.base,id));
    await fs.writeFile(path.join(engine.base,id,'job.json'),JSON.stringify({id,status:'processing',owner:'x',restaurantId:'a'}));
    const next=new Local3D(dir);await next.init();
    assert.equal(next.jobs.get(id).status,'failed');
    assert.match(next.jobs.get(id).error,/encerrado/);
  }finally{await fs.rm(dir,{force:true,recursive:true});}
});

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {Local3D,nativeStatus,helpProcessWorks} from '../local-3d.js';
const root=path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const photo=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9WlJhL8AAAAASUVORK5CYII=','base64');
const sample=path.join(root,'public/assets/filet-demo-optimized.glb');

test('pacote tem instalador, inicio e configuracao sem senha fixa',async()=>{
  const installer=await fs.readFile(path.join(root,'instalador/instalar-windows.ps1'),'utf8');
  const starter=await fs.readFile(path.join(root,'instalador/iniciar-windows.ps1'),'utf8');
  const config=await fs.readFile(path.join(root,'tools/configurar-local.mjs'),'utf8');
  const checker=await fs.readFile(path.join(root,'Conferir-3D-Local.bat'),'utf8');
  assert.match(installer,/nodejs\.org\/dist/);
  assert.match(installer,/Get-FileHash/);
  assert.match(installer,/github\.com\/cdcseacave\/openMVS\/releases\/download\/v2\.4\.0/);
  assert.match(installer,/UTF8Encoding\(\$false\)/);
  assert.match(starter,/http:\/\/127\.0\.0\.1:8080/);
  assert.match(config,/randomBytes\(18\)/);
  assert.match(checker,/conferir-windows\.ps1/);
});

test('corrige detecao do --help com codigo 1 e sem captura de console no Windows',async()=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'mesa-motor-'));
  try{
    const exe=path.join(dir,'DensifyPointCloud.exe');await fs.writeFile(exe,'mock executavel');
    assert.equal(helpProcessWorks({status:1,stdout:'',stderr:''},'DensifyPointCloud',exe,'win32'),true);
    assert.equal(helpProcessWorks({status:1,stdout:'',stderr:''},'DensifyPointCloud',exe,'linux'),false);
    assert.equal(helpProcessWorks({status:1,stdout:'',stderr:''},'DensifyPointCloud',path.join(dir,'faltando.exe'),'win32'),false);
    assert.equal(helpProcessWorks({status:-1073741515,stdout:'',stderr:''},'DensifyPointCloud',exe,'win32'),false);
    assert.equal(helpProcessWorks({status:null,error:new Error('ENOENT')},'DensifyPointCloud',exe,'win32'),false);
    assert.equal(helpProcessWorks({status:1,stdout:'OpenMVS x64\nAvailable options:'},'DensifyPointCloud',exe,'linux'),true);
  }finally{await fs.rm(dir,{recursive:true,force:true})}
});

async function mockPipeline(useColmap){
  const base=await fs.mkdtemp(path.join(os.tmpdir(),'mesa3d-mock-foto-'));
  const oldDir=process.env.MESA3D_3D_BIN_DIR,oldColmap=process.env.MESA3D_COLMAP_BIN;
  try{
    const bin=path.join(base,'bin');await fs.mkdir(bin);
    const mock=`#!${process.execPath}\n`+
      `import fs from 'node:fs';\nimport path from 'node:path';\n`+
      `const name=path.basename(process.argv[1]),args=process.argv.slice(2);\n`+
      `if(args.includes('--help')){console.log('Usage: '+name+' Available options FeatureExtraction.use_gpu FeatureMatching.use_gpu');process.exit(1)}\n`+
      `const value=flag=>args[args.indexOf(flag)+1];const cwd=process.cwd();\n`+
      `if(name==='CreateStructure')fs.writeFileSync(value('--export-mvs'),'mock scene cameras from photogrammetry');\n`+
      `if(name==='colmap' && args[0]==='mapper')fs.mkdirSync(path.join(value('--output_path'),'0'),{recursive:true});\n`+
      `if(name==='InterfaceCOLMAP')fs.writeFileSync(value('-o'),'mock converted colmap scene cameras');\n`+
      `if(name==='DensifyPointCloud')fs.writeFileSync(value('-o'),'mock dense point cloud data is available');\n`+
      `if(name==='ReconstructMesh')fs.writeFileSync(path.join(cwd,'scene_dense_mesh.ply'),'mock mesh surface that is available');\n`+
      `if(name==='TextureMesh'){if(!args.includes('--export-type')||value('--export-type')!=='glb')process.exit(8);fs.writeFileSync(value('-o'),'mock scene textures and geometry');fs.copyFileSync(${JSON.stringify(sample)},path.join(cwd,'scene_dense_mesh_texture.glb'))};\n`;
    const tools=['DensifyPointCloud','ReconstructMesh','TextureMesh','InterfaceCOLMAP',...(useColmap?['colmap']:['CreateStructure'])];
    for(const name of tools){const exe=path.join(bin,name);await fs.writeFile(exe,mock);await fs.chmod(exe,0o755)}
    process.env.MESA3D_3D_BIN_DIR=bin;
    if(useColmap)process.env.MESA3D_COLMAP_BIN=path.join(bin,'colmap');else delete process.env.MESA3D_COLMAP_BIN;
    const status=nativeStatus();assert.equal(status.ready,true);assert.equal(status.mode,useColmap?'colmap':'openmvs');
    const engine=new Local3D(base);await engine.init();
    const user={id:'tester',role:'restaurant',restaurant_id:'a'};
    const photos=[];
    for(let i=0;i<20;i++){const file=path.join(base,`img${i}.png`);await fs.writeFile(file,photo);photos.push({path:file,size:photo.length})}
    const job=await engine.create({files:photos,user,restaurantId:'a'});
    for(let i=0;i<150;i++){
      if(['review','failed'].includes(engine.get(job.id,user).status))break;
      await new Promise(r=>setTimeout(r,100));
    }
    const completed=engine.get(job.id,user);
    assert.equal(completed.status,'review',completed.error);
    const result=await fs.readFile(await engine.resultFile(completed));
    assert.equal(result.subarray(0,4).toString(),'glTF');
    // O GLB acima e um arquivo de exemplo COPIADO pelo mock, nao fotogrametria real.
  }finally{
    if(oldDir===undefined)delete process.env.MESA3D_3D_BIN_DIR;else process.env.MESA3D_3D_BIN_DIR=oldDir;
    if(oldColmap===undefined)delete process.env.MESA3D_COLMAP_BIN;else process.env.MESA3D_COLMAP_BIN=oldColmap;
    await fs.rm(base,{recursive:true,force:true});
  }
}
test('pipeline OpenMVS nativo so aprova GLB apos etapas reais simuladas',async t=>{
  if(process.platform==='win32'){t.skip('Mock executavel POSIX');return}
  await mockPipeline(false);
});
test('pipeline COLMAP + OpenMVS funciona sem CreateStructure (mock)',async t=>{
  if(process.platform==='win32'){t.skip('Mock executavel POSIX');return}
  await mockPipeline(true);
});

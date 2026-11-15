// Reconstrucao local de fotos reais. Nao usa API nem cria geometria simulada.
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {spawn, spawnSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {inspectGlb, getBounds} from './glb.js';

const commonTools=['DensifyPointCloud','ReconstructMesh','TextureMesh'];
const optionalTools=['TransformScene','CreateStructure'];
const root=path.dirname(fileURLToPath(import.meta.url));
const maxPhotos=80, minPhotos=20, maxBytes=300*1024*1024;
const MAX_LOG=16000;
const supported = buffer => buffer.subarray(0,3).equals(Buffer.from([255,216,255]))?'jpg':
  buffer.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))?'png':null;

// Quando o .env nao foi carregado, localiza os binarios instalados automaticamente.
// Isto tambem permite usar o script de conferencia fora do iniciador.
const discovered=new Map();
function findInstalled(name){
  if(discovered.has(name))return discovered.get(name);
  const base=path.join(root,'.mesa3d',name==='colmap'?'colmap':'openmvs');
  const exe=process.platform==='win32'?name+'.exe':name;
  const queue=[base];let found='';
  for(let visited=0;queue.length && visited<1000;visited++){
    const dir=queue.shift();
    let entries;
    try{entries=fsSync.readdirSync(dir,{withFileTypes:true})}catch{continue}
    const file=entries.find(e=>e.isFile()&&e.name.toLowerCase()===exe.toLowerCase());
    if(file){found=path.join(dir,file.name);break}
    for(const e of entries)if(e.isDirectory())queue.push(path.join(dir,e.name));
  }
  discovered.set(name,found);
  return found;
}
export function nativeCommand(name){
  if(name==='colmap')return process.env.MESA3D_COLMAP_BIN || findInstalled('colmap') || 'colmap';
  const override=process.env.MESA3D_3D_BIN_DIR;
  if(override)return path.join(override,process.platform==='win32'?name+'.exe':name);
  return findInstalled(name) || name;
}
// Algumas builds Windows do OpenMVS escrevem a ajuda diretamente no console e
// retornam 1 mesmo quando abrem sem falha. 0/1 podem ser saidas de --help;
// 0xC0000135 (DLL ausente), timeout e arquivos inexistentes nao sao aceitos.
export function helpProcessWorks({status,error,signal,stdout='',stderr=''},name,command,platform=process.platform){
  if(error||signal||!Number.isInteger(status))return false;
  const output=`${stdout}\n${stderr}`;
  if(status===0)return true;
  if(status!==1)return false;
  if(/(OpenMVS|Available options|Usage:|Generic options|COLMAP|Command line:)/i.test(output))return true;
  // Evidencia do usuario: no Windows a ajuda do OpenMVS v2.4.0 aparece no
  // console, mas nao chega a pipe do Node/PowerShell. Exigimos caminho local
  // explicitamente existente, nome esperado e uma finalizacao normal.
  return platform==='win32' && name!=='colmap' &&
    path.isAbsolute(command) && fsSync.existsSync(command) &&
    path.basename(command).toLowerCase()===`${name.toLowerCase()}.exe`;
}
function existsNative(name){
  const command=nativeCommand(name);
  const result=spawnSync(command,['--help'],{encoding:'utf8',timeout:12000,windowsHide:true,maxBuffer:2*1024*1024});
  return helpProcessWorks(result,name,command);
}
export function nativeStatus(){
  const names=[...commonTools,...optionalTools,'colmap','InterfaceCOLMAP'];
  const tools=Object.fromEntries(names.map(name=>[name,existsNative(name)]));
  const native=commonTools.every(name=>tools[name])&&tools.CreateStructure;
  const legacy=commonTools.every(name=>tools[name])&&tools.colmap&&tools.InterfaceCOLMAP;
  const missing=commonTools.filter(name=>!tools[name]);
  if(!native&&!legacy)missing.push('CreateStructure (ou COLMAP + InterfaceCOLMAP)');
  return {ready:!!(native||legacy),mode:native?'openmvs':legacy?'colmap':null,tools,
    required:commonTools,optional:optionalTools,missing,
    engine:native?'OpenMVS nativo (CPU)':legacy?'COLMAP + OpenMVS (CPU)':'Não instalado',minPhotos,maxPhotos};
}

function checkPath(file,base){
  const p=path.resolve(base,file);
  if(!p.startsWith(path.resolve(base)+path.sep))throw new Error('Caminho invalido.');
  return p;
}
async function safeJson(file,value){
  await fs.writeFile(file+'.tmp',JSON.stringify(value,null,2));
  await fs.rename(file+'.tmp',file);
}

function colmapOption(command,modern,old){
  const p=spawnSync(nativeCommand('colmap'),[command,'--help'],{encoding:'utf8',timeout:15000,maxBuffer:2*1024*1024,windowsHide:true});
  const output=(p.stdout||'')+'\n'+(p.stderr||'');
  // COLMAP 4.x usa FeatureExtraction/FeatureMatching; builds antigas usam Sift*.
  if(output.includes(modern))return '--'+modern;
  if(output.includes(old))return '--'+old;
  // No Windows, a saida de --help pode ir diretamente para o console.
  return '--'+modern;
}
async function verifyOutput(file,step){
  let stat;
  try{stat=await fs.stat(file)}catch{throw new Error(`${step} terminou sem gerar ${path.basename(file)}. Confira processamento.log.`)}
  if(!stat.isFile()||stat.size<16)throw new Error(`${step} gerou arquivo vazio/incompleto: ${path.basename(file)}.`);
}

export class Local3D {
  constructor(dataDir){
    this.base=path.join(dataDir,'reconstrucoes');
    this.jobs=new Map();
    this.queue=[];
    this.running=null;
  }
  async init(){
    await fs.mkdir(this.base,{recursive:true});
    for(const name of await fs.readdir(this.base)){
      if(!/^[0-9a-f-]{36}$/.test(name))continue;
      try{
        const item=JSON.parse(await fs.readFile(path.join(this.base,name,'job.json'),'utf8'));
        if(['processing','queued'].includes(item.status)){
          item.status='failed';item.error='O servidor foi encerrado durante o processamento. Envie as fotos novamente.';
          await safeJson(path.join(this.base,name,'job.json'),item);
        }
        this.jobs.set(item.id,item);
      }catch{}
    }
  }
  public(job){return {id:job.id,status:job.status,step:job.step,progress:job.progress,photos:job.photos,createdAt:job.createdAt,error:job.error||'',log:job.log||'',hasModel:job.status==='review',dishId:job.dishId||'',portionId:job.portionId||''};}
  get(id,user){
    const job=this.jobs.get(id);
    if(!job || job.owner!==user.id || (user.role!=='owner'&&job.restaurantId!==user.restaurant_id))return null;
    return job;
  }
  async update(job,patch){Object.assign(job,patch);await safeJson(path.join(this.base,job.id,'job.json'),job);}
  async create({files,user,restaurantId,dishId,portionId}){
    if(!Array.isArray(files)||files.length<minPhotos||files.length>maxPhotos)
      throw new Error(`Envie entre ${minPhotos} e ${maxPhotos} fotografias da mesma porcao.`);
    const total=files.reduce((s,f)=>s+f.size,0);
    if(total>maxBytes)throw new Error('Limite de 300 MB de fotos por reconstrucao.');
    if(this.queue.length>=2 || (this.running && this.queue.length>=1))throw new Error('Fila cheia; tente novamente depois da reconstrucao atual.');
    const job={id:randomUUID(),owner:user.id,restaurantId,dishId,portionId,createdAt:new Date().toISOString(),status:'queued',step:'Aguardando processamento',progress:0,photos:files.length,log:'',error:''};
    const folder=path.join(this.base,job.id),imageDir=path.join(folder,'images');
    await fs.mkdir(imageDir,{recursive:true});
    try{
      for(let i=0;i<files.length;i++){
        const f=files[i],bytes=await fs.readFile(f.path);
        const extension=supported(bytes);
        if(!extension)throw new Error(`Foto ${i+1} nao e JPG ou PNG valido.`);
        await fs.rename(f.path,path.join(imageDir,`foto-${String(i+1).padStart(3,'0')}.${extension}`));
      }
      await safeJson(path.join(folder,'job.json'),job);
      this.jobs.set(job.id,job);this.queue.push(job.id);
      setImmediate(()=>this.next());
      return this.public(job);
    }catch(e){await fs.rm(folder,{recursive:true,force:true});throw e}
  }
  async next(){
    if(this.running||!this.queue.length)return;
    const id=this.queue.shift(),job=this.jobs.get(id);
    this.running=id;
    try{await this.process(job)}
    catch(e){await this.update(job,{status:'failed',error:String(e.message||e).slice(0,700),step:'Falha na reconstrucao'});}
    finally{this.running=null;setImmediate(()=>this.next());}
  }
  async command(job,index,label,command,args,cwd,total=9){
    await this.update(job,{status:'processing',step:label,progress:Math.round(index/total*90)});
    const logFile=path.join(this.base,job.id,'processamento.log');
    await new Promise((resolve,reject)=>{
      const child=spawn(nativeCommand(command),args,{cwd,windowsHide:true,env:{...process.env,OMP_NUM_THREADS:process.env.MESA3D_3D_THREADS||String(Math.min(4,os.cpus().length))}});
      let tail='',done=false;
      const finish=(error)=>{if(done)return;done=true;clearTimeout(timeout);error?reject(error):resolve()};
      const timeout=setTimeout(()=>{
        child.kill();
        finish(new Error(`Tempo limite em ${label} (120 minutos). Consulte processamento.log.`));
      },120*60000);
      const onData=data=>{
        const part=String(data);tail=(tail+part).slice(-MAX_LOG);
        job.log=tail;
        fs.appendFile(logFile,part).catch(()=>{});
      };
      child.stdout.on('data',onData);child.stderr.on('data',onData);
      child.on('error',error=>finish(new Error(`${command}: ${error.message}`)));
      child.on('close',code=>finish(code===0?null:new Error(`${label} falhou (codigo ${code}). Consulte processamento.log. ${(tail||'').slice(-350)}`)));
    });
  }
  async process(job){
    const status=nativeStatus();
    if(!status.ready)throw new Error('Motor 3D não disponível. Faltam: '+status.missing.join(', '));
    const dir=path.join(this.base,job.id),images=path.join(dir,'images');
    const scene=path.join(dir,'scene.mvs');
    const denseScene=path.join(dir,'scene_dense.mvs');
    const densePoints=path.join(dir,'scene_dense.ply');
    const mesh=path.join(dir,'scene_dense_mesh.ply');
    const texturedScene=path.join(dir,'scene_dense_mesh_texture.mvs');
    const calls=[];
    if(status.mode==='openmvs'){
      // CreateStructure so e usado nas versoes que o incluem.
      calls.push(['Alinhando fotos e reconstruindo câmeras (OpenMVS)','CreateStructure',
        ['-s',images,'-o',path.join(dir,'scene.sfm'),'--export-mvs',scene,'--extract-colors','1']]);
    }else{
      const sparse=path.join(dir,'sparse'),dense=path.join(dir,'dense');
      await fs.mkdir(sparse,{recursive:true});await fs.mkdir(dense,{recursive:true});
      const database=path.join(dir,'database.db');
      const featureOption=colmapOption('feature_extractor','FeatureExtraction.use_gpu','SiftExtraction.use_gpu');
      const matchOption=colmapOption('exhaustive_matcher','FeatureMatching.use_gpu','SiftMatching.use_gpu');
      const imageSizeOption=colmapOption('feature_extractor','FeatureExtraction.max_image_size','SiftExtraction.max_image_size');
      const commonMemory=['--ImageReader.single_camera','1'];
      calls.push(
        ['Encontrando pontos nas fotografias','colmap',['feature_extractor','--database_path',database,'--image_path',images,...commonMemory,featureOption,'0',imageSizeOption,'1600','--SiftExtraction.max_num_features','4096']],
        ['Combinando fotografias','colmap',['exhaustive_matcher','--database_path',database,matchOption,'0']],
        ['Reconstruindo posições das câmeras','colmap',['mapper','--database_path',database,'--image_path',images,'--output_path',sparse]],
      );
      for(let i=0;i<calls.length;i++)await this.command(job,i,calls[i][0],calls[i][1],calls[i][2],dir,8);
      const submodels=(await fs.readdir(sparse)).filter(n=>/^\d+$/.test(n)).sort((a,b)=>Number(a)-Number(b));
      if(!submodels.length)throw new Error('Não foi possível alinhar as fotos. Fotografe com sobreposição e luz constante.');
      calls.length=0;
      calls.push(
        ['Corrigindo lentes e preparando imagens','colmap',['image_undistorter','--image_path',images,'--input_path',path.join(sparse,submodels[0]),'--output_path',dense,'--output_type','COLMAP','--max_image_size','1600']],
        ['Convertendo câmeras para OpenMVS','InterfaceCOLMAP',['-i',dense,'-o',scene,'--image-folder',path.join(dense,'images')]],
      );
    }
    calls.push(
      ['Criando nuvem densa de pontos (CPU)','DensifyPointCloud',['-i',scene,'-o',denseScene,'--resolution-level','2','--number-views','4']],
      ['Gerando superfície 3D','ReconstructMesh',['-i',denseScene,'-p',densePoints]],
      // O OpenMVS 2.4.0 oferece --export-type glb em TextureMesh, mas nem
      // todas as builds do TransformScene incluem --convert. Exportar aqui
      // evita depender dessa opcao ausente na versao do usuario.
      ['Aplicando textura e exportando GLB','TextureMesh',['-i',denseScene,'-m',mesh,'-o',texturedScene,'--export-type','glb']]
    );
    const offset=status.mode==='colmap'?3:0,steps=calls.length+offset;
    for(let i=0;i<calls.length;i++){
      await this.command(job,offset+i,calls[i][0],calls[i][1],calls[i][2],dir,steps);
      const name=calls[i][1];
      // Falha explicita e contextual se o binario retornar 0 sem escrever o
      // artefato necessario para a etapa seguinte.
      if(name==='CreateStructure'||name==='InterfaceCOLMAP')await verifyOutput(scene,name);
      if(name==='DensifyPointCloud')await verifyOutput(denseScene,name);
      if(name==='ReconstructMesh'){
        await verifyOutput(mesh,name);
        // Algumas builds escrevem o MVS opcionalmente; a texturizacao usa a
        // cena densa e a malha PLY, como no pipeline oficial.
      }
      // TextureMesh pode gerar GLB diretamente sem persistir o projeto .mvs;
      // o arquivo GLB e sua integridade sao verificados logo abaixo.
    }
    const candidates=(await fs.readdir(dir)).filter(x=>x.toLowerCase().endsWith('.glb'));
    if(!candidates.length)throw new Error('TextureMesh não exportou GLB. Confira processamento.log e se a versão oferece --export-type glb.');
    const source=path.join(dir,candidates.find(n=>n.includes('texture'))||candidates[0]);
    const data=await fs.readFile(source);
    let report;
    try{report=inspectGlb(data);getBounds(data)}catch(e){throw new Error(`GLB exportado inválido: ${e.message}`)}
    if(report.triangles<1)throw new Error('GLB exportado não contém superfície triangular.');
    await fs.copyFile(source,path.join(dir,'resultado.glb'));

    await this.update(job,{status:'review',step:'GLB gerado. Revise antes de publicar.',progress:100});
  }

  async resultFile(job){if(job.status!=='review')throw new Error('O modelo ainda nao esta pronto.');return checkPath('resultado.glb',path.join(this.base,job.id));}
}

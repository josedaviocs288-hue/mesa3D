import express from 'express';
import multer from 'multer';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {createWriteStream} from 'node:fs';
import {readFile,writeFile,mkdir,rename,unlink} from 'node:fs/promises';
import {Transform,pipeline} from 'node:stream';
import {calibrateGlb,inspectGlb} from '../glb.js';
import {modelIdentity,invalidateModelAssets} from '../model-assets.js';
import {readiness} from './readiness.js';
import {MAX_PHOTO_BYTES,MAX_CAPTURE_BYTES,safeJobDirectory,safeArtifact,removeJobDirectory} from './files.js';

export const portionSnapshot=p=>createHash('sha256').update(JSON.stringify([p.id,p.modelUrl||'',p.modelSource||'',p.photos||[],p.dimensions,p.upAxis||'auto'])).digest('hex');
export const publicJob=j=>({id:j.id,dishId:j.dishId,portionId:j.portionId,kind:j.kind,status:j.status,stage:j.stage,attempts:j.attempts,cancelRequested:j.cancelRequested,errorCode:j.errorCode,createdAt:j.createdAt,updatedAt:j.updatedAt});
const png=Buffer.from('89504e470d0a1a0a','hex');
function imageType(bytes){if(bytes.subarray(0,8).equals(png))return 'png';if(bytes[0]===255&&bytes[1]===216&&bytes[2]===255)return 'jpg';throw new Error('INVALID_PHOTOS');}
function boundedStorage(){return {
 _handleFile(req,file,done){
  const filename=randomUUID(),target=path.join(req.captureDirectory,'photos',filename);let size=0;
  const bound=new Transform({transform(chunk,encoding,callback){size+=chunk.length;req.captureBytes+=chunk.length;if(req.captureBytes>MAX_CAPTURE_BYTES)return callback(new Error('CAPTURE_TOO_LARGE'));callback(null,chunk);}});
  pipeline(file.stream,bound,createWriteStream(target,{flags:'wx',mode:0o600}),async error=>{if(error){await unlink(target).catch(()=>{});done(error);}else done(null,{path:target,filename,size});});
 },
 _removeFile(req,file,done){unlink(file.path).then(()=>done(),done);},
};}
export function createReconstructionRouter({db,store,dataDir,requireUser,shopContext,getShop,getCatalog,getReadiness=()=>readiness({store,dataDir})}){
 const router=express.Router();router.use((req,res,next)=>{res.set('Cache-Control','private, no-store');next()});router.use(requireUser,shopContext);const uploadsInFlight=new Set();
 const own=(req,res)=>{const j=store.get(req.params.id);if(!j||j.restaurantId!==getShop(req).id){res.status(404).json({error:'Tarefa não encontrada.'});return null;}return j;};
 router.get('/status',async(req,res,next)=>{try{res.json(await getReadiness())}catch(e){next(e)}});
 router.get('/jobs',(req,res)=>{const {dishId,portionId}=req.query;if((dishId||portionId)&&(typeof dishId!=='string'||typeof portionId!=='string'||dishId.length>80||portionId.length>80))return res.status(400).json({error:'Informe prato e porção juntos.'});res.json(store.list(getShop(req).id,{dishId,portionId}).map(publicJob));});
 router.get('/jobs/:id',(req,res)=>{const j=own(req,res);if(j)res.json(publicJob(j));});
 const upload=multer({storage:boundedStorage(),limits:{fileSize:MAX_PHOTO_BYTES,files:100,fields:2,parts:102,fieldSize:100},fileFilter(req,file,cb){if(!['image/jpeg','image/png'].includes(file.mimetype))return cb(new Error('INVALID_PHOTOS'));cb(null,true);}}).array('photos',100);
 router.post('/jobs',async(req,res,next)=>{
  let id,locked=false;const shopId=getShop(req).id;
  try{
   const status=await getReadiness();if(!status.ready)return res.status(503).json({code:'RECONSTRUCTION_DISABLED',error:'Servidor de geração indisponível.',reasons:status.reasons});
   if(uploadsInFlight.has(shopId))return res.status(409).json({code:'UPLOAD_ACTIVE',error:'Já há um envio de fotos em andamento.'});uploadsInFlight.add(shopId);locked=true;
   id=randomUUID();req.captureDirectory=await safeJobDirectory(dataDir,id,{create:true});req.captureBytes=0;await mkdir(path.join(req.captureDirectory,'photos'),{mode:0o700});
   await new Promise((resolve,reject)=>upload(req,res,e=>e?reject(e):resolve()));
   if(!req.files||req.files.length<30||req.files.length>100||!req.captureBytes)throw new Error('INVALID_PHOTOS');
   const dish=getCatalog(req).dishes.find(d=>d.id===req.body.dishId),portion=dish?.portions.find(p=>p.id===req.body.portionId);
   if(!portion)throw new Error('PORTION_NOT_FOUND');
   const names=[];
   for(const file of req.files){const type=imageType(await readFile(file.path));const name=file.filename+'.'+type;await rename(file.path,path.join(req.captureDirectory,'photos',name));names.push(name);}
   await writeFile(path.join(req.captureDirectory,'manifest.json'),JSON.stringify({version:1,photos:names}),{flag:'wx',mode:0o600});
   const job=store.enqueue({id,restaurantId:getShop(req).id,dishId:dish.id,portionId:portion.id,identity:portionSnapshot(portion),payload:{dimensions:portion.dimensions,upAxis:portion.upAxis||'auto'}});
   res.status(202).json(publicJob(job));
  }catch(error){
   if(id&&!store.get(id))await removeJobDirectory(dataDir,id).catch(()=>{});
   const tooLarge=error instanceof multer.MulterError||error.message==='CAPTURE_TOO_LARGE';
   res.status(error.message==='ACTIVE_JOB'?409:tooLarge?413:400).json({code:error.message==='ACTIVE_JOB'?'ACTIVE_JOB':'INVALID_CAPTURE',error:tooLarge?'Limite de fotos excedido: 100 arquivos, 12 MiB por foto e 300 MiB no total.':'Envie 30–100 fotos JPG/PNG válidas de uma porção sua, sem outra tarefa ativa.'});
  }finally{if(locked)uploadsInFlight.delete(shopId);}
 });
 router.post('/jobs/:id/cancel',(req,res)=>{const j=own(req,res);if(j){store.cancel(j.id);res.json(publicJob(store.get(j.id)));}});
 for(const name of ['model','poster'])router.get('/jobs/:id/'+name,async(req,res)=>{
  const j=own(req,res);if(!j)return;if(j.status!=='review')return res.status(409).json({error:'Não há prévia disponível.'});
  try{const target=await safeArtifact(dataDir,j.id,name==='model'?'model.glb':'poster.png',name==='model'?20*1024**2:10*1024**2,j.result?.runToken);res.type(name==='model'?'model/gltf-binary':'image/png').sendFile(target);}
  catch{res.status(404).json({error:'Prévia indisponível.'});}
 });
 router.post('/jobs/:id/approve',async(req,res)=>{
  const j=own(req,res);if(!j)return;
  if(j.status!=='review'||req.body?.shapeConfirmed!==true||req.body?.scaleConfirmed!==true)return res.status(409).json({error:'Confirme o formato e a escala de uma tarefa aguardando revisão.'});
  const current=getCatalog(req).dishes.find(d=>d.id===j.dishId)?.portions.find(p=>p.id===j.portionId);
  if(!current||portionSnapshot(current)!==j.identity)return res.status(409).json({code:'STALE_RESULT',error:'O prato ou suas medidas mudaram. Descarte a tarefa e gere novamente.'});
  try{
   const source=await readFile(await safeArtifact(dataDir,j.id,'model.glb',20*1024**2,j.result?.runToken));const poster=await readFile(await safeArtifact(dataDir,j.id,'poster.png',10*1024**2,j.result?.runToken));
   const report=inspectGlb(source);if(report.bytes>20*1024**2||report.triangles>180000||!report.images||!poster.subarray(0,8).equals(png))throw new Error('INVALID_MODEL');
   const calibrated=calibrateGlb(source,current.dimensions,'y',true);
   const filename=randomUUID()+'.glb',photoName=randomUUID()+'.png';await mkdir(path.join(dataDir,'uploads'),{recursive:true});
   await writeFile(path.join(dataDir,'uploads',filename),calibrated.buffer,{flag:'wx'});await writeFile(path.join(dataDir,'uploads',photoName),poster,{flag:'wx'});
   store.transaction(()=>{
    const latest=store.get(j.id);if(latest.status!=='review'||latest.cancelRequested)throw new Error('STALE_RESULT');
    const row=db.prepare('SELECT catalog FROM restaurants WHERE id=?').get(j.restaurantId);const catalog=JSON.parse(row.catalog),portion=catalog.dishes.find(d=>d.id===j.dishId)?.portions.find(p=>p.id===j.portionId);
    if(!portion||portionSnapshot(portion)!==j.identity)throw new Error('STALE_RESULT');
    invalidateModelAssets(portion);portion.modelSource=portion.modelUrl='/media/'+filename;portion.upAxis='y';portion.modelStatus='ready';portion.modelReport=report;portion.demo=false;
    if(!portion.photos?.length)portion.photos=['/media/'+photoName];portion.reviewedAt=new Date().toISOString();portion.reviewedBy=req.user?.id||'operator';
    db.prepare('UPDATE restaurants SET catalog=?,version=version+1 WHERE id=?').run(JSON.stringify(catalog),j.restaurantId);
    db.prepare("UPDATE reconstruction_jobs SET status='completed',finished_at=?,updated_at=? WHERE id=?").run(store.now(),store.now(),j.id);
    store.enqueue({restaurantId:j.restaurantId,dishId:j.dishId,portionId:j.portionId,kind:'assets',identity:portionSnapshot(portion),payload:{modelUrl:portion.modelUrl,dimensions:portion.dimensions,upAxis:'y',modelIdentity:modelIdentity(portion.modelUrl,portion.dimensions,'y')}});
   });
   res.json({ok:true});
  }catch(error){res.status(error.message==='STALE_RESULT'?409:400).json({code:error.message==='STALE_RESULT'?'STALE_RESULT':'INVALID_MODEL',error:'O resultado mudou ou não é compatível com as medidas/limites. O modelo publicado anterior foi preservado.'});}
 });
 return router;
}

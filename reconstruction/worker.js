import {spawn} from 'node:child_process';
import {readFile,writeFile,readdir,lstat,mkdir,copyFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {safeArtifact,safeJobDirectory,removeJobDirectory} from './files.js';
import {inspectGlb,calibrateGlb} from '../glb.js';
import {portionSnapshot} from './routes.js';
import {readiness} from './readiness.js';

const allowedErrors=new Set(['TIMEOUT','DISK_LIMIT','INVALID_PHOTOS','CAPTURE_QUALITY','RECAPTURE_BACKGROUND','TEXTURE_MISSING','INVALID_MODEL','INVALID_SCALE','MODEL_TOO_COMPLEX','RUNTIME_UNAVAILABLE','SANDBOX_UNAVAILABLE','RUNTIME_VERSION_MISMATCH','STALE_RESULT']);
const workerRoot=env=>path.resolve(env.MESA3D_PIPELINE_ROOT||fileURLToPath(new URL('../worker-3d/',import.meta.url)));
export function pipelineEnvironment(env=process.env){
 const clean={};for(const key of ['PATH','SystemRoot','SYSTEMROOT','WINDIR','TEMP','TMP','PRATOAR_LAN_RUNTIME_ROOT','PRATOAR_SEGMENTATION_WEIGHTS'])if(env[key])clean[key]=env[key];
 return {...clean,PRATOAR_SANDBOX_PROFILE:'lan',PYTHONDONTWRITEBYTECODE:'1',PYTHONPATH:workerRoot(env)};
}
export function runPython(args,{signal,onProgress=()=>{},env=process.env,timeoutMs=3600000}={}){
 return new Promise((resolve,reject)=>{
  const child=spawn(env.MESA3D_PYTHON||'python3',[path.join(workerRoot(env),'scripts','mesa3d-job.py'),...args],{cwd:workerRoot(env),env:pipelineEnvironment(env),stdio:['ignore','pipe','pipe'],shell:false,detached:process.platform!=='win32',windowsHide:true});
  let buffer='',total=0,result=null,killing=false,force;
  const kill=()=>{if(killing)return;killing=true;try{if(process.platform==='win32')child.kill();else process.kill(-child.pid,'SIGTERM');}catch{}
   force=setTimeout(()=>{try{if(process.platform==='win32')child.kill('SIGKILL');else process.kill(-child.pid,'SIGKILL');}catch{}},5000);force.unref();};
  const timeout=setTimeout(kill,timeoutMs);signal?.addEventListener('abort',kill,{once:true});if(signal?.aborted)kill();
  const finish=()=>{clearTimeout(timeout);clearTimeout(force);signal?.removeEventListener('abort',kill);};
  child.stdout.on('data',chunk=>{total+=chunk.length;if(total>256*1024){kill();return;}buffer+=chunk.toString();if(buffer.length>16384){kill();return;}let idx;while((idx=buffer.indexOf('\n'))>=0){const line=buffer.slice(0,idx);buffer=buffer.slice(idx+1);try{const message=JSON.parse(line);if(message.stage)onProgress(message.stage);if(message.runtime||message.result||message.error)result=message;}catch{}}});
  child.stderr.on('data',chunk=>{total+=chunk.length;if(total>256*1024)kill();});
  child.once('error',()=>{finish();reject(new Error('RUNTIME_UNAVAILABLE'));});
  child.once('close',code=>{finish();if(killing||signal?.aborted)return reject(Object.assign(new Error('TIMEOUT'),{retryable:!signal?.aborted}));if(code!==0||!result)return reject(new Error(allowedErrors.has(result?.error)?result.error:'PROCESSING_FAILED'));resolve(result);});
 });
}
export async function preflightRuntime({env=process.env}={}){const r=await runPython(['--preflight'],{env,timeoutMs:150000});if(!/^[a-f0-9]{64}$/.test(r.runtime?.digest||''))throw new Error('RUNTIME_UNAVAILABLE');return r.runtime;}
async function executePhotos({job,directory,signal,progress,env}){const r=await runPython(['--job-dir',directory,'--width-cm',String(Math.max(job.payload.dimensions.width,job.payload.dimensions.depth))],{signal,onProgress:progress,env});return {metrics:r.result?.metrics||{}};}
async function executeAssets({job,store,dataDir,signal}){
 const row=store.db.prepare('SELECT catalog FROM restaurants WHERE id=?').get(job.restaurantId);const portion=row&&JSON.parse(row.catalog).dishes.find(d=>d.id===job.dishId)?.portions.find(p=>p.id===job.portionId);
 if(!portion||portionSnapshot(portion)!==job.identity||portion.modelStatus!=='ready'||!/^\/media\/[\w-]+\.glb$/.test(portion.modelUrl))throw new Error('STALE_RESULT');
 if(signal.aborted)throw new Error('CANCELLED');
 const {prepareModelAssets,attachPreparedAssets}=await import('../tools/prepare-model-assets.mjs');
 const prepared=await prepareModelAssets({sourcePath:path.join(dataDir,'uploads',path.basename(portion.modelUrl)),dimensions:portion.dimensions,outputDir:path.join(dataDir,'uploads')});
 if(signal.aborted)throw new Error('CANCELLED');
 store.owned(job.id,job.runToken);
 attachPreparedAssets({db:store.db,dataDir,restaurantId:job.restaurantId,dishId:job.dishId,portionId:job.portionId,identity:job.payload.modelIdentity,prepared,assertLease(){const current=store.owned(job.id,job.runToken);if(current.cancelRequested)throw new Error('CANCELLED');}});
 return {prepared:true};
}
async function diskUsage(directory){let bytes=0;for(const e of await readdir(directory,{withFileTypes:true})){const p=path.join(directory,e.name),st=await lstat(p);if(st.isSymbolicLink())throw new Error('UNSAFE_PATH');bytes+=e.isDirectory()?await diskUsage(p):st.size;if(bytes>10*1024**3)throw new Error('DISK_LIMIT');}return bytes;}
export async function runWorkerOnce({store,dataDir,workerId='server-worker',execute,env=process.env,pulseMs=30000}){
 const job=store.claim(workerId);if(!job)return false;
 const controller=new AbortController();let stage=job.kind==='assets'?'PREPARING_ASSETS':'VALIDATING',pulsing=false,abortReason='TIMEOUT';
 const pulse=async()=>{if(pulsing)return;pulsing=true;try{const j=store.heartbeat(job.id,job.runToken,stage);if(j.cancelRequested){abortReason='CANCELLED';controller.abort();}if(directory)await diskUsage(directory);}catch(error){abortReason=error.message;controller.abort();}finally{pulsing=false;}};
 let directory;const timer=setInterval(pulse,pulseMs);const deadline=setTimeout(()=>controller.abort(),3600000);
 try{
  const root=await safeJobDirectory(dataDir,job.id,{create:job.kind==='assets'});
  const runs=path.join(root,'runs');await mkdir(runs,{recursive:true,mode:0o700});if((await lstat(runs)).isSymbolicLink())throw new Error('UNSAFE_PATH');
  directory=path.join(runs,job.runToken);await mkdir(directory,{mode:0o700});
  if(job.kind==='photos'&&!execute){
   const manifest=JSON.parse(await readFile(await safeArtifact(dataDir,job.id,'manifest.json',20000),'utf8'));
   if(!Array.isArray(manifest.photos)||manifest.photos.length<30||manifest.photos.length>100)throw new Error('INVALID_PHOTOS');
   const input=path.join(root,'photos');if((await lstat(input)).isSymbolicLink())throw new Error('INVALID_PHOTOS');await mkdir(path.join(directory,'photos'),{mode:0o700});
   for(const name of manifest.photos){if(!/^[a-f0-9-]{36}\.(jpg|png)$/.test(name))throw new Error('INVALID_PHOTOS');const source=path.join(input,name),st=await lstat(source);if(!st.isFile()||st.isSymbolicLink()||st.size>12*1024**2)throw new Error('INVALID_PHOTOS');await copyFile(source,path.join(directory,'photos',name));}
   await writeFile(path.join(directory,'manifest.json'),JSON.stringify(manifest),{mode:0o600,flag:'wx'});
  }
  const result=await (execute||(job.kind==='assets'?executeAssets:executePhotos))({job,store,dataDir,directory,signal:controller.signal,env,progress(value){stage=value;const current=store.heartbeat(job.id,job.runToken,value);if(current.cancelRequested)controller.abort();}});
  await pulse();
  if(store.get(job.id).cancelRequested){store.cancelled(job.id,job.runToken);return true;}
  if(controller.signal.aborted)throw Object.assign(new Error(abortReason),{retryable:abortReason==='TIMEOUT'});
  if(job.kind==='photos'){
   const bytes=await readFile(await safeArtifact(dataDir,job.id,'model.glb',20*1024**2,job.runToken));const poster=await readFile(await safeArtifact(dataDir,job.id,'poster.png',10*1024**2,job.runToken));const report=inspectGlb(bytes);
   if(!report.images||report.triangles>180000||!poster.subarray(0,8).equals(Buffer.from('89504e470d0a1a0a','hex')))throw new Error('INVALID_MODEL');
   calibrateGlb(bytes,job.payload.dimensions,'y',true);
   store.finish(job.id,job.runToken,{runToken:job.runToken,metrics:{modelBytes:bytes.length,triangles:report.triangles}});
  }else store.finish(job.id,job.runToken,{prepared:!!result?.prepared});
 }catch(error){
  try{const j=store.get(job.id);if(j?.cancelRequested)store.cancelled(job.id,job.runToken);else store.fail(job.id,job.runToken,allowedErrors.has(error.message)?error.message:'PROCESSING_FAILED',!!error.retryable);}catch{} // An expired lease never writes over the next execution.
 }finally{clearInterval(timer);clearTimeout(deadline);}
 return true;
}
export async function cleanupExpired({store,dataDir,now=Date.now()}){
 const rows=store.db.prepare("SELECT id FROM reconstruction_jobs WHERE status IN ('completed','failed','cancelled') AND finished_at<? AND cleaned_at IS NULL").all(now-7*86400000);
 for(const row of rows){try{await removeJobDirectory(dataDir,row.id);store.db.prepare('UPDATE reconstruction_jobs SET cleaned_at=? WHERE id=?').run(now,row.id);}catch(error){if(error.code==='ENOENT')store.db.prepare('UPDATE reconstruction_jobs SET cleaned_at=? WHERE id=?').run(now,row.id);}}
}
export async function runWorkerCycle({store,dataDir,getReadiness=()=>readiness({store,dataDir}),now=Date.now(),...options}){
 await cleanupExpired({store,dataDir,now});
 const status=await getReadiness();
 if(!status.ready)return {...status,processed:false};
 return {...status,processed:await runWorkerOnce({store,dataDir,...options})};
}

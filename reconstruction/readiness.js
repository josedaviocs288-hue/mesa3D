import {readFile,statfs,lstat} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {publicOrigin} from './origin.js';
export function assessReadiness({enabled,accepted,expectedDigest,worker,now=Date.now(),platform=process.platform,freeBytes=0,memoryBytes=0}){
 const reasons=[];
 if(!enabled)reasons.push('DISABLED');
 if(!accepted)reasons.push('HOST_NOT_VALIDATED');
 if(platform!=='linux')reasons.push('LINUX_REQUIRED');
 if(!/^[a-f0-9]{64}$/.test(expectedDigest||''))reasons.push('RUNTIME_NOT_CONFIGURED');
 if(!worker||now-worker.seenAt>90000||worker.seenAt>now+5000)reasons.push('WORKER_OFFLINE');
 else if(worker.state!=='ready'||worker.runtimeDigest!==expectedDigest)reasons.push('RUNTIME_INCOMPATIBLE');
 if(freeBytes<12*1024**3)reasons.push('INSUFFICIENT_DISK');
 if(memoryBytes<8*1024**3)reasons.push('INSUFFICIENT_MEMORY');
 return {enabled:!!enabled,ready:reasons.length===0,reasons};
}
export async function readiness({store,dataDir,env=process.env}){
 let accepted=false,freeBytes=0;const expectedDigest=env.RECONSTRUCTION_RUNTIME_DIGEST||'';
 try{const target=path.join(dataDir,'reconstruction-acceptance.json'),st=await lstat(target);if(st.isSymbolicLink()||st.size>4096)throw new Error('INVALID_ACCEPTANCE');const file=JSON.parse(await readFile(target,'utf8'));accepted=file.accepted===true&&file.runtimeDigest===expectedDigest&&/^[a-f0-9]{64}$/.test(file.captureSha256||'')&&Number.isFinite(Date.parse(file.acceptedAt))&&Date.parse(file.acceptedAt)<=Date.now()+5000;}catch{}
 try{const disk=await statfs(dataDir);freeBytes=Number(disk.bavail)*Number(disk.bsize);}catch{}
 const limit=process.constrainedMemory?.()||os.totalmem();
 const result=assessReadiness({enabled:env.RECONSTRUCTION_ENABLED==='true',accepted,expectedDigest,worker:store.latestWorker(),freeBytes,memoryBytes:Math.min(os.totalmem(),limit)});
 try{publicOrigin(env.MESA3D_PUBLIC_ORIGIN);}catch{result.ready=false;result.reasons.push('PUBLIC_ORIGIN_REQUIRED');}
 return result;
}

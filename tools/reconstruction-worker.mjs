import path from 'node:path';
import {mkdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {openPlatform} from '../platform.js';
import {ReconstructionStore} from '../reconstruction/store.js';
import {readiness} from '../reconstruction/readiness.js';
import {preflightRuntime,runWorkerCycle,cleanupExpired} from '../reconstruction/worker.js';

const root=fileURLToPath(new URL('../',import.meta.url));const dataDir=path.resolve(process.env.MESA3D_DATA_DIR||path.join(root,'data'));
await mkdir(dataDir,{recursive:true});const db=openPlatform(dataDir),store=new ReconstructionStore(db),workerId=process.env.MESA3D_WORKER_ID||'server-worker';
let stopping=false,busy=false;for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>{stopping=true;});
try{
 if(process.argv.includes('--diagnose')){console.log(JSON.stringify(await readiness({store,dataDir}),null,2));}
 else if(process.argv.includes('--cleanup')){await cleanupExpired({store,dataDir});console.log('Retenção de tarefas terminais conferida.');}
 else{
  if(process.env.RECONSTRUCTION_ENABLED!=='true')throw new Error('DISABLED');
  await cleanupExpired({store,dataDir});
  store.presence(workerId,'','checking');const runtime=await preflightRuntime();
  const presence=setInterval(()=>store.presence(workerId,runtime.digest,'ready'),30000);store.presence(workerId,runtime.digest,'ready');
  try{
   do{
    const cycle=await runWorkerCycle({store,dataDir,workerId});if(!cycle.ready)throw new Error('HOST_NOT_READY');busy=cycle.processed;
    if(!busy&&!process.argv.includes('--once'))await new Promise(resolve=>setTimeout(resolve,5000));
   }while(!stopping&&!process.argv.includes('--once'));
  }finally{clearInterval(presence);store.presence(workerId,runtime.digest,'checking');}
 }
}catch(error){store.presence(workerId,'','incompatible');console.error('Worker indisponível:',/^[A-Z_]+$/.test(error.message)?error.message:'RUNTIME_UNAVAILABLE');process.exitCode=1;}
finally{db.close();}

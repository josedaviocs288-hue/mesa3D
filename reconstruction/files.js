import path from 'node:path';
import {mkdir,lstat,realpath,rm} from 'node:fs/promises';
export const MAX_PHOTO_BYTES=12*1024**2,MAX_CAPTURE_BYTES=300*1024**2;
export const privateRoot=dataDir=>path.join(dataDir,'reconstruction-private');
export function jobPath(dataDir,id){if(!/^[a-f0-9-]{36}$/.test(id))throw new Error('INVALID_JOB');return path.join(privateRoot(dataDir),id);}
export async function safeJobDirectory(dataDir,id,{create=false}={}){
 const root=privateRoot(dataDir);if(create){await mkdir(dataDir,{recursive:true});await mkdir(root,{recursive:true,mode:0o700});}
 const rootStat=await lstat(root);if(rootStat.isSymbolicLink()||!rootStat.isDirectory())throw new Error('UNSAFE_PATH');
 const directory=jobPath(dataDir,id);if(create)await mkdir(directory,{recursive:true,mode:0o700});
 const st=await lstat(directory);if(st.isSymbolicLink()||!st.isDirectory())throw new Error('UNSAFE_PATH');
 const resolved=await realpath(directory),parent=await realpath(root);if(path.dirname(resolved)!==parent)throw new Error('UNSAFE_PATH');return resolved;
}
export async function safeArtifact(dataDir,id,name,maxBytes=20*1024**2,runToken){
 if(!['model.glb','poster.png','result.json','manifest.json'].includes(name))throw new Error('INVALID_ARTIFACT');
 let directory=await safeJobDirectory(dataDir,id);
 if(runToken){if(!/^[a-f0-9-]{36}$/.test(runToken))throw new Error('INVALID_ARTIFACT');for(const part of ['runs',runToken]){directory=path.join(directory,part);const st=await lstat(directory);if(st.isSymbolicLink()||!st.isDirectory())throw new Error('INVALID_ARTIFACT');}}
 const target=path.join(directory,name);const st=await lstat(target);if(!st.isFile()||st.isSymbolicLink()||st.size>maxBytes||st.size===0)throw new Error('INVALID_ARTIFACT');return target;
}
export async function removeJobDirectory(dataDir,id){const target=await safeJobDirectory(dataDir,id);await rm(target,{recursive:true,force:true});}

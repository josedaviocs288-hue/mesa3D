import {randomUUID} from 'node:crypto';
export const LEASE_MS=300000;
export const STAGES=new Set(['VALIDATING','EXTRACTING','MATCHING','RECONSTRUCTING','DENSIFYING','MESHING','TEXTURING','SEGMENTING','PREPARING_PREVIEW','EXPORTING','PREPARING_ASSETS']);
export class ReconstructionStore {
 constructor(db,{now=Date.now}={}){
  this.db=db;this.now=now;db.exec(`PRAGMA busy_timeout=5000;
   CREATE TABLE IF NOT EXISTS reconstruction_jobs (
    id TEXT PRIMARY KEY,restaurant_id TEXT NOT NULL,dish_id TEXT NOT NULL,portion_id TEXT NOT NULL,
    kind TEXT NOT NULL,identity TEXT NOT NULL,payload TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'queued',
    stage TEXT NOT NULL DEFAULT 'VALIDATING',attempts INTEGER NOT NULL DEFAULT 0,
    run_token TEXT,worker_id TEXT,lease_until INTEGER,cancel_requested INTEGER NOT NULL DEFAULT 0,
    result TEXT,error_code TEXT,created_at INTEGER NOT NULL,updated_at INTEGER NOT NULL,finished_at INTEGER,cleaned_at INTEGER);
   CREATE UNIQUE INDEX IF NOT EXISTS reconstruction_active ON reconstruction_jobs(restaurant_id,dish_id,portion_id,kind) WHERE status IN ('queued','processing','review');
   CREATE TABLE IF NOT EXISTS reconstruction_workers(id TEXT PRIMARY KEY,runtime_digest TEXT NOT NULL,state TEXT NOT NULL,seen_at INTEGER NOT NULL);
  `);
 }
 transaction(fn){this.db.exec('BEGIN IMMEDIATE');try{const result=fn();this.db.exec('COMMIT');return result;}catch(e){this.db.exec('ROLLBACK');throw e;}}
 decode(row){if(!row)return undefined;return {id:row.id,restaurantId:row.restaurant_id,dishId:row.dish_id,portionId:row.portion_id,kind:row.kind,identity:row.identity,payload:JSON.parse(row.payload),status:row.status,stage:row.stage,attempts:row.attempts,runToken:row.run_token,leaseUntil:row.lease_until,cancelRequested:!!row.cancel_requested,result:row.result?JSON.parse(row.result):null,errorCode:row.error_code,createdAt:row.created_at,updatedAt:row.updated_at,finishedAt:row.finished_at,cleanedAt:row.cleaned_at};}
 get(id){return this.decode(this.db.prepare('SELECT * FROM reconstruction_jobs WHERE id=?').get(id));}
 list(restaurantId,{dishId,portionId}={}){
  const filtered=typeof dishId==='string'&&typeof portionId==='string';
  const sql="SELECT * FROM reconstruction_jobs WHERE restaurant_id=?"+(filtered?' AND dish_id=? AND portion_id=?':'')+" ORDER BY CASE WHEN status IN ('queued','processing','review') THEN 0 ELSE 1 END,created_at DESC LIMIT 50";
  return this.db.prepare(sql).all(...(filtered?[restaurantId,dishId,portionId]:[restaurantId])).map(r=>this.decode(r));
 }
 enqueue({id=randomUUID(),restaurantId,dishId,portionId,identity,payload,kind='photos'}){
  if(!['photos','assets'].includes(kind))throw new Error('INVALID_JOB_KIND');
  try{this.db.prepare('INSERT INTO reconstruction_jobs(id,restaurant_id,dish_id,portion_id,kind,identity,payload,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)').run(id,restaurantId,dishId,portionId,kind,identity,JSON.stringify(payload),this.now(),this.now());}
  catch(e){if(e.code?.startsWith('ERR_SQLITE')&&/UNIQUE constraint/.test(e.message))throw new Error('ACTIVE_JOB');throw e;}
  return this.get(id);
 }
 claim(workerId){return this.transaction(()=>{
  const now=this.now();
  this.db.prepare(`UPDATE reconstruction_jobs SET status=CASE WHEN cancel_requested=1 THEN 'cancelled' WHEN attempts>=2 THEN 'failed' ELSE 'queued' END,error_code='LEASE_EXPIRED',run_token=NULL,lease_until=NULL,updated_at=?,finished_at=CASE WHEN cancel_requested=1 OR attempts>=2 THEN ? ELSE NULL END WHERE status='processing' AND lease_until<=?`).run(now,now,now);
  if(this.db.prepare("SELECT id FROM reconstruction_jobs WHERE status='processing' LIMIT 1").get())return undefined;
  const row=this.db.prepare("SELECT id FROM reconstruction_jobs WHERE status='queued' ORDER BY created_at,id LIMIT 1").get();if(!row)return undefined;
  this.db.prepare("UPDATE reconstruction_jobs SET status='processing',attempts=attempts+1,run_token=?,worker_id=?,lease_until=?,updated_at=?,error_code=NULL WHERE id=?").run(randomUUID(),workerId,now+LEASE_MS,now,row.id);return this.get(row.id);
 });}
 owned(id,token){const j=this.get(id);if(!j||j.status!=='processing'||j.runToken!==token||j.leaseUntil<=this.now())throw new Error('LEASE_LOST');return j;}
 heartbeat(id,token,stage){return this.transaction(()=>{const j=this.owned(id,token);if(!STAGES.has(stage))stage=j.stage;this.db.prepare('UPDATE reconstruction_jobs SET stage=?,lease_until=?,updated_at=? WHERE id=?').run(stage,this.now()+LEASE_MS,this.now(),id);return this.get(id);});}
 finish(id,token,result){return this.transaction(()=>{const j=this.owned(id,token);if(j.cancelRequested)throw new Error('CANCELLED');this.db.prepare('UPDATE reconstruction_jobs SET status=?,result=?,run_token=NULL,lease_until=NULL,updated_at=?,finished_at=? WHERE id=?').run(j.kind==='photos'?'review':'completed',JSON.stringify(result),this.now(),j.kind==='photos'?null:this.now(),id);return this.get(id);});}
 fail(id,token,code,retryable=false){return this.transaction(()=>{const j=this.owned(id,token);const status=j.cancelRequested?'cancelled':retryable&&j.attempts<2?'queued':'failed';this.db.prepare('UPDATE reconstruction_jobs SET status=?,error_code=?,run_token=NULL,lease_until=NULL,updated_at=?,finished_at=? WHERE id=?').run(status,code,this.now(),status==='queued'?null:this.now(),id);});}
 cancel(id){return this.transaction(()=>{const j=this.get(id);if(!j||['completed','failed','cancelled'].includes(j.status))return;const status=j.status==='processing'?'processing':'cancelled';this.db.prepare('UPDATE reconstruction_jobs SET status=?,cancel_requested=1,updated_at=?,finished_at=CASE WHEN ? THEN ? ELSE finished_at END WHERE id=?').run(status,this.now(),status==='cancelled'?1:0,this.now(),id);});}
 cancelled(id,token){return this.transaction(()=>{this.owned(id,token);this.db.prepare("UPDATE reconstruction_jobs SET status='cancelled',run_token=NULL,lease_until=NULL,updated_at=?,finished_at=? WHERE id=?").run(this.now(),this.now(),id);});}
 presence(id,runtimeDigest,state='ready'){if(!['ready','incompatible','checking'].includes(state))throw new Error('INVALID_WORKER_STATE');this.db.prepare('INSERT INTO reconstruction_workers(id,runtime_digest,state,seen_at) VALUES(?,?,?,?) ON CONFLICT(id) DO UPDATE SET runtime_digest=excluded.runtime_digest,state=excluded.state,seen_at=excluded.seen_at').run(id,runtimeDigest,state,this.now());}
 latestWorker(){const r=this.db.prepare('SELECT * FROM reconstruction_workers ORDER BY seen_at DESC LIMIT 1').get();return r?{id:r.id,runtimeDigest:r.runtime_digest,state:r.state,seenAt:r.seen_at}:null;}
}

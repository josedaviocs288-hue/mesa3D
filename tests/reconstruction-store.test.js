import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {ReconstructionStore} from '../reconstruction/store.js';
import {assessReadiness} from '../reconstruction/readiness.js';
const job=()=>({restaurantId:'r',dishId:'d',portionId:'p',identity:'snapshot',payload:{dimensions:{width:20,depth:20,height:3},upAxis:'y'}});
function fixture(t){const db=new DatabaseSync(':memory:');t.after(()=>db.close());let now=1000000;const q=new ReconstructionStore(db,{now:()=>now});return {q,db,advance:n=>now+=n};}
test('queue preserves duplicate exclusion and globally serial claims',t=>{const {q}=fixture(t);const j=q.enqueue(job());assert.throws(()=>q.enqueue(job()),/ACTIVE_JOB/);const c=q.claim('worker');assert.equal(c.id,j.id);assert.equal(q.claim('other'),undefined);q.finish(c.id,c.runToken,{model:'model.glb'});assert.equal(q.get(j.id).status,'review');});
test('expired lease retries at most twice and rejects old completion',t=>{const {q,advance}=fixture(t);const j=q.enqueue(job());const first=q.claim('a');advance(300001);const second=q.claim('b');assert.equal(second.attempts,2);assert.throws(()=>q.finish(first.id,first.runToken,{}),/LEASE_LOST/);advance(300001);assert.equal(q.claim('c'),undefined);assert.equal(q.get(j.id).status,'failed');});
test('cancel keeps busy until worker acknowledges',t=>{const {q}=fixture(t);const j=q.enqueue(job());const c=q.claim('a');q.cancel(j.id);assert.equal(q.get(j.id).status,'processing');assert.equal(q.heartbeat(c.id,c.runToken,'RECONSTRUCTING').cancelRequested,true);assert.equal(q.claim('b'),undefined);q.cancelled(c.id,c.runToken);assert.equal(q.get(j.id).status,'cancelled');assert.throws(()=>q.finish(c.id,c.runToken,{}),/LEASE_LOST/);});
test('retryable failure, terminal failure and retention metadata',t=>{const {q}=fixture(t);q.enqueue(job());let c=q.claim('w');q.fail(c.id,c.runToken,'PROCESSING_FAILED',true);c=q.claim('w');q.fail(c.id,c.runToken,'PROCESSING_FAILED',true);assert.equal(q.get(c.id).status,'failed');assert.ok(q.get(c.id).finishedAt);assert.equal(q.list('other').length,0)});
test('readiness is fail-closed for flags, stale worker and digest mismatch',()=>{
 const base={enabled:true,accepted:true,expectedDigest:'a'.repeat(64),platform:'linux',freeBytes:20*1024**3,memoryBytes:8*1024**3,now:100000,worker:{seenAt:100000,runtimeDigest:'a'.repeat(64),state:'ready'}};
 assert.equal(assessReadiness({...base,worker:undefined}).ready,false);assert.equal(assessReadiness({...base,enabled:false}).ready,false);assert.equal(assessReadiness({...base,accepted:false}).ready,false);assert.equal(assessReadiness({...base,worker:{...base.worker,seenAt:0}}).ready,false);assert.equal(assessReadiness({...base,expectedDigest:'b'.repeat(64)}).ready,false);assert.equal(assessReadiness({...base,freeBytes:0}).ready,false);assert.equal(assessReadiness(base).ready,true);
});
test('queue survives closing and reopening SQLite',async t=>{const dir=await mkdtemp(path.join(tmpdir(),'mesa3d-queue-'));t.after(()=>rm(dir,{recursive:true,force:true,maxRetries:5,retryDelay:100}));const file=path.join(dir,'queue.sqlite');let db=new DatabaseSync(file);const id=new ReconstructionStore(db).enqueue(job()).id;db.close();db=new DatabaseSync(file);try{assert.equal(new ReconstructionStore(db).get(id).status,'queued');}finally{db.close()}});
test('cancelled lease is not reclaimed as new processing',t=>{const {q,advance}=fixture(t);q.enqueue(job());const c=q.claim('w');q.cancel(c.id);advance(300001);assert.equal(q.claim('other'),undefined);assert.equal(q.get(c.id).status,'cancelled');});
test('per-portion listing keeps old active tasks visible after fifty newer jobs',t=>{const {q,advance}=fixture(t);const old=q.enqueue(job());for(let n=0;n<60;n++){advance(1);q.enqueue({...job(),portionId:'other-'+n});}const own=q.list('r',{dishId:'d',portionId:'p'});assert.equal(own.length,1);assert.equal(own[0].id,old.id);q.cancel(own[0].id);assert.equal(q.enqueue(job()).status,'queued');});

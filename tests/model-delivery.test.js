import test from 'node:test';
import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import path from 'node:path';
import {startServer} from './helpers/server.js';
test('rangeAndMimeAreCorrect; immutableOnlyForHashedVariants; traversalCannotReadOutsideMedia',async t=>{
 const s=await startServer();t.after(s.stop);
 const name='model-'+'a'.repeat(64)+'.usdz';await writeFile(path.join(s.dataDir,'uploads',name),Buffer.alloc(256,65));
 const r=await fetch(s.baseUrl+'/media/'+name,{headers:{Range:'bytes=0-63'}});
 assert.equal(r.status,206);assert.match(r.headers.get('content-type'),/model\/vnd.usdz\+zip/);assert.match(r.headers.get('cache-control'),/immutable/);assert.equal((await r.arrayBuffer()).byteLength,64);
 await writeFile(path.join(s.dataDir,'uploads','mutable.glb'),'test');const mutable=await fetch(s.baseUrl+'/media/mutable.glb');assert.doesNotMatch(mutable.headers.get('cache-control'),/immutable/);
 assert.equal((await fetch(s.baseUrl+'/media/%2e%2e%2fmesa3d.sqlite')).status,404);
 assert.match((await fetch(s.baseUrl+'/decoders/draco/draco_decoder.wasm')).headers.get('content-type'),/wasm/);
});

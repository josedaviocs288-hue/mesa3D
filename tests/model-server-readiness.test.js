import test from 'node:test';
import assert from 'node:assert/strict';
import {startServer} from './helpers/server.js';
import {publicOrigin} from '../reconstruction/origin.js';
import {checkModelDelivery} from '../tools/check-model-delivery.mjs';
test('production origin rejects localhost, HTTP, secrets and path/query',()=>{
 for(const url of ['http://example.test','https://localhost','https://user:pass@example.test','https://example.test/route','https://example.test/?token=value'])assert.throws(()=>publicOrigin(url));assert.equal(publicOrigin('https://mesa.example.test'),'https://mesa.example.test');
});
test('smoke checks actual GLB, MIME, Range and local decoder',async t=>{const s=await startServer();t.after(s.stop);await assert.rejects(checkModelDelivery(s.baseUrl));const report=await checkModelDelivery(s.baseUrl,{allowLocal:true});assert.equal(report.ok,true);assert.equal(report.physicalArVerified,false);assert.ok(report.checks.filter(c=>c.check==='model-range-mime').length>=2);});

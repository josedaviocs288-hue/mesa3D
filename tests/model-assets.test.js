import test from 'node:test';
import assert from 'node:assert/strict';
import {modelIdentity,selectModelAssets,invalidateModelAssets,publicDish} from '../model-assets.js';
const portion=()=>({id:'one',modelUrl:'/media/original.glb',modelStatus:'ready',dimensions:{width:34,depth:20,height:3.1},upAxis:'y',photos:['/assets/photo.jpg']});
function prepared(){const p=portion();p.modelAssets={identity:modelIdentity(p.modelUrl,p.dimensions,p.upAxis),sourceSha256:'a'.repeat(64),webUrl:'/media/model-'+'a'.repeat(64)+'.glb',iosUrl:'/media/model-'+'b'.repeat(64)+'.usdz',credits:'Fixture'};return p;}
test('oldCatalogUsesOriginal',()=>assert.deepEqual(selectModelAssets(portion()),{originalUrl:'/media/original.glb',webUrl:'',iosUrl:'',posterUrl:'/assets/photo.jpg'}));
test('changedDimensionsInvalidateAssets',()=>{const p=prepared();p.dimensions.width++;assert.equal(selectModelAssets(p).iosUrl,'');invalidateModelAssets(p);assert.equal(p.modelAssets,undefined);assert.equal(p.modelUrl,'/media/original.glb')});
test('changedModelInvalidatesAssets; otherPortionCannotBorrowUsdz',()=>{const p=prepared();p.modelUrl='/media/other.glb';assert.equal(selectModelAssets(p).iosUrl,'')});
test('draftNeverExposesAssets',()=>{const p=prepared();p.modelStatus='review';p.modelSource='/media/private.glb';const d=publicDish({id:'d',published:true,secret:'hidden',portions:[p]});assert.equal(d.secret,undefined);assert.equal(d.portions[0].modelSource,undefined);assert.equal(d.portions[0].modelUrl,'');assert.equal(d.portions[0].assets.iosUrl,'')});
test('matchingAssetsOnly; unsafeAssetUrlRejected',()=>{const p=prepared();assert.match(selectModelAssets(p).iosUrl,/\.usdz$/);for(const u of ['https://evil.test/a.usdz','/media/../secret.usdz','//evil/a.usdz','/media/a.usdz?x']){p.modelAssets.iosUrl=u;assert.equal(selectModelAssets(p).iosUrl,'')}});
test('identityNormalizesNumericDimensions',()=>assert.equal(modelIdentity('/media/a.glb',{width:34,depth:20,height:3.1},'y'),modelIdentity('/media/a.glb',{height:'3.1',depth:'20',width:'34'},'y')));

// Offline only. No reconstruction, network source, or customer's request path.
import {readFile,writeFile,mkdir,rename,unlink} from 'node:fs/promises';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash,randomUUID} from 'node:crypto';
import {NodeIO,getBounds as documentBounds} from '@gltf-transform/core';
import {KHRONOS_EXTENSIONS} from '@gltf-transform/extensions';
import {draco} from '@gltf-transform/functions';
import draco3d from 'draco3dgltf';
import sharp from 'sharp';
import {createCanvas,loadImage,Image} from '@napi-rs/canvas';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {USDZExporter} from 'three/addons/exporters/USDZExporter.js';
import {FrontSide} from 'three';
import {getBounds,inspectGlb} from '../glb.js';
import {modelIdentity} from '../model-assets.js';
import {openPlatform} from '../platform.js';

const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
async function atomicWrite(outputDir,bytes,ext){
 const name=`model-${hash(bytes)}.${ext}`,temp=path.join(outputDir,randomUUID()+'.tmp');
 try{await writeFile(temp,bytes,{flag:'wx'});await rename(temp,path.join(outputDir,name));}
 finally{await unlink(temp).catch(()=>{});}
 return '/media/'+name;
}
export async function prepareModelAssets({sourcePath,dimensions,outputDir}){
 const source=await readFile(sourcePath);const report=inspectGlb(source);const bounds=getBounds(source);
 if(report.bytes>20*1024*1024||report.triangles>180000)throw new Error('Modelo excede os limites móveis.');
 const expected=[dimensions.width,dimensions.height,dimensions.depth].map(n=>Number(n)/100);
 if(expected.some((n,i)=>!Number.isFinite(n)||n<=0||Math.abs(bounds.size[i]-n)/n>.031)||Math.abs(bounds.min[1])>.002)throw new Error('Modelo de origem não está calibrado às medidas.');
 const io=new NodeIO().registerExtensions(KHRONOS_EXTENSIONS).registerDependencies({'draco3d.encoder':await draco3d.createEncoderModule(),'draco3d.decoder':await draco3d.createDecoderModule()});
 const doc=await io.readBinary(source);
 const originalBounds=documentBounds(doc.getRoot().listScenes()[0]);
 for(const texture of doc.getRoot().listTextures()){
  const pixels=texture.getImage();if(!pixels)continue;
  const color=doc.getRoot().listMaterials().some(m=>m.getBaseColorTexture()===texture||m.getEmissiveTexture()===texture);
  if(color&&(await sharp(pixels).stats()).isOpaque){const jpeg=await sharp(pixels).jpeg({quality:90,chromaSubsampling:'4:4:4'}).toBuffer();if(jpeg.length<pixels.length)texture.setImage(jpeg).setMimeType('image/jpeg');}
 }
 await doc.transform(draco({encodeSpeed:5,decodeSpeed:8,quantizePosition:14,quantizeNormal:10,quantizeTexcoord:12}));
 const web=await io.writeBinary(doc);const decoded=await io.readBinary(web);const optimizedBounds=documentBounds(decoded.getRoot().listScenes()[0]);
 if([0,1,2].some(i=>Math.abs(optimizedBounds.max[i]-originalBounds.max[i])>.001||Math.abs(optimizedBounds.min[i]-originalBounds.min[i])>.001))throw new Error('Otimização alterou dimensões.');
 const before=doc.getRoot().listAccessors().filter(a=>a.getType()==='SCALAR').reduce((n,a)=>n+a.getCount(),0);
 const after=decoded.getRoot().listAccessors().filter(a=>a.getType()==='SCALAR').reduce((n,a)=>n+a.getCount(),0);
 if(before!==after)throw new Error('Otimização alterou índices.');
 // Three's exporter requires image/canvas browser adapters in Node.
 globalThis.self=globalThis;globalThis.ImageBitmap=Image;
 globalThis.createImageBitmap=async blob=>loadImage(Buffer.from(await blob.arrayBuffer()));
 globalThis.ProgressEvent=class{constructor(type,values){this.type=type;Object.assign(this,values);}};
 globalThis.document={createElement(name){if(name!=='canvas')throw new Error('Unsupported DOM request');const canvas=createCanvas(1,1);canvas.toBlob=callback=>canvas.encode('png').then(b=>callback(new Blob([b],{type:'image/png'})));return canvas;}};
 const gltf=await new GLTFLoader().parseAsync(source.buffer.slice(source.byteOffset,source.byteOffset+source.byteLength),'');
 gltf.scene.updateMatrixWorld(true);
 let usd;const changes=[];
 try{
  let meshes=0;
  gltf.scene.traverse(o=>{if(o.isMesh){
   meshes++;if(Array.isArray(o.material)||!o.material?.isMeshStandardMaterial||o.isSkinnedMesh)throw new Error('Material ou malha não suportado pelo USDZ. Original preservado.');
   if(!o.geometry.attributes.normal){o.geometry.computeVertexNormals();changes.push('Normais calculadas para USDZ.');}
   if(o.material.side!==FrontSide){o.material.side=FrontSide;changes.push('USDZ usa face frontal; conferir superfícies abertas no iPhone.');}
  }});
  if(!meshes)throw new Error('Modelo sem malha exportável.');
  usd=await new USDZExporter().parseAsync(gltf.scene,{quickLookCompatible:true});
 }
 finally{gltf.scene.traverse(o=>{o.geometry?.dispose();for(const m of Array.isArray(o.material)?o.material:[o.material]){if(!m)continue;for(const v of Object.values(m))if(v?.isTexture)v.dispose();m.dispose();}});}
 const ios=Buffer.from(usd);
 if(ios.readUInt32LE(0)!==0x04034b50||!ios.toString().includes('metersPerUnit = 1'))throw new Error('USDZ inválido.');
 // All conversions complete before any catalog reference is written.
 await mkdir(outputDir,{recursive:true});
 const webUrl=await atomicWrite(outputDir,web,'glb');const iosUrl=await atomicWrite(outputDir,ios,'usdz');
 return {sourceSha256:hash(source),webUrl,iosUrl,credits:'Origem: modelo da porção. Variante web com Draco e texturas de cor recomprimidas; USDZ exportado pelo Three.js. Créditos originais preservados no catálogo. '+[...new Set(changes)].join(' ')};
}
export function attachPreparedAssets({db,restaurantId,dishId,portionId,identity,prepared,dataDir,assertLease}){
 db.exec('BEGIN IMMEDIATE');
 try{
  assertLease?.();
  const row=db.prepare('SELECT catalog FROM restaurants WHERE id=?').get(restaurantId);const catalog=row&&JSON.parse(row.catalog);
  const portion=catalog?.dishes.find(d=>d.id===dishId)?.portions.find(p=>p.id===portionId);
  if(!portion||portion.modelStatus!=='ready'||modelIdentity(portion.modelUrl,portion.dimensions,portion.upAxis)!==identity)throw new Error('Modelo ou medidas alterados durante preparação.');
  if(!dataDir||!/^\/media\/[\w-]+\.glb$/.test(portion.modelUrl))throw new Error('Arquivo de origem indisponível.');
  const source=readFileSync(path.join(dataDir,'uploads',path.basename(portion.modelUrl)));
  if(hash(source)!==prepared.sourceSha256)throw new Error('Arquivo de origem alterado.');
  for(const [key,ext] of [['webUrl','glb'],['iosUrl','usdz']]){
   if(!new RegExp('^/media/model-[a-f0-9]{64}\\.'+ext+'$').test(prepared[key]||''))throw new Error('Variante inválida.');
   const output=readFileSync(path.join(dataDir,'uploads',path.basename(prepared[key])));
   if(!prepared[key].includes(hash(output)))throw new Error('Arquivo da variante alterado.');
  }
  portion.modelAssets={...prepared,identity};
  db.prepare('UPDATE restaurants SET catalog=?,version=version+1 WHERE id=?').run(JSON.stringify(catalog),restaurantId);db.exec('COMMIT');
 }catch(error){db.exec('ROLLBACK');throw error;}
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{
  const args=Object.fromEntries(Array.from({length:(process.argv.length-2)/2},(_,i)=>[process.argv[2+i*2],process.argv[3+i*2]]));
  if(!['--data-dir','--restaurant','--dish','--portion'].every(k=>args[k]))throw new Error('Use --data-dir <diretório> --restaurant <id> --dish <id> --portion <id>');
  const dataDir=path.resolve(args['--data-dir']);const db=openPlatform(dataDir);
  try{
   const row=db.prepare('SELECT catalog FROM restaurants WHERE id=?').get(args['--restaurant']);
   const portion=row&&JSON.parse(row.catalog).dishes.find(d=>d.id===args['--dish'])?.portions.find(p=>p.id===args['--portion']);
   if(!portion||portion.modelStatus!=='ready'||!/^\/media\/[\w-]+\.glb$/.test(portion.modelUrl))throw new Error('Escolha uma porção com GLB calibrado e aprovado.');
   const identity=modelIdentity(portion.modelUrl,portion.dimensions,portion.upAxis);
   const prepared=await prepareModelAssets({sourcePath:path.join(dataDir,'uploads',path.basename(portion.modelUrl)),dimensions:portion.dimensions,outputDir:path.join(dataDir,'uploads')});
   attachPreparedAssets({db,dataDir,restaurantId:args['--restaurant'],dishId:args['--dish'],portionId:args['--portion'],identity,prepared});
   console.log('Variantes preparadas e associadas à porção.');
  }finally{db.close();}
 }catch(error){console.error(error.message);process.exitCode=1;}
}

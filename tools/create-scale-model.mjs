import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

// Ten 1 cm segments. This is a geometric reference, not a device calibration.
const root=path.dirname(fileURLToPath(import.meta.url));
const groups=[[],[],[]];
for(let i=0;i<10;i++){
  const color=i===4?2:i%2;
  const left=-0.05+i*0.01,right=left+0.01;
  const low=-0.01,high=0.01,bottom=0,top=0.002;
  groups[color].push({vertices:[
    [left,bottom,low],[right,bottom,low],[right,top,low],[left,top,low],
    [left,bottom,high],[right,bottom,high],[right,top,high],[left,top,high]
  ],faces:[0,1,2,0,2,3,4,7,6,4,6,5,0,4,5,0,5,1,3,2,6,3,6,7,1,5,6,1,6,2,0,3,7,0,7,4]});
}
const gltf={asset:{version:'2.0',generator:'Mesa3D scale check'},extensionsUsed:['KHR_materials_unlit'],scene:0,
  scenes:[{nodes:[0]}],nodes:[{mesh:0}],meshes:[{primitives:[]}],buffers:[],bufferViews:[],accessors:[],
  materials:[
    {name:'Escuro',pbrMetallicRoughness:{baseColorFactor:[0.055,0.16,0.13,1],metallicFactor:0,roughnessFactor:1},extensions:{KHR_materials_unlit:{}}},
    {name:'Claro',pbrMetallicRoughness:{baseColorFactor:[0.98,0.93,0.81,1],metallicFactor:0,roughnessFactor:1},extensions:{KHR_materials_unlit:{}}},
    {name:'Centro',pbrMetallicRoughness:{baseColorFactor:[0.76,0.21,0.11,1],metallicFactor:0,roughnessFactor:1},extensions:{KHR_materials_unlit:{}}}
  ]};
const chunks=[];let length=0;
const add=(buffer,target)=>{const offset=length;chunks.push(buffer);length+=buffer.length;const pad=(4-length%4)%4;if(pad){chunks.push(Buffer.alloc(pad));length+=pad}gltf.bufferViews.push({buffer:0,byteOffset:offset,byteLength:buffer.length,target});return gltf.bufferViews.length-1};
groups.forEach((group,material)=>{
  if(!group.length)return;
  const vertices=group.flatMap(x=>x.vertices.flat());
  const indices=group.flatMap((x,i)=>x.faces.map(v=>v+i*8));
  const position=Buffer.alloc(vertices.length*4);vertices.forEach((v,i)=>position.writeFloatLE(v,i*4));
  const faces=Buffer.alloc(indices.length*2);indices.forEach((v,i)=>faces.writeUInt16LE(v,i*2));
  const positionView=add(position,34962),indexView=add(faces,34963);
  const xs=vertices.filter((_,i)=>i%3===0),ys=vertices.filter((_,i)=>i%3===1),zs=vertices.filter((_,i)=>i%3===2);
  gltf.accessors.push({bufferView:positionView,componentType:5126,count:vertices.length/3,type:'VEC3',min:[Math.min(...xs),Math.min(...ys),Math.min(...zs)],max:[Math.max(...xs),Math.max(...ys),Math.max(...zs)]});
  const positionAccessor=gltf.accessors.length-1;
  gltf.accessors.push({bufferView:indexView,componentType:5123,count:indices.length,type:'SCALAR',min:[0],max:[Math.max(...indices)]});
  gltf.meshes[0].primitives.push({attributes:{POSITION:positionAccessor},indices:gltf.accessors.length-1,material});
});
const binary=Buffer.concat(chunks);gltf.buffers=[{byteLength:binary.length}];
const json=Buffer.from(JSON.stringify(gltf));
const jsonPad=Buffer.concat([json,Buffer.alloc((4-json.length%4)%4,0x20)]);
const glb=Buffer.alloc(12+8+jsonPad.length+8+binary.length);
glb.writeUInt32LE(0x46546c67,0);glb.writeUInt32LE(2,4);glb.writeUInt32LE(glb.length,8);
glb.writeUInt32LE(jsonPad.length,12);glb.writeUInt32LE(0x4e4f534a,16);jsonPad.copy(glb,20);
const binStart=20+jsonPad.length;glb.writeUInt32LE(binary.length,binStart);glb.writeUInt32LE(0x004e4942,binStart+4);binary.copy(glb,binStart+8);
const output=path.join(root,'..','public','assets','regua-10cm.glb');
fs.writeFileSync(output,glb);
console.log(`Gerado: ${output} (${glb.length} bytes)`);

// Improves only the supplied demo mesh. Real dishes should use their own photos and GLB.
import fs from 'node:fs/promises';

const source=new URL('../public/assets/filet-source.glb',import.meta.url);
const destination=new URL('../public/assets/filet-demo-optimized.glb',import.meta.url);
const original=await fs.readFile(source);
const jsonLength=original.readUInt32LE(12);
const gltf=JSON.parse(original.subarray(20,20+jsonLength));
const binaryOffset=20+jsonLength+8;
let binary=Buffer.from(original.subarray(binaryOffset));
const positions=gltf.accessors[1],positionView=gltf.bufferViews[positions.bufferView];
const positionOffset=(positionView.byteOffset||0)+(positions.byteOffset||0);
const indices=gltf.accessors[0],indexView=gltf.bufferViews[indices.bufferView];
const indexOffset=(indexView.byteOffset||0)+(indices.byteOffset||0);
const gridWidth=96,gridHeight=52;
if (positions.count!==gridWidth*gridHeight) throw new Error('Malha de demonstração inesperada.');
const heights=Array.from({length:positions.count},(_,i)=>binary.readFloatLE(positionOffset+i*12+8));
let smoothed=heights;
for(let pass=0;pass<3;pass++){
  const next=new Array(smoothed.length);
  for(let y=0;y<gridHeight;y++)for(let x=0;x<gridWidth;x++){
    let sum=0,total=0;
    for(let dy=-2;dy<=2;dy++)for(let dx=-2;dx<=2;dx++){
      const yy=Math.max(0,Math.min(gridHeight-1,y+dy)),xx=Math.max(0,Math.min(gridWidth-1,x+dx));
      const weight=dx===0&&dy===0?3:1;
      sum+=smoothed[yy*gridWidth+xx]*weight;total+=weight;
    }
    next[y*gridWidth+x]=sum/total;
  }
  smoothed=next;
}
let highest=0;
for(let i=0;i<smoothed.length;i++){
  const value=0.032*(1-Math.exp(-smoothed[i]/0.017));
  binary.writeFloatLE(value,positionOffset+i*12+8);
  highest=Math.max(highest,value);
}
positions.max[2]=highest;
const accepted=[];
for(let i=0;i<indices.count;i+=3){
  const triangle=[0,1,2].map(j=>binary.readUInt32LE(indexOffset+(i+j)*4));
  const inside=triangle.every(vertex=>{
    const x=binary.readFloatLE(positionOffset+vertex*12),y=binary.readFloatLE(positionOffset+vertex*12+4);
    return (x/.169)**2+(y/.099)**2<=1;
  });
  if(inside)accepted.push(...triangle);
}
const newIndices=Buffer.alloc(accepted.length*4);
accepted.forEach((value,i)=>newIndices.writeUInt32LE(value,i*4));
const padding=(4-binary.length%4)%4;
const indexStart=binary.length+padding;
binary=Buffer.concat([binary,Buffer.alloc(padding),newIndices]);
indexView.byteOffset=indexStart;indexView.byteLength=newIndices.length;
indices.count=accepted.length;
gltf.buffers[0].byteLength=binary.length;
const json=Buffer.from(JSON.stringify(gltf),'utf8');
const paddedJson=Buffer.concat([json,Buffer.alloc((4-json.length%4)%4,0x20)]);
const paddedBinary=Buffer.concat([binary,Buffer.alloc((4-binary.length%4)%4)]);
const output=Buffer.alloc(12+8+paddedJson.length+8+paddedBinary.length);
output.writeUInt32LE(0x46546c67,0);output.writeUInt32LE(2,4);output.writeUInt32LE(output.length,8);
output.writeUInt32LE(paddedJson.length,12);output.writeUInt32LE(0x4e4f534a,16);paddedJson.copy(output,20);
const binStart=20+paddedJson.length;
output.writeUInt32LE(paddedBinary.length,binStart);output.writeUInt32LE(0x004e4942,binStart+4);paddedBinary.copy(output,binStart+8);
await fs.writeFile(destination,output);
console.log(`Demo ajustado: ${accepted.length/3} triângulos, altura máxima ${highest.toFixed(3)} m.`);

// GLB 2.0 bounds and physical-size calibration. Units in the output are metres.
const MAGIC = 0x46546c67;
const JSON_CHUNK = 0x4e4f534a;
const BIN_CHUNK = 0x004e4942;

function parseGlb(input) {
  const data = Buffer.from(input);
  if (data.length < 20 || data.readUInt32LE(0) !== MAGIC || data.readUInt32LE(4) !== 2 || data.readUInt32LE(8) !== data.length) {
    throw new Error('Arquivo GLB 2.0 inválido.');
  }
  let offset = 12, json, binary = Buffer.alloc(0);
  while (offset + 8 <= data.length) {
    const length = data.readUInt32LE(offset), type = data.readUInt32LE(offset + 4);
    offset += 8;
    if (offset + length > data.length) throw new Error('Blocos do GLB inválidos.');
    if (type === JSON_CHUNK) json = JSON.parse(data.subarray(offset, offset + length).toString('utf8'));
    if (type === BIN_CHUNK) binary = data.subarray(offset, offset + length);
    offset += length;
  }
  if (!json?.asset?.version?.startsWith('2')) throw new Error('GLB sem glTF 2.0.');
  for(const resource of [...(json.buffers||[]),...(json.images||[])])
    if(resource.uri && !String(resource.uri).startsWith('data:'))throw new Error('O GLB deve incorporar suas texturas e dados; arquivos externos não são aceitos.');
  return { json, binary };
}

const identity = () => [1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1];
function multiply(a,b) {
  const out = Array(16).fill(0);
  for (let c=0;c<4;c++) for (let r=0;r<4;r++) for (let k=0;k<4;k++) out[c*4+r] += a[k*4+r]*b[c*4+k];
  return out;
}
function matrixFor(node) {
  if (node.matrix) return node.matrix;
  const [x,y,z,w] = node.rotation || [0,0,0,1];
  const [sx,sy,sz] = node.scale || [1,1,1];
  const [tx,ty,tz] = node.translation || [0,0,0];
  return [
    (1-2*(y*y+z*z))*sx,2*(x*y+z*w)*sx,2*(x*z-y*w)*sx,0,
    2*(x*y-z*w)*sy,(1-2*(x*x+z*z))*sy,2*(y*z+x*w)*sy,0,
    2*(x*z+y*w)*sz,2*(y*z-x*w)*sz,(1-2*(x*x+y*y))*sz,0,
    tx,ty,tz,1
  ];
}
function transform(m, p) {
  return [m[0]*p[0]+m[4]*p[1]+m[8]*p[2]+m[12], m[1]*p[0]+m[5]*p[1]+m[9]*p[2]+m[13], m[2]*p[0]+m[6]*p[1]+m[10]*p[2]+m[14]];
}
function accessorBounds(gltf, binary, index) {
  const accessor = gltf.accessors?.[index];
  if (!accessor || accessor.type !== 'VEC3') throw new Error('Modelo sem posições 3D válidas.');
  if (accessor.min?.length === 3 && accessor.max?.length === 3) return { min: accessor.min, max: accessor.max };
  const view = gltf.bufferViews?.[accessor.bufferView];
  if (!view || accessor.componentType !== 5126) throw new Error('Modelo sem limites de geometria calculáveis.');
  const start = (view.byteOffset || 0) + (accessor.byteOffset || 0);
  const stride = view.byteStride || 12;
  const min = [Infinity,Infinity,Infinity], max = [-Infinity,-Infinity,-Infinity];
  for (let i=0;i<accessor.count;i++) for (let j=0;j<3;j++) {
    const n = binary.readFloatLE(start+i*stride+j*4);
    min[j] = Math.min(min[j],n); max[j] = Math.max(max[j],n);
  }
  return { min, max };
}
export function getBounds(input) {
  const { json, binary } = parseGlb(input);
  const scene = json.scenes?.[json.scene || 0];
  if (!scene) throw new Error('Modelo sem cena 3D.');
  const min = [Infinity,Infinity,Infinity], max = [-Infinity,-Infinity,-Infinity];
  const seen = new Set();
  const visit = (index, parent) => {
    if (seen.has(index)) throw new Error('Hierarquia circular no GLB.');
    seen.add(index);
    const node = json.nodes?.[index];
    if (!node) throw new Error('Nó 3D inválido.');
    const matrix = multiply(parent,matrixFor(node));
    const mesh = json.meshes?.[node.mesh];
    for (const primitive of mesh?.primitives || []) {
      const position = primitive.attributes?.POSITION;
      if (position === undefined) continue;
      const bounds = accessorBounds(json,binary,position);
      for (const x of [bounds.min[0],bounds.max[0]]) for (const y of [bounds.min[1],bounds.max[1]]) for (const z of [bounds.min[2],bounds.max[2]]) {
        const p = transform(matrix,[x,y,z]);
        for (let a=0;a<3;a++) { min[a] = Math.min(min[a],p[a]); max[a] = Math.max(max[a],p[a]); }
      }
    }
    for (const child of node.children || []) visit(child,matrix);
    seen.delete(index);
  };
  for (const root of scene.nodes || []) visit(root,identity());
  if (!min.every(Number.isFinite)) throw new Error('Modelo 3D vazio.');
  return { min, max, size: max.map((v,i)=>v-min[i]) };
}

export function inspectGlb(input) {
  const data=Buffer.from(input);
  const {json}=parseGlb(data);
  let triangles=0;
  for(const mesh of json.meshes||[])for(const primitive of mesh.primitives||[]){
    const count=json.accessors?.[primitive.indices ?? primitive.attributes?.POSITION]?.count||0;
    const mode=primitive.mode??4;
    if(mode===4)triangles+=Math.floor(count/3);
    else if(mode===5||mode===6)triangles+=Math.max(0,count-2);
  }
  return {bytes:data.length,triangles,images:(json.images||[]).length,animations:(json.animations||[]).length};
}

export function calibrateGlb(input, dimensionsCm, upAxis='auto', strict=false) {
  const { json, binary } = parseGlb(input);
  const bounds = getBounds(input);
  const axis=upAxis==='auto' ? (bounds.size[2] < bounds.size[1]*0.7 && bounds.size[2] < bounds.size[0]*0.7 ? 'z':'y') : upAxis;
  if (!['y','z'].includes(axis)) throw new Error('Eixo vertical inválido.');
  const oriented=axis==='z' ? {
    min:[bounds.min[0],bounds.min[2],-bounds.max[1]],
    max:[bounds.max[0],bounds.max[2],-bounds.min[1]],
    size:[bounds.size[0],bounds.size[2],bounds.size[1]]
  } : bounds;
  const target = [dimensionsCm.width,dimensionsCm.height,dimensionsCm.depth].map(v=>Number(v)/100);
  if (target.some(v=>!Number.isFinite(v)||v<=0||v>3) || oriented.size.some(v=>v<=0)) throw new Error('Medidas físicas ou geometria inválidas.');
  const requestedScale = target.map((v,i)=>v/oriented.size[i]);
  const distortion=Math.max(...requestedScale)/Math.min(...requestedScale);
  if(strict && distortion>1.03)throw new Error('As proporções do GLB diferem mais de 3% das medidas. Corrija o modelo, as medidas ou a orientação para não deformar o prato.');
  // Real food keeps its shape: only a single uniform scale may be applied.
  const uniformScale=Math.cbrt(requestedScale[0]*requestedScale[1]*requestedScale[2]);
  const scale=strict?[uniformScale,uniformScale,uniformScale]:requestedScale;
  const oldRoots = [...(json.scenes?.[json.scene || 0]?.nodes || [])];
  let childRoots=oldRoots;
  if (axis==='z') {
    const rotationNode=json.nodes.length;
    json.nodes.push({name:'Mesa3D — Z para Y',children:oldRoots,rotation:[-Math.SQRT1_2,0,0,Math.SQRT1_2]});
    childRoots=[rotationNode];
  }
  const wrapper = json.nodes.length;
  json.nodes.push({ name:'Mesa3D — escala física calibrada', children:childRoots, scale,
    translation:[-(oriented.min[0]+oriented.max[0])/2*scale[0],-oriented.min[1]*scale[1],-(oriented.min[2]+oriented.max[2])/2*scale[2]] });
  json.scenes[json.scene || 0].nodes = [wrapper];
  const encoded = Buffer.from(JSON.stringify(json),'utf8');
  const jsonPadding = (4-encoded.length%4)%4;
  const paddedJson = Buffer.concat([encoded,Buffer.alloc(jsonPadding,0x20)]);
  const binPadding = (4-binary.length%4)%4;
  const paddedBin = Buffer.concat([binary,Buffer.alloc(binPadding)]);
  const out = Buffer.alloc(12+8+paddedJson.length+8+paddedBin.length);
  out.writeUInt32LE(MAGIC,0); out.writeUInt32LE(2,4); out.writeUInt32LE(out.length,8);
  out.writeUInt32LE(paddedJson.length,12); out.writeUInt32LE(JSON_CHUNK,16); paddedJson.copy(out,20);
  const offset=20+paddedJson.length;
  out.writeUInt32LE(paddedBin.length,offset); out.writeUInt32LE(BIN_CHUNK,offset+4); paddedBin.copy(out,offset+8);
  return { buffer:out, nativeSize:bounds.size, appliedScale:scale, shapeDeviation:distortion-1, upAxis:axis,
    actualSizeCm:oriented.size.map((v,i)=>Number((v*scale[i]*100).toFixed(2))) };
}

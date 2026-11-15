import {nativeStatus} from '../local-3d.js';
const status=nativeStatus();
console.log('\nMesa3D: verificacao do motor de fotogrametria LOCAL (sem API)\n');
for(const [name,ok] of Object.entries(status.tools)){
  const optional=['CreateStructure','TransformScene'].includes(name) ||
    (status.ready && status.mode==='openmvs' && ['colmap','InterfaceCOLMAP'].includes(name));
  console.log(`${ok?'[OK]':optional?'[OPCIONAL]':'[FALTA]'} ${name}`);
}
if(status.ready)console.log(`\n${status.engine} localizado e inicializando. O teste real de reconstrução ainda é necessário.\n`);
else console.log(`\nDependencias obrigatorias ausentes: ${status.missing.join(', ')}. Abra o instalador.\n`);
process.exitCode=status.ready?0:1;

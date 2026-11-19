import {api} from './common.js';
const $=id=>document.getElementById(id);
let localUrl=null,referenceUrls=[],demoSelected=false;
const demo='/assets/filet-demo-optimized.glb';
function updateModel(blob){if(localUrl)URL.revokeObjectURL(localUrl);localUrl=blob instanceof Blob?URL.createObjectURL(blob):null;$('labViewer').src=localUrl||blob;}
$('modelFile').addEventListener('change',()=>{const file=$('modelFile').files[0];if(file){demoSelected=false;updateModel(file);$('analysis').textContent='Arquivo carregado para prévia. Clique em Analisar.'}});
$('loadDemo').addEventListener('click',async()=>{const res=await fetch(demo);if(!res.ok)return;$('modelFile').value='';demoSelected=true;updateModel(demo);$('width').value=34;$('depth').value=20;$('height').value=3.1;$('axis').value='z';$('analysis').textContent='Exemplo visual carregado. Esse 3D é ilustrativo e não é um scan real.';});
$('referenceImages').addEventListener('change',()=>{referenceUrls.forEach(URL.revokeObjectURL);referenceUrls=[];$('referencePreview').replaceChildren();for(const file of $('referenceImages').files){const url=URL.createObjectURL(file);referenceUrls.push(url);const image=document.createElement('img');image.src=url;image.alt='Foto de referência';$('referencePreview').appendChild(image)}});
$('analyze').addEventListener('click',async()=>{
  const button=$('analyze');button.disabled=true;
  $('analysis').textContent='Analisando geometria e dimensões…';$('analysis').className='lab-report';
  try{
    const file=$('modelFile').files[0]||(demoSelected?new File([await (await fetch(demo)).blob()],'exemplo.glb',{type:'model/gltf-binary'}):null);
    if(!file)throw new Error('Escolha um GLB ou clique em Usar modelo demonstrativo.');
    const data=new FormData();data.append('model',file);
    for(const [name,id] of [['width','width'],['depth','depth'],['height','height'],['upAxis','axis']])data.append(name,$(id).value);
    const result=await api('/api/lab/analyze',{method:'POST',body:data});
    const size=(result.bytes/1024/1024).toFixed(2);
    const rows=[`GLB válido: ${result.valid?'SIM':'NÃO'}`,`Tamanho: ${size} MB (limite: 20 MB)`,`Triângulos: ${result.triangles.toLocaleString('pt-BR')} (limite: 180.000)`,`Texturas/imagens embutidas: ${result.images}`,`Adequado aos limites do celular: ${result.mobileReady?'SIM':'NÃO'}`];
    if(result.calibration)rows.push(result.calibration.ok?`Proporção das medidas: COMPATÍVEL (diferença ${result.calibration.deviationPct}%) · eixo ${result.calibration.upAxis} · escala ${result.calibration.actualSizeCm.join(' × ')} cm`:`Proporção das medidas: INCOMPATÍVEL — ${result.calibration.reason}`);
    else rows.push('Preencha as três medidas para avaliar a compatibilidade de escala.');
    $('analysis').textContent=rows.join('\n');$('analysis').className='lab-report '+(result.mobileReady&&result.calibration?.ok?'good':'bad');
  }catch(error){$('analysis').textContent='Não foi possível analisar: '+error.message+'\nEntre no painel administrativo para usar o laboratório.';$('analysis').className='lab-report bad'}finally{button.disabled=false}
});

const section=$('localForm')?.closest('section');
if(section){section.hidden=true;}

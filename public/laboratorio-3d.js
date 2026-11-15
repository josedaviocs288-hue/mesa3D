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

// Reconstrucao local no proprio site. O servidor faz a fila e roda as ferramentas.
const params=new URLSearchParams(location.search);
const dishId=params.get('dishId')||'',portionId=params.get('portionId')||'',loja=params.get('loja')||'';
const localApi=(endpoint,options)=>api(loja?endpoint+(endpoint.includes('?')?'&':'?')+'loja='+encodeURIComponent(loja):endpoint,options);
let workingJob='',timer=null,ready=false;
const showStatus=(text,ok=false)=>{$('engineStatus').textContent=text;$('engineStatus').className='lab-report '+(ok?'good':'bad')};
async function checkEngine(){
  try{
    const result=await api('/api/local3d/status');ready=result.ready;
    showStatus(result.ready?'✓ '+result.engine+' detectado. Pode iniciar o teste com fotos reais; a qualidade não foi validada.':
      'Motor 3D indisponível: '+(result.missing||[]).join(', ')+'. Execute o instalador novamente.',ready);
    $('localStart').disabled=!ready;
  }catch(e){showStatus('Faça login como administrador antes de utilizar o laboratório: '+e.message)}
}
checkEngine();
$('localPhotos').addEventListener('change',()=>{
  const files=[...$('localPhotos').files],count=files.length;
  const mb=files.reduce((n,f)=>n+f.size,0)/1048576;
  $('localCount').textContent=`${count} fotografias · ${mb.toFixed(1)} MB. Recomendado: 30 a 60 fotos com bastante sobreposição.`;
});
$('localForm').addEventListener('submit',async event=>{
  event.preventDefault();
  if(workingJob)return;
  const files=[...$('localPhotos').files],sum=files.reduce((n,f)=>n+f.size,0);
  if(files.length<20||files.length>80){showStatus('Selecione entre 20 e 80 fotos.');return}
  if(sum>300*1024*1024){showStatus('Limite de 300 MB no total. Reduza a resolucao das fotos.');return}
  const button=$('localStart');button.disabled=true;button.textContent='Enviando fotografias…';
  try{
    const body=new FormData();for(const photo of files)body.append('photos',photo);
    if(dishId&&portionId){body.append('dishId',dishId);body.append('portionId',portionId)}
    const result=await localApi('/api/local3d/jobs',{method:'POST',body});
    workingJob=result.id;$('localProgress').hidden=false;
    $('localStep').textContent='Reconstrucao iniciada.';
    button.textContent='Em processamento…';
    await updateJob();timer=setInterval(updateJob,5000);
  }catch(e){showStatus(e.message);button.disabled=!ready;button.textContent='Gerar modelo 3D local ↗'}
});
async function updateJob(){
  if(!workingJob)return;
  try{
    const job=await api(`/api/local3d/jobs/${encodeURIComponent(workingJob)}`);
    $('localStep').textContent=job.step+' · '+job.status;
    $('localBar').value=job.progress||0;
    $('localPercent').textContent=(job.progress||0)+'% (estimativa por etapas, não é tempo restante)';
    $('localLog').textContent=(job.log||'').slice(-2400);
    if(['review','failed'].includes(job.status)){
      clearInterval(timer);timer=null;
      $('localStart').textContent='Gerar outro modelo ↗';$('localStart').disabled=!ready;workingJob='';
      if(job.status==='failed')showStatus('A reconstrucao falhou: '+job.error+' Verifique as fotos e o registro.',false);
      else{
        const url=`/api/local3d/jobs/${encodeURIComponent(job.id)}/glb`;
        showStatus('GLB real gerado. Inspecione a textura, os contornos e a escala antes de publicar.',true);
        $('localActions').hidden=false;
        $('localDownload').href=url+'?baixar=1';
        const blob=await(await fetch(url)).blob();
        if(!blob.size)throw new Error('O GLB retornou vazio.');
        updateModel(blob);
        $('localAttach').hidden=!(job.dishId&&job.portionId);
        $('localAttach').dataset.job=job.id;
      }
    }
  }catch(e){$('localStep').textContent='Falha ao consultar o processo: '+e.message}
}
$('localAttach').addEventListener('click',async()=>{
  const id=$('localAttach').dataset.job;if(!id)return;
  const button=$('localAttach');button.disabled=true;
  try{
    const result=await localApi(`/api/local3d/jobs/${encodeURIComponent(id)}/attach`,{method:'POST',body:'{}'});
    showStatus('Modelo vinculado à porção para revisão. Abra o Estúdio, confira as fotos e a escala, e aprove.',true);
    button.textContent='Enviado ao prato ✓';
  }catch(e){showStatus('Nao foi possivel vincular o modelo: '+e.message);button.disabled=false}
});

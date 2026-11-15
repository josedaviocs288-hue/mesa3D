const viewer=document.getElementById('scaleModel');
const button=document.getElementById('launchTest');
const status=document.getElementById('cameraTestStatus');
let loaded=false;

viewer.addEventListener('load',()=>{
  loaded=true;button.disabled=false;button.textContent='Projetar 10 cm na mesa ↗';
  status.textContent='Régua pronta. Abra a câmera, toque na mesa e compare com uma régua física.';
});
viewer.addEventListener('error',()=>{loaded=false;button.disabled=true;button.textContent='Modelo indisponível';status.textContent='A régua 3D não carregou. Atualize a página e tente novamente.'});
button.addEventListener('click',()=>{
  if(!loaded)return;
  if(!window.isSecureContext){status.textContent='Abra esta página pelo endereço HTTPS do teste no celular.';return}
  if(!viewer.canActivateAR){status.textContent='AR indisponível neste navegador ou aparelho. Você ainda pode girar a régua 3D na tela.';return}
  status.textContent='Aponte para uma mesa iluminada, mova o celular devagar e toque na superfície.';
  try{Promise.resolve(viewer.activateAR()).catch(()=>{status.textContent='Não foi possível abrir a AR. Verifique as permissões da câmera e o navegador.'})}
  catch{status.textContent='Não foi possível abrir a AR. Verifique as permissões da câmera e o navegador.'}
});
viewer.addEventListener('ar-status',event=>{
  const state=event.detail?.status;
  if(state==='object-placed')status.textContent='Régua posicionada. Compare com 10 cm reais e mova o celular ao redor para conferir o rastreamento.';
  if(state==='failed')status.textContent='A AR não iniciou. Tente outra superfície iluminada ou um navegador compatível.';
});
viewer.addEventListener('ar-tracking',event=>{if(event.detail?.status==='not-tracking')status.textContent='Rastreamento perdido. Ilumine a mesa e mova o celular lentamente.'});

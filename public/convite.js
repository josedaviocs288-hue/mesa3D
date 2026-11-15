const form=document.getElementById('inviteForm');
const feedback=document.getElementById('inviteFeedback');
form.addEventListener('submit',async event=>{
  event.preventDefault();
  const button=form.querySelector('button');
  button.disabled=true;feedback.textContent='Verificando o convite…';
  try{
    const response=await fetch('/api/pilot/access',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({code:form.elements.code.value})});
    const result=await response.json();
    if(!response.ok)throw new Error(result.error||'Não foi possível abrir o teste.');
    const requested=new URLSearchParams(location.search).get('voltar')||'/';
    location.replace(requested.startsWith('/')&&!requested.startsWith('//')?requested:'/');
  }catch(error){feedback.textContent=error.message;button.disabled=false;form.elements.code.focus()}
});

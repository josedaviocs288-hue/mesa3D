// Configuracao inicial simples para testes offline. A senha nao fica no ZIP distribuido.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
const root=path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const env=path.join(root,'.env');
if(!fs.existsSync(env)){
  const login='admin@mesa3d.local';
  const senha=crypto.randomBytes(18).toString('base64url');
  const chave=crypto.randomBytes(32).toString('hex');
  fs.writeFileSync(env,[
    'HOST=127.0.0.1','PORT=8080',`OWNER_EMAIL=${login}`,
    `OWNER_PASSWORD=${senha}`,`MESA3D_ENCRYPTION_KEY=${chave}`,
    'PILOT_ACCESS_CODE=','PLAN_MONTHLY_CENTS=0','MESHY_API_KEY=',''
  ].join('\n'),{mode:0o600,flag:'wx'});
  fs.writeFileSync(path.join(root,'ACESSO-LOCAL.txt'),
    `MESA3D - INSTALACAO LOCAL DE TESTES\n\nSite: http://127.0.0.1:8080/acesso.html\n`+
    `Login: ${login}\nSenha: ${senha}\n\n`+
    'Esta senha foi criada apenas no SEU computador. Nao compartilhe este arquivo.\n'+
    'Nao use essas credenciais em hospedagem publica.\n',{mode:0o600,flag:'wx'});
  console.log('Credenciais locais criadas em ACESSO-LOCAL.txt (não compartilhe).');
}else console.log('.env existente preservado. Nenhuma senha alterada.');

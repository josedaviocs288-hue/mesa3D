import fs from 'node:fs';
import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.dirname(path.dirname(fileURLToPath(import.meta.url)));
process.chdir(root);
const envPath=path.join(root,'.env');
if(!fs.existsSync(envPath)){
  const cfg=spawnSync(process.execPath,['tools/configurar-local.mjs'],{stdio:'inherit'});
  if(cfg.status!==0)process.exit(cfg.status||1);
}else console.log('Configuração .env já existente. Usando credenciais salvas.');
if(!fs.existsSync(path.join(root,'node_modules','express'))){
  console.log('Instalando dependências...');
  const result=spawnSync(process.platform==='win32'?'npm.cmd':'npm',['ci'],{stdio:'inherit'});
  if(result.status!==0)process.exit(result.status||1);
}
console.log('Iniciando Mesa3D em http://localhost:8080');
const result=spawnSync(process.execPath,['--env-file-if-exists=.env','server.js'],{stdio:'inherit',env:process.env});
process.exit(result.status||0);

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.dirname(path.dirname(fileURLToPath(import.meta.url)));

test('v8.3 oferece instalar e abrir no Linux Mint sem API de geracao',async()=>{
  const install=await fs.readFile(path.join(root,'instalador/instalar-linux.py'),'utf8');
  const starter=await fs.readFile(path.join(root,'instalador/iniciar-linux.sh'),'utf8');
  const launcher=await fs.readFile(path.join(root,'Instalar-Mesa3D-Linux.sh'),'utf8');
  assert.match(install,/nodejs\.org\/dist\/index\.json/);
  assert.match(install,/api\.github\.com\/repos\/cdcseacave\/openMVS\/releases\/tags\/v2\.4\.0/);
  assert.match(install,/sha256/);
  assert.match(install,/npm.*ci/);
  assert.match(starter,/127\.0\.0\.1:8080\/acesso\.html/);
  assert.match(starter,/LD_LIBRARY_PATH/);
  assert.match(launcher,/instalador\/instalar-linux\.py/);
  assert.doesNotMatch(install,/MESHY_API_KEY\s*=\s*\S+/);
});

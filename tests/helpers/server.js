import {spawn} from 'node:child_process';
import {mkdtemp, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

export async function startServer({dataDir, env = {}} = {}) {
  const owned = !dataDir;
  dataDir ||= await mkdtemp(path.join(tmpdir(), 'mesa3d-test-'));
  const root = fileURLToPath(new URL('../../', import.meta.url));
  const child = spawn(process.execPath, ['server.js'], {
    cwd: root,
    env: {PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, TEMP: tmpdir(), TMP: tmpdir(),
      HOST: '127.0.0.1', PORT: '0', MESA3D_DATA_DIR: dataDir, ...env},
    stdio: ['ignore','pipe','pipe'], windowsHide:true,
  });
  let output = '';
  const stop = async () => {
    if (child.exitCode === null && child.signalCode === null) {
      const done = new Promise(resolve => child.once('exit', resolve));
      child.kill(); await done;
    }
    if (owned) await rm(dataDir, {recursive:true,force:true});
  };
  try {
    const baseUrl = await new Promise((resolve,reject) => {
      const timeout = setTimeout(() => reject(new Error('Server timeout: '+output)), 15000);
      const read = chunk => {
        output += chunk;
        const match = output.match(/http:\/\/127\.0\.0\.1:(\d+)/);
        if (match) {clearTimeout(timeout); resolve(match[0]);}
      };
      child.stdout.on('data',read); child.stderr.on('data',read);
      child.once('error', e => {clearTimeout(timeout);reject(e)});
      child.once('exit', () => {clearTimeout(timeout);reject(new Error('Server exited: '+output))});
    });
    return {baseUrl, dataDir, stop};
  } catch (error) {await stop();throw error;}
}

export async function login(baseUrl, email, password) {
  const response = await fetch(baseUrl+'/api/auth/login', {
    method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email,password}),
  });
  if (!response.ok) throw new Error('Fixture login failed: '+await response.text());
  return response.headers.get('set-cookie').split(';')[0];
}

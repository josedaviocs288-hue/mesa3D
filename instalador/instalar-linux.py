#!/usr/bin/env python3
"""Instalador local do Mesa3D para Linux Mint 22.x/Ubuntu 24.04 x86_64.

Obtém binários oficiais, verifica SHA256, instala dentro de .mesa3d,
sem substituir o Node.js do sistema nem pedir conta na nuvem.
"""
from __future__ import annotations

import hashlib
import json
import os
from pathlib import Path
import platform
import re
import shutil
import stat
import subprocess
import sys
import tarfile
import tempfile
import urllib.error
import urllib.request
import zipfile

ROOT = Path(__file__).resolve().parent.parent
LOCAL = ROOT / '.mesa3d'
DOWNLOADS = LOCAL / 'downloads'
NODE = LOCAL / 'node'
MVS = LOCAL / 'openmvs'
VERSION = 'v2.4.0'
AGENT = 'Mesa3D-v8.3-Linux-Installer'


def info(message: str) -> None:
    print(f'\n[Mesa3D] {message}', flush=True)


def request(url: str):
    if not url.startswith('https://'):
        raise RuntimeError(f'O instalador recusou endereco sem HTTPS: {url}')
    return urllib.request.Request(url, headers={'User-Agent': AGENT, 'Accept': 'application/vnd.github+json'})


def read_json(url: str):
    try:
        with urllib.request.urlopen(request(url), timeout=40) as response:
            return json.load(response)
    except urllib.error.HTTPError as exc:
        raise RuntimeError(f'Falha ao consultar {url}: HTTP {exc.code} (conexao ou limite de requisicoes).') from exc


def sha256(file: Path) -> str:
    digest = hashlib.sha256()
    with file.open('rb') as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b''):
            digest.update(block)
    return digest.hexdigest()


def download(url: str, target: Path, digest: str) -> None:
    if not re.fullmatch(r'[a-f0-9]{64}', digest.lower()):
        raise RuntimeError('SHA256 confiavel indisponivel: download recusado.')
    target.parent.mkdir(parents=True, exist_ok=True)
    if target.is_file() and sha256(target) == digest.lower():
        info(f'Pacote ja verificado: {target.name}')
        return
    temp = target.with_name(target.name + '.parcial')
    temp.unlink(missing_ok=True)
    info(f'Baixando {target.name} do fornecedor oficial (primeiro uso exige internet)')
    try:
        with urllib.request.urlopen(request(url), timeout=90) as source, temp.open('wb') as out:
            shutil.copyfileobj(source, out, 1024 * 1024)
        if sha256(temp) != digest.lower():
            raise RuntimeError(f'Hash SHA256 incorreto: {target.name}. Nenhum arquivo sera executado.')
        temp.replace(target)
    finally:
        temp.unlink(missing_ok=True)


def check_system() -> None:
    if sys.platform != 'linux' or platform.machine().lower() not in ('x86_64', 'amd64'):
        raise RuntimeError('Este instalador beta suporta apenas Linux Mint/Ubuntu x86_64 (64 bits).')
    os_release = Path('/etc/os-release').read_text(errors='replace') if Path('/etc/os-release').exists() else ''
    if not any(x in os_release.lower() for x in ('ubuntu', 'linuxmint', 'linux mint')):
        raise RuntimeError('Suporte automatico preparado para Ubuntu/Linux Mint. Consulte INSTALAR-3D-LOCAL.md.')
    if shutil.which('python3') is None:
        raise RuntimeError('Python 3 nao encontrado.')
    if not shutil.which('tar'):
        raise RuntimeError('O comando tar precisa estar instalado.')
    if (ROOT / '.env.production').exists() and not (ROOT / '.env').exists():
        info('Configuracao de producao existente detectada. Este instalador cria somente .env local separado.')


def node_version(index: list[dict]) -> tuple[str, str]:
    for release in index:
        version = release.get('version', '')
        if re.fullmatch(r'v24\.\d+\.\d+', version) and 'linux-x64' in release.get('files', []):
            return version, f'node-{version}-linux-x64.tar.xz'
    raise RuntimeError('Node.js 24 Linux x64 nao encontrado no indice oficial.')


def checksum_from_shasums(text: str, filename: str) -> str:
    for line in text.splitlines():
        parts = line.strip().split()
        if len(parts) == 2 and parts[1].lstrip('*') == filename and re.fullmatch('[a-fA-F0-9]{64}', parts[0]):
            return parts[0].lower()
    raise RuntimeError(f'Nao foi encontrado hash oficial para {filename}.')


def install_node() -> Path:
    binary = NODE / 'bin' / 'node'
    if binary.exists():
        check = subprocess.run([str(binary), '--version'], capture_output=True, text=True)
        if check.returncode == 0 and re.fullmatch(r'v24\.\d+\.\d+', check.stdout.strip()):
            info(f'Node.js ja configurado: {check.stdout.strip()}')
            return binary
    info('Etapa 1/4: instalando Node.js 24 portatil')
    version, filename = node_version(read_json('https://nodejs.org/dist/index.json'))
    base = f'https://nodejs.org/dist/{version}/'
    with urllib.request.urlopen(request(base + 'SHASUMS256.txt'), timeout=40) as source:
        digest = checksum_from_shasums(source.read().decode(), filename)
    archive = DOWNLOADS / filename
    download(base + filename, archive, digest)
    with tempfile.TemporaryDirectory(dir=LOCAL, prefix='node-temporario-') as temporary:
        folder = Path(temporary)
        subprocess.run(['tar', '-xJf', str(archive), '-C', str(folder)], check=True)
        unpacked = folder / f'node-{version}-linux-x64'
        if not (unpacked / 'bin/node').is_file() or not (unpacked / 'bin/npm').exists():
            raise RuntimeError('Pacote Node.js esta incompleto.')
        if NODE.exists():
            shutil.rmtree(NODE)
        shutil.move(str(unpacked), str(NODE))
    subprocess.run([str(binary), '--version'], check=True)
    return binary


def select_ubuntu_asset(release: dict) -> dict:
    if release.get('tag_name') != VERSION:
        raise RuntimeError('A API retornou outra versao do OpenMVS; instalacao cancelada.')
    assets = release.get('assets') or []
    candidates = [a for a in assets if re.search(r'(?:ubuntu|linux)', a.get('name', ''), re.I)
                  and re.search(r'(?:x64|amd64|x86_64)', a.get('name', ''), re.I)
                  and re.search(r'\.(zip|tar\.gz|tgz)$', a.get('name', ''), re.I)]
    if not candidates:
        raise RuntimeError('A release OpenMVS 2.4.0 nao tem pacote Ubuntu x64 identificado. Confira a release oficial.')
    asset = candidates[0]
    if not re.fullmatch(r'sha256:[a-f0-9]{64}', str(asset.get('digest') or '').lower()):
        raise RuntimeError('Release OpenMVS sem SHA256 publicado pela API. Recusado por seguranca.')
    if not str(asset.get('browser_download_url', '')).startswith('https://github.com/cdcseacave/openMVS/releases/download/v2.4.0/'):
        raise RuntimeError('Origem do binario OpenMVS inesperada.')
    return asset


def safe_extract_zip(archive: Path, destination: Path) -> None:
    destination.mkdir(parents=True, exist_ok=True)
    base = destination.resolve()
    with zipfile.ZipFile(archive) as package:
        for item in package.infolist():
            member = (base / item.filename).resolve()
            if not member.is_relative_to(base):
                raise RuntimeError('ZIP do motor possui caminho inseguro.')
            mode = (item.external_attr >> 16) & 0o170000
            if mode == stat.S_IFLNK:
                raise RuntimeError('ZIP do motor possui link simbolico nao permitido.')
        package.extractall(destination)


def safe_extract_tar(archive: Path, destination: Path) -> None:
    destination.mkdir(parents=True, exist_ok=True)
    with tarfile.open(archive, 'r:gz') as package:
        for item in package.getmembers():
            member = (destination.resolve() / item.name).resolve()
            if not member.is_relative_to(destination.resolve()) or not (item.isfile() or item.isdir()):
                raise RuntimeError('Pacote OpenMVS contem caminhos ou links inseguros.')
        package.extractall(destination, filter='data')


def locate_engine(base: Path) -> Path | None:
    if not base.is_dir():
        return None
    for candidate in base.rglob('DensifyPointCloud'):
        if candidate.is_file() and all((candidate.parent / name).exists() for name in
          ('ReconstructMesh', 'TextureMesh')):
            return candidate.parent
    return None


def native_libraries(base: Path) -> str:
    dirs = set()
    for item in base.rglob('*.so*'):
        if item.is_file():
            dirs.add(str(item.parent))
    return ':'.join(sorted(dirs))


def install_mvs() -> Path:
    engine_dir = locate_engine(MVS)
    if engine_dir:
        info(f'OpenMVS ja baixado: {engine_dir}')
        return engine_dir
    info('Etapa 3/4: instalando gerador 3D OpenMVS 2.4.0 CPU')
    asset = select_ubuntu_asset(read_json('https://api.github.com/repos/cdcseacave/openMVS/releases/tags/v2.4.0'))
    archive = DOWNLOADS / asset['name']
    download(asset['browser_download_url'], archive, asset['digest'].split(':', 1)[1])
    with tempfile.TemporaryDirectory(dir=LOCAL, prefix='mvs-temporario-') as temporary:
        base = Path(temporary)
        if archive.name.lower().endswith('.zip'):
            safe_extract_zip(archive, base)
        else:
            safe_extract_tar(archive, base)
        folder = locate_engine(base)
        if not folder:
            raise RuntimeError('O download do OpenMVS nao inclui os executaveis exigidos pelo Mesa3D.')
        for name in ('CreateStructure', 'DensifyPointCloud', 'ReconstructMesh',
                     'TextureMesh', 'TransformScene', 'InterfaceCOLMAP'):
            exe = folder / name
            if exe.is_file():
                exe.chmod(exe.stat().st_mode | 0o755)
        if MVS.exists():
            shutil.rmtree(MVS)
        shutil.move(str(base), str(MVS))
    result = locate_engine(MVS)
    if not result:
        raise RuntimeError('Nao foi possivel localizar o motor 3D apos extracao.')
    return result


def config_env(bin_dir: Path) -> None:
    file = ROOT / '.env'
    content = file.read_text() if file.exists() else ''
    new = [line for line in content.splitlines() if not line.startswith(('MESA3D_3D_BIN_DIR=', 'MESA3D_COLMAP_BIN='))]
    new.append(f'MESA3D_3D_BIN_DIR={bin_dir}')
    if not (bin_dir / 'CreateStructure').is_file() and shutil.which('colmap'):
        new.append(f'MESA3D_COLMAP_BIN={shutil.which("colmap")}')
    file.write_text('\n'.join(new) + '\n')
    file.chmod(0o600)


def launch_env(node: Path, bin_dir: Path) -> dict:
    env = os.environ.copy()
    env['PATH'] = f'{NODE / "bin"}:{bin_dir}:' + env.get('PATH', '')
    libs = native_libraries(MVS)
    if libs:
        env['LD_LIBRARY_PATH'] = libs + ':' + env.get('LD_LIBRARY_PATH', '')
    env['MESA3D_3D_BIN_DIR'] = str(bin_dir)
    if shutil.which('colmap'):
        env['MESA3D_COLMAP_BIN'] = shutil.which('colmap')
    return env


def install_app(node: Path, bin_dir: Path) -> None:
    info('Etapa 2/4: preparando bibliotecas e credenciais do site')
    env = launch_env(node, bin_dir)
    npm = NODE / 'bin' / 'npm'
    if not (ROOT / 'node_modules/express').exists():
        subprocess.run([str(npm), 'ci', '--no-audit', '--no-fund'], cwd=ROOT, env=env, check=True)
    subprocess.run([str(node), 'tools/configurar-local.mjs'], cwd=ROOT, env=env, check=True)


def check_engine(node: Path, bin_dir: Path) -> None:
    info('Etapa 4/4: checando motor 3D e criando atalhos')
    env = launch_env(node, bin_dir)
    result = subprocess.run([str(node), '--env-file=.env', 'tools/check-local-3d.mjs'],
                            cwd=ROOT, env=env)
    if result.returncode and not (bin_dir / 'CreateStructure').exists():
        info('Este pacote precisa de COLMAP auxiliar. Instalando pelo gerenciador Ubuntu.')
        if not shutil.which('apt-get') or not shutil.which('sudo'):
            raise RuntimeError('Nao foi possivel instalar COLMAP automaticamente; falta sudo/apt-get.')
        subprocess.run(['sudo', 'apt-get', 'update'], check=True)
        subprocess.run(['sudo', 'apt-get', 'install', '-y', 'colmap'], check=True)
        config_env(bin_dir)
        env = launch_env(node, bin_dir)
        result = subprocess.run([str(node), '--env-file=.env', 'tools/check-local-3d.mjs'], cwd=ROOT, env=env)
    if result.returncode:
        raise RuntimeError('Motor 3D baixado mas nao inicia no seu computador. Confira bibliotecas, permissao e logs. O instalador NAO marcou como pronto.')


def desktop_shortcut() -> None:
    desktop = Path.home() / 'Desktop'
    if not desktop.is_dir():
        # Linux Mint em portugues geralmente usa Area de Trabalho; xdg-user-dir retorna o caminho correto.
        if shutil.which('xdg-user-dir'):
            result = subprocess.run(['xdg-user-dir', 'DESKTOP'], capture_output=True, text=True)
            if result.returncode == 0 and result.stdout.strip():
                desktop = Path(result.stdout.strip())
    if not desktop.is_dir():
        info('Pasta Area de Trabalho nao encontrada. Abra pelo arquivo Abrir-Mesa3D-Linux.sh.')
        return
    shortcut = desktop / 'Mesa3D.desktop'
    target = ROOT / 'Abrir-Mesa3D-Linux.sh'
    shortcut.write_text('[Desktop Entry]\nVersion=1.0\nType=Application\nName=Mesa3D\n'
                        'Comment=Abrir laboratorio de geracao 3D local\n'
                        f'Exec="{target}"\nTerminal=false\nCategories=Graphics;\n'
                        'Icon=applications-graphics\n')
    shortcut.chmod(0o755)
    info(f'Atalho criado: {shortcut} (Linux pode pedir para confiar no atalho no primeiro clique).')


def main() -> None:
    check_system()
    LOCAL.mkdir(exist_ok=True)
    DOWNLOADS.mkdir(exist_ok=True)
    node = install_node()
    # A instalacao das dependencias web nao depende da instalacao nativa do motor.
    install_app(node, locate_engine(MVS) or MVS)
    bin_dir = install_mvs()
    config_env(bin_dir)
    check_engine(node, bin_dir)
    desktop_shortcut()
    info('Instalacao concluida! Abrindo o Mesa3D...')
    subprocess.run(['bash', str(ROOT / 'instalador/iniciar-linux.sh')], cwd=ROOT, check=True)


if __name__ == '__main__':
    try:
        main()
    except KeyboardInterrupt:
        print('\nInstalacao interrompida. Execute novamente para continuar.', file=sys.stderr)
        sys.exit(130)
    except (RuntimeError, OSError, subprocess.CalledProcessError, urllib.error.URLError, ValueError) as exc:
        print(f'\nERRO: {exc}\nNao foi possivel finalizar. Leia GUIA-LINUX.md e execute o instalador novamente.', file=sys.stderr)
        sys.exit(1)

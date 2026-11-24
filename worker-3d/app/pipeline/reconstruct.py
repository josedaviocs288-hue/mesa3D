import hashlib
import json
import os
import shutil
import sys
import time
import math
import struct
import tempfile
from pathlib import Path
from app.config import MAX_SCRATCH_BYTES
from app.contracts import PipelineError
from app.local_runtime import APP_ROOT, local_job_root, open_job_file, sandbox_job
from .commands import run_command

TOOLS=('ffprobe','ffmpeg','colmap','InterfaceCOLMAP','DensifyPointCloud','ReconstructMesh','RefineMesh','TextureMesh','blender','bwrap')

def sandbox_command(argv: list[str], workdir: Path) -> list[str]:
    if sys.platform!='linux' or not shutil.which('bwrap'): raise PipelineError('SANDBOX_UNAVAILABLE')
    if local_job_root.get() is not None:
        root=sandbox_job(workdir)
        temporary=root/'.sandbox-tmp'
        temporary.mkdir(mode=0o700,exist_ok=True)
        if temporary.is_symlink() or not temporary.is_dir():raise PipelineError('SCRATCH_UNSAFE')
        command=[
            '/usr/bin/bwrap','--unshare-user','--disable-userns','--unshare-net',
            '--unshare-pid','--unshare-ipc','--unshare-uts','--unshare-cgroup',
            '--cap-drop','ALL','--die-with-parent','--new-session',
            '--ro-bind','/usr','/usr',
            '--ro-bind','/opt/venv','/opt/venv',
            '--ro-bind','/opt/pratoar/models','/opt/pratoar/models',
            '--ro-bind',str(APP_ROOT/'app'),str(APP_ROOT/'app'),
            '--setenv','PYTHONPATH',str(APP_ROOT),
            '--ro-bind-try','/etc/ld.so.cache','/etc/ld.so.cache',
            '--symlink','usr/bin','/bin','--symlink','usr/lib','/lib',
            '--symlink','usr/lib64','/lib64',
            '--bind',str(root),str(root),'--bind',str(temporary),'/tmp',
            '--proc','/proc','--dev','/dev',
        ]
        if Path('/usr/lib/wsl').is_dir():
            command.extend(['--tmpfs','/usr/lib/wsl'])
        return [*command,'--chdir',str(root),'--',*argv]
    root=str(workdir.resolve())
    profile=os.environ.get('PRATOAR_SANDBOX_PROFILE','standard')
    if profile=='lan':
        runtime=Path(os.environ.get('PRATOAR_LAN_RUNTIME_ROOT','')).resolve()
        if runtime.parent!=Path('/opt') or not runtime.name.startswith('pratoar-'):
            raise PipelineError('SANDBOX_UNAVAILABLE')
        source=Path(__file__).resolve().parents[2]
        return ['bwrap','--unshare-user','--disable-userns','--unshare-net',
            '--unshare-pid','--unshare-ipc','--unshare-uts','--cap-drop','ALL',
            '--die-with-parent','--new-session','--setenv','USER','pratoar',
            '--setenv','TORCHINDUCTOR_CACHE_DIR','/tmp/torchinductor',
            '--ro-bind','/usr','/usr',
            '--symlink','usr/bin','/bin','--symlink','usr/lib','/lib',
            '--symlink','usr/lib64','/lib64',
            '--ro-bind-try','/etc/ld.so.cache','/etc/ld.so.cache',
            '--ro-bind-try','/etc/fonts','/etc/fonts',
            '--ro-bind','/etc/alternatives','/etc/alternatives',
            '--ro-bind',str(runtime/'venv'),str(runtime/'venv'),
            '--ro-bind',str(runtime/'openmvs'),str(runtime/'openmvs'),
            '--ro-bind',str(runtime/'models'),str(runtime/'models'),
            '--ro-bind',str(source/'app'),str(source/'app'),
            '--ro-bind',str(source/'scripts'),str(source/'scripts'),
            '--tmpfs','/tmp','--bind',root,root,'--proc','/proc','--dev','/dev',
            '--chdir',root,'--',*argv]
    if profile=='restricted-proc':
        if not shutil.which('setpriv'):raise PipelineError('SANDBOX_UNAVAILABLE')
        # Vercel supplies ambient capabilities but blocks new procfs mounts.
        # Drop privileges; expose only CPU/memory facts, never parent processes.
        return ['setpriv','--no-new-privs','--inh-caps=-all','--ambient-caps=-all','--bounding-set=-all',
            'bwrap','--unshare-user','--unshare-net','--unshare-pid','--die-with-parent',
            '--ro-bind','/','/','--tmpfs','/tmp','--tmpfs','/proc',
            '--ro-bind','/proc/cpuinfo','/proc/cpuinfo','--ro-bind','/proc/meminfo','/proc/meminfo',
            '--bind',root,root,'--dev','/dev','--chdir',root,'--',*argv]
    if profile!='standard':raise PipelineError('SANDBOX_UNAVAILABLE')
    return ['bwrap','--unshare-net','--unshare-pid','--die-with-parent','--ro-bind','/','/','--tmpfs','/tmp','--bind',root,root,'--proc','/proc','--dev','/dev','--chdir',root,'--',*argv]

def preflight() -> dict:
    from .segmentation import segmentation_weights
    weights=segmentation_weights()
    if any(not shutil.which(name) for name in TOOLS): raise PipelineError('RUNTIME_UNAVAILABLE')
    if sys.platform!='linux': raise PipelineError('SANDBOX_UNAVAILABLE')
    jobs=local_job_root.get()
    with tempfile.TemporaryDirectory(prefix='pratoar-',dir=jobs) as temporary:
        root=Path(temporary)
        run_command(sandbox_command(['true'],root),root,time.monotonic()+10)
        checks=[['colmap','feature_extractor','-h'],['colmap','exhaustive_matcher','-h'],['InterfaceCOLMAP','--help'],['DensifyPointCloud','--help'],['blender','--version'],['blender','--background','--factory-startup','--python-exit-code','1','--python-expr','import numpy']]
        isolated=jobs is not None or os.environ.get('PRATOAR_SANDBOX_PROFILE')=='lan'
        outputs=[run_command(sandbox_command(command,root) if isolated else command,root,time.monotonic()+15,allowed_exit_codes=(0,1) if command[0] in ('InterfaceCOLMAP','DensifyPointCloud') else (0,)).stdout for command in checks]
        if os.environ.get('PRATOAR_SANDBOX_PROFILE')=='lan':
            run_command(sandbox_command([sys.executable,'-c','from mobile_sam import sam_model_registry; import cv2'],root),root,time.monotonic()+30)
        if '--FeatureExtraction.use_gpu' not in outputs[0] or '--FeatureMatching.use_gpu' not in outputs[1]: raise PipelineError('RUNTIME_VERSION_MISMATCH')
        if '--input-file' not in outputs[2] or '--max-threads' not in outputs[3]:raise PipelineError('RUNTIME_VERSION_MISMATCH')
    return {'digest':runtime_digest(weights,local=jobs is not None),'capabilities':['photogrammetry-v1','sandbox-network-off']}


def runtime_digest(weights:Path,*,local:bool=False)->str:
    lock=Path(__file__).resolve().parents[2]/'sources.lock.json'
    digest=hashlib.sha256(lock.resolve().read_bytes())
    digest.update(hashlib.sha256(weights.read_bytes()).digest())
    digest.update(('local' if local else os.environ.get('PRATOAR_SANDBOX_PROFILE','standard')).encode())
    if local:digest.update((APP_ROOT/'runtime-build-inputs.json').read_bytes())
    source_root=Path(__file__).resolve().parents[1]
    for source in sorted(source_root.rglob('*.py')):
        digest.update(source.relative_to(source_root).as_posix().encode());digest.update(source.read_bytes())
    return digest.hexdigest()

def reconstruction_commands(workdir: Path):
    root=str(workdir.resolve());images=f'{root}/frames';db=f'{root}/database.db';sparse=f'{root}/sparse';dense=f'{root}/dense'
    return [
      ('RECONSTRUCTING',['colmap','feature_extractor','--database_path',db,'--image_path',images,'--ImageReader.single_camera','1','--FeatureExtraction.use_gpu','0','--FeatureExtraction.num_threads','2']),
      ('RECONSTRUCTING',['colmap','exhaustive_matcher','--database_path',db,'--FeatureMatching.use_gpu','0','--FeatureMatching.num_threads','2']),
      ('RECONSTRUCTING',['colmap','mapper','--database_path',db,'--image_path',images,'--output_path',sparse]),
      ('RECONSTRUCTING',['colmap','image_undistorter','--image_path',images,'--input_path',f'{sparse}/0','--output_path',dense,'--output_type','COLMAP','--max_image_size','1280']),
      ('RECONSTRUCTING',['InterfaceCOLMAP','-i',dense,'-o',f'{root}/scene.mvs']),
      ('RECONSTRUCTING',['DensifyPointCloud',f'{root}/scene.mvs','-o',f'{root}/dense.mvs','--max-threads','2','--resolution-level','2','--max-resolution','640','--min-resolution','160','--number-views','3','--geometric-iters','1','--archive-type','2']),
      ('RECONSTRUCTING',['ReconstructMesh',f'{root}/dense.mvs','-o',f'{root}/mesh.mvs','--max-threads','2','--archive-type','2']),
      ('RECONSTRUCTING',['RefineMesh',f'{root}/mesh.mvs','-o',f'{root}/refined.mvs','--max-threads','2','--archive-type','2','--resolution-level','2','--min-resolution','160','--max-views','3','--scales','1','--gradient-step','5.05']),
      ('TEXTURING',['TextureMesh',f'{root}/refined.mvs','-o',f'{root}/textured.mvs','--max-threads','2','--archive-type','2','--max-texture-size','2048','--global-seam-leveling','0','--local-seam-leveling','0','--export-type','obj']),
    ]

def select_sparse_model(folder:Path,frame_count:int)->Path:
    candidates=[]
    def read_count(path:Path)->int:
        stream=open_job_file(path,MAX_SCRATCH_BYTES) if local_job_root.get() is not None else path.open('rb')
        with stream:return struct.unpack('<Q',stream.read(8))[0]
    for model in folder.iterdir():
        if not model.is_dir():continue
        try:
            images=read_count(model/'images.bin')
            points=read_count(model/'points3D.bin')
        except (OSError,struct.error):continue
        if max(12,math.ceil(frame_count*.6))<=images<=frame_count and points>=1000:
            candidates.append((images,points,model))
    if not candidates:raise PipelineError('CAPTURE_QUALITY')
    return max(candidates,key=lambda value:value[:2])[2]

def reconstruct(frames:list[Path],workdir:Path,progress,deadline=None)->Path:
    (workdir/'sparse').mkdir(exist_ok=True);(workdir/'dense').mkdir(exist_ok=True)
    for index,(stage,argv) in enumerate(reconstruction_commands(workdir)):
        if index==3:
            argv[argv.index('--input_path')+1]=str(select_sparse_model(workdir/'sparse',len(frames)))
        progress(stage)
        run_command(sandbox_command(argv,workdir),workdir,deadline or time.monotonic()+3600)
    result=workdir/'textured.obj'
    if not result.exists() or not result.with_suffix('.mtl').exists(): raise PipelineError('CAPTURE_QUALITY')
    return result

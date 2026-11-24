import os
import signal
import subprocess
import tempfile
import time
from contextvars import ContextVar
from threading import Event
from dataclasses import dataclass
from pathlib import Path
from app.contracts import PipelineError
from app.config import MAX_SCRATCH_BYTES
from app.local_runtime import LOCAL_PATH, enforce_scratch_limit, local_job_root, sandbox_job
cancellation:ContextVar[Event|None]=ContextVar('cancellation',default=None)
execution_deadline:ContextVar[float|None]=ContextVar('execution_deadline',default=None)

def resource_limits():
    import resource
    resource.setrlimit(resource.RLIMIT_AS,(8*1024**3,8*1024**3))
    resource.setrlimit(resource.RLIMIT_NPROC,(128,128))
    resource.setrlimit(resource.RLIMIT_FSIZE,(10*1024**3,10*1024**3))

@dataclass
class CommandResult:
    stdout: str

def run_command(argv: list[str], cwd: Path, deadline: float, *, allowed_exit_codes: tuple[int,...] = (0,)) -> CommandResult:
    """Bounded subprocess; output is never included in public errors or logs."""
    deadline=min(deadline, execution_deadline.get() or float('inf'))
    stop=cancellation.get()
    local=local_job_root.get() is not None
    if local:
        sandbox_job(cwd)
        if not argv or argv[0]!='/usr/bin/bwrap':raise PipelineError('SANDBOX_UNAVAILABLE')
        enforce_scratch_limit(cwd,MAX_SCRATCH_BYTES)
    if stop is not None and stop.is_set():raise PipelineError('LEASE_LOST')
    if time.monotonic()>=deadline:raise PipelineError('TIMEOUT',True)
    with tempfile.TemporaryFile(dir=cwd if local else None) as output:
        environment={key:os.environ[key] for key in ('PATH','SYSTEMROOT','SystemRoot','WINDIR','TEMP','TMP','PATHEXT') if key in os.environ}
        if local:environment={'PATH':LOCAL_PATH,'TMPDIR':'/tmp','PYTHONDONTWRITEBYTECODE':'1'}
        environment.update({'HOME':'/tmp','XDG_CACHE_HOME':'/tmp/cache','QT_QPA_PLATFORM':'offscreen','OMP_NUM_THREADS':'2','OPENBLAS_NUM_THREADS':'2','LANG':'C.UTF-8'})
        try:
            process=subprocess.Popen(argv,cwd=cwd,stdout=output,stderr=subprocess.STDOUT,
                env=environment,
                stdin=subprocess.DEVNULL,start_new_session=os.name!='nt',
                preexec_fn=resource_limits if os.name!='nt' and not local else None,
                creationflags=subprocess.CREATE_NEW_PROCESS_GROUP if os.name=='nt' else 0)
        except (FileNotFoundError,OSError) as exc:
            raise PipelineError('RUNTIME_UNAVAILABLE') from exc
        last_disk=0
        try:
            while process.poll() is None:
                if stop is not None and stop.is_set(): raise PipelineError('LEASE_LOST')
                if time.monotonic()>=deadline: raise PipelineError('TIMEOUT',True)
                if os.fstat(output.fileno()).st_size>256*1024: raise PipelineError('OUTPUT_LIMIT')
                if time.monotonic()-last_disk>(1 if local else 2):
                    last_disk=time.monotonic()
                    if local:
                        enforce_scratch_limit(cwd,MAX_SCRATCH_BYTES)
                    elif sum(p.stat().st_size for p in cwd.rglob('*') if p.is_file())>MAX_SCRATCH_BYTES: raise PipelineError('DISK_LIMIT')
                time.sleep(.05)
            if local:
                if stop is not None and stop.is_set():raise PipelineError('LEASE_LOST')
                if time.monotonic()>=deadline:raise PipelineError('TIMEOUT',True)
                enforce_scratch_limit(cwd,MAX_SCRATCH_BYTES)
                volume=os.statvfs(cwd)
                if volume.f_bavail==0 or volume.f_favail==0:raise PipelineError('DISK_LIMIT')
            if process.returncode not in allowed_exit_codes: raise PipelineError('PROCESSING_FAILED')
            if os.fstat(output.fileno()).st_size>256*1024: raise PipelineError('OUTPUT_LIMIT')
            output.seek(0)
            return CommandResult(output.read().decode('utf-8',errors='replace'))
        finally:
            if process.poll() is None:
                if os.name=='nt':
                    subprocess.run(['taskkill','/PID',str(process.pid),'/T','/F'],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,check=False)
                else:
                    try:os.killpg(process.pid,signal.SIGKILL)
                    except ProcessLookupError:pass
                process.wait(timeout=5)

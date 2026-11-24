"""Runtime limits and filesystem boundary for the dedicated Linux service."""

import hashlib
import json
import os
import platform
import re
import shutil
import socket
import stat
import sys
import tempfile
import time
from contextvars import ContextVar
from pathlib import Path
from typing import BinaryIO

from app.config import MAX_SCRATCH_BYTES
from app.contracts import PipelineError
from app.credentials import CREDENTIAL_PATH, WORKER_UID

SCRATCH_MOUNT = Path('/var/lib/pratoar-worker/scratch')
SCRATCH_IMAGE = SCRATCH_MOUNT.with_name('scratch.ext4')
JOB_ROOT = SCRATCH_MOUNT / 'jobs'
PREFLIGHT_JOB_ROOT = JOB_ROOT.with_name('preflight-jobs')
APP_ROOT = Path('/opt/pratoar/worker')
DIGEST_PATH = APP_ROOT / 'runtime-digest'
RUNTIME_TREES = (
    APP_ROOT / 'app',
    Path('/opt/venv'),
    Path('/usr/lib/python3.12'),
    Path('/usr/lib/python3/dist-packages'),
    Path('/usr/local/lib'),
    Path('/usr/share/blender'),
)
LOCAL_PATH = '/opt/venv/bin:/usr/local/bin/OpenMVS:/usr/local/bin:/usr/bin:/bin'
local_job_root: ContextVar[Path | None] = ContextVar('local_job_root', default=None)
active_job: ContextVar[Path | None] = ContextVar('active_job', default=None)

SANDBOX_PROBE = """
import ctypes
import errno
import os
import socket
import sys
from pathlib import Path

assert os.readlink('/proc/self/ns/net') != sys.argv[1]
assert all(not Path(path).exists() for path in sys.argv[3:])
assert os.getenv('PRATOAR_WORKER_TOKEN') is None

try:
    forbidden = socket.socket(getattr(socket, 'AF_VSOCK', 40), socket.SOCK_STREAM)
except OSError as error:
    assert error.errno in (errno.EPERM, errno.EACCES, errno.EAFNOSUPPORT, errno.EPROTONOSUPPORT, errno.ENODEV)
else:
    forbidden.close()
    raise RuntimeError('VSOCK_AVAILABLE')

# io_uring_setup is syscall 425 on the supported Linux x86_64 ABI.
kernel = ctypes.CDLL(None, use_errno=True)
parameters = ctypes.create_string_buffer(256)
descriptor = kernel.syscall(425, 1, ctypes.byref(parameters))
if descriptor >= 0:
    os.close(descriptor)
    raise RuntimeError('IO_URING_AVAILABLE')
assert ctypes.get_errno() in (errno.EPERM, errno.EACCES, errno.ENOSYS)

try:
    connection = socket.create_connection(('127.0.0.1', int(sys.argv[2])), timeout=1)
except OSError:
    pass
else:
    connection.close()
    raise RuntimeError('HOST_LOOPBACK_AVAILABLE')
"""


def _scratch_bytes(job_root: Path, max_bytes: int) -> int:
    def fail_closed(error: OSError) -> None:
        if not isinstance(error, FileNotFoundError):
            raise error

    total = 0
    for _, directories, files, descriptor in os.fwalk(job_root, onerror=fail_closed, follow_symlinks=False):
        for name in directories + files:
            try:
                entry = os.stat(name, dir_fd=descriptor, follow_symlinks=False)
            except FileNotFoundError:  # the running tool can remove a temporary file
                continue
            if stat.S_ISDIR(entry.st_mode):
                continue
            if not stat.S_ISREG(entry.st_mode) or entry.st_nlink != 1:
                raise PipelineError('SCRATCH_UNSAFE')
            total += entry.st_size
            if total > max_bytes:
                return total
    return total


def enforce_scratch_limit(job_root: Path, max_bytes: int) -> None:
    try:
        if not stat.S_ISDIR(job_root.lstat().st_mode):
            raise PipelineError('SCRATCH_UNSAFE')
        if _scratch_bytes(job_root, max_bytes) > max_bytes:
            raise PipelineError('DISK_LIMIT')
    except OSError:
        raise PipelineError('SCRATCH_UNSAFE') from None


def _check_cgroups() -> None:
    proc = Path('/proc/self/cgroup').read_text().splitlines()
    if len(proc) != 1 or not proc[0].startswith('0::/'):
        raise PipelineError('CGROUP_LIMITS_UNAVAILABLE')
    cgroup = Path('/sys/fs/cgroup') / proc[0][4:]
    if cgroup.name not in ('pratoar-worker.service', 'pratoar-worker-preflight.service'):
        raise PipelineError('CGROUP_LIMITS_UNAVAILABLE')
    try:
        memory = int((cgroup / 'memory.max').read_text())
        tasks = int((cgroup / 'pids.max').read_text())
        quota, period = map(int, (cgroup / 'cpu.max').read_text().split())
    except (OSError, ValueError):
        raise PipelineError('CGROUP_LIMITS_UNAVAILABLE') from None
    if not (0 < memory <= 8 * 1024**3 and 0 < tasks <= 128 and 0 < quota <= period * 2):
        raise PipelineError('CGROUP_LIMITS_UNAVAILABLE')


def check_local_resources(job_root: Path) -> None:
    import resource

    _check_cgroups()
    file_limit,_=resource.getrlimit(resource.RLIMIT_FSIZE)
    if not 0<file_limit<=MAX_SCRATCH_BYTES:
        raise PipelineError('SCRATCH_LIMIT_UNAVAILABLE')
    _check_scratch_mount(job_root)
    volume=os.statvfs(job_root)
    if volume.f_bavail*volume.f_frsize<1024**3 or volume.f_favail<1024:
        raise PipelineError('DISK_LIMIT',True)


def _check_scratch_mount(job_root: Path) -> None:
    if job_root not in (JOB_ROOT,PREFLIGHT_JOB_ROOT) or job_root.resolve()!=job_root:
        raise PipelineError('SCRATCH_UNSAFE')
    if not job_root.exists():
        raise PipelineError('SCRATCH_LIMIT_UNAVAILABLE')
    metadata=job_root.lstat()
    if not stat.S_ISDIR(metadata.st_mode) or metadata.st_uid!=WORKER_UID or stat.S_IMODE(metadata.st_mode)!=0o700:
        raise PipelineError('SCRATCH_UNSAFE')
    mounts=Path('/proc/self/mountinfo').read_text().splitlines()
    candidates=[line.split(' - ',1) for line in mounts if line.split()[4]==str(SCRATCH_MOUNT)]
    if len(candidates)!=1:
        raise PipelineError('SCRATCH_LIMIT_UNAVAILABLE')
    mount,filesystem=candidates[0]
    fields=mount.split()
    fstype,device,_=filesystem.split()
    if (fstype!='ext4' or not re.fullmatch(r'/dev/loop[0-9]+',device)
            or not {'nodev','nosuid','noexec'}.issubset(fields[5].split(','))):
        raise PipelineError('SCRATCH_LIMIT_UNAVAILABLE')
    block=Path('/sys/dev/block')/fields[2]
    volume=os.statvfs(job_root)
    if (job_root.stat().st_dev!=SCRATCH_MOUNT.stat().st_dev or SCRATCH_MOUNT.stat().st_dev==Path('/').stat().st_dev
            or (block/'loop/backing_file').read_text().strip()!=str(SCRATCH_IMAGE)
            or int((block/'size').read_text())*512!=MAX_SCRATCH_BYTES
            or not 0<volume.f_blocks*volume.f_frsize<=MAX_SCRATCH_BYTES
            or not 0<volume.f_files<=262144):
        raise PipelineError('SCRATCH_LIMIT_UNAVAILABLE')


def clean_abandoned_jobs(job_root: Path) -> None:
    if sys.platform!='linux' or os.geteuid()!=WORKER_UID:
        raise PipelineError('RUNTIME_UNAVAILABLE')
    _check_scratch_mount(job_root)
    if not shutil.rmtree.avoids_symlink_attacks:
        raise PipelineError('SCRATCH_UNSAFE')
    for entry in job_root.iterdir():
        if not re.fullmatch(r'pratoar-[a-z0-9_]+', entry.name) or not stat.S_ISDIR(entry.lstat().st_mode):
            raise PipelineError('SCRATCH_UNSAFE')
        # rmtree uses fd-relative traversal on Linux and unlinks nested symlinks safely.
        shutil.rmtree(entry)


def sandbox_job(workdir: Path) -> Path:
    root = local_job_root.get()
    if root is None or workdir.parent != root or not re.fullmatch(r'pratoar-[a-z0-9_]+', workdir.name):
        raise PipelineError('SCRATCH_UNSAFE')
    if active_job.get() not in (None,workdir):
        raise PipelineError('SCRATCH_UNSAFE')
    if not stat.S_ISDIR(workdir.lstat().st_mode):
        raise PipelineError('SCRATCH_UNSAFE')
    return workdir


def open_job_file(path: Path, max_bytes: int) -> BinaryIO:
    """Open a bounded regular file without following links at any component."""
    root=local_job_root.get()
    workdir=active_job.get()
    if root is None or workdir is None or not path.is_relative_to(workdir):
        raise PipelineError('SCRATCH_UNSAFE')
    parts=path.relative_to(root).parts
    if len(parts)<2 or '..' in parts:
        raise PipelineError('SCRATCH_UNSAFE')
    sandbox_job(root/parts[0])
    flags=os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW
    directory=os.open(root,flags)
    try:
        for component in parts[:-1]:
            child=os.open(component,flags,dir_fd=directory)
            os.close(directory)
            directory=child
        descriptor=os.open(parts[-1],os.O_RDONLY|os.O_NOFOLLOW|os.O_NONBLOCK,dir_fd=directory)
        try:
            metadata=os.fstat(descriptor)
            if not stat.S_ISREG(metadata.st_mode) or metadata.st_nlink!=1 or metadata.st_size>max_bytes:
                raise PipelineError('SCRATCH_UNSAFE')
            return os.fdopen(descriptor,'rb')
        except BaseException:
            os.close(descriptor)
            raise
    except FileNotFoundError:
        raise
    except OSError:
        raise PipelineError('SCRATCH_UNSAFE') from None
    finally:
        os.close(directory)


def runtime_tree_files(trees: tuple[Path, ...]) -> set[Path]:
    """Enumerate installed files and links, including Python bytecode."""
    def reject_unreadable(error: OSError) -> None:
        raise error

    paths=set()
    for tree in trees:
        if tree.is_symlink():
            raise ValueError
        if not tree.exists():
            continue
        for folder,directories,files in os.walk(tree,onerror=reject_unreadable):
            directory=Path(folder)
            paths.update(directory/name for name in files)
            paths.update(directory/name for name in directories if (directory/name).is_symlink())
    return paths


def runtime_file_digest(path: Path) -> str:
    digest=hashlib.sha256()
    if path.is_symlink():
        digest.update(b'link\0'+os.fsencode(os.readlink(path))+b'\0')
        if not path.is_file():
            return digest.hexdigest()
    if not path.is_file():
        raise ValueError
    with path.open('rb') as source:
        return hashlib.file_digest(source,lambda:digest).hexdigest()


def verify_runtime_files(ledger: Path, required: set[Path], *, trees: tuple[Path, ...]=()) -> None:
    try:
        expected=json.loads(ledger.read_bytes())
        if not isinstance(expected,dict) or not {str(path) for path in required}<=expected.keys():
            raise ValueError
        expected_tree_paths=set()
        for filename,digest in expected.items():
            path=Path(filename)
            if not path.is_absolute():path=ledger.parent/path
            if any(path.is_relative_to(tree) for tree in trees):
                expected_tree_paths.add(path)
            if not isinstance(digest,str) or not re.fullmatch(r'[0-9a-f]{64}',digest):
                raise ValueError
            if runtime_file_digest(path)!=digest:
                raise ValueError
        if runtime_tree_files(trees)!=expected_tree_paths:
            raise ValueError
    except (OSError,ValueError,TypeError,RecursionError):
        raise PipelineError('RUNTIME_VERSION_MISMATCH') from None


def check_local_runtime(job_root: Path) -> dict:
    if sys.platform != 'linux' or platform.machine() != 'x86_64' or os.geteuid() != WORKER_UID:
        raise PipelineError('RUNTIME_UNAVAILABLE')
    from app.pipeline.commands import run_command
    from app.pipeline.reconstruct import TOOLS, preflight, runtime_digest, sandbox_command
    from app.pipeline.segmentation import segmentation_weights

    try:
        check_local_resources(job_root)
        digest=runtime_digest(segmentation_weights(),local=True)
        if DIGEST_PATH.read_text().strip()!=digest:
            raise PipelineError('RUNTIME_VERSION_MISMATCH')
        tools={Path(executable) for name in (*TOOLS,'python3') if (executable:=shutil.which(name))}
        if len(tools)!=len(TOOLS)+1:
            raise PipelineError('RUNTIME_UNAVAILABLE')
        tools.update((Path(sys.executable),Path('/usr/bin/python3')))
        verify_runtime_files(APP_ROOT/'runtime-build-inputs.json',tools,trees=RUNTIME_TREES)
        context = local_job_root.set(job_root)
        try:
            with (tempfile.TemporaryDirectory(prefix='pratoar-', dir=job_root) as temporary,
                    socket.create_server(('127.0.0.1',0)) as listener):
                workdir = Path(temporary)
                namespace = os.readlink('/proc/self/ns/net')
                command = sandbox_command(
                    ['/usr/bin/python3', '-I', '-c', SANDBOX_PROBE, namespace, str(listener.getsockname()[1]),
                     str(CREDENTIAL_PATH), '/mnt', '/run/WSL',
                     '/usr/lib/wsl/lib'], workdir,
                )
                try:
                    run_command(command,workdir,time.monotonic()+10)
                except PipelineError as error:
                    if error.code=='DISK_LIMIT':raise
                    raise PipelineError('SANDBOX_UNAVAILABLE') from None
            runtime = preflight()
        finally:
            local_job_root.reset(context)
        if digest != runtime['digest']:
            raise PipelineError('RUNTIME_VERSION_MISMATCH')
        return runtime
    except (OSError, ValueError, IndexError):
        raise PipelineError('RUNTIME_UNAVAILABLE') from None

"""Load the service credential without exposing it through argv or environment."""

import json
import os
import re
import stat
import sys
import tempfile
from pathlib import Path
from urllib.parse import urlsplit

from app.contracts import PipelineError

WORKER_UID = 10001
CREDENTIAL_PATH = Path('/var/lib/pratoar-worker/credentials.json')
MAX_CREDENTIAL_BYTES = 4096


def https_origin(value: str) -> str:
    if not isinstance(value, str) or not re.fullmatch(r'https://[a-zA-Z0-9.-]+(?::[0-9]+)?/?', value):
        raise PipelineError('INVALID_CREDENTIALS')
    try:
        parsed = urlsplit(value)
        if not parsed.hostname or parsed.port == 0:
            raise ValueError
    except ValueError:
        raise PipelineError('INVALID_CREDENTIALS') from None
    return value.rstrip('/')


def validate_credentials(data: object) -> dict[str, str]:
    if not isinstance(data, dict) or data.keys() != {'token', 'controlOrigin', 'storageOrigin'}:
        raise PipelineError('INVALID_CREDENTIALS')
    token = data['token']
    if not isinstance(token, str) or not re.fullmatch(r'[A-Za-z0-9_-]{43}', token):
        raise PipelineError('INVALID_CREDENTIALS')
    return {
        'token': token,
        'controlOrigin': https_origin(data['controlOrigin']),
        'storageOrigin': https_origin(data['storageOrigin']),
    }


def _decode(raw: bytes) -> dict[str, str]:
    if len(raw) > MAX_CREDENTIAL_BYTES:
        raise PipelineError('INVALID_CREDENTIALS')
    try:
        return validate_credentials(json.loads(raw))
    except (ValueError, RecursionError):
        raise PipelineError('INVALID_CREDENTIALS') from None


def _open_directory(path: Path) -> int:
    if not path.is_absolute() or '..' in path.parts:
        raise PipelineError('INVALID_CREDENTIALS')
    flags = os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW
    directory = os.open('/', flags)
    try:
        for component in path.parts[1:]:
            child = os.open(component, flags, dir_fd=directory)
            os.close(directory)
            directory = child
            metadata = os.fstat(directory)
            if metadata.st_uid not in (0, os.geteuid()):
                raise PipelineError('INVALID_CREDENTIALS')
            if metadata.st_mode & 0o022 and not metadata.st_mode & stat.S_ISVTX:
                raise PipelineError('INVALID_CREDENTIALS')
    except BaseException:
        os.close(directory)
        raise
    return directory


def load_worker_credentials(path: Path) -> dict[str, str]:
    if sys.platform != 'linux':
        raise PipelineError('INVALID_CREDENTIALS')
    try:
        directory = _open_directory(path.parent)
        try:
            descriptor = os.open(path.name, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK, dir_fd=directory)
        finally:
            os.close(directory)
        with os.fdopen(descriptor, 'rb') as source:
            metadata = os.fstat(source.fileno())
            if (not stat.S_ISREG(metadata.st_mode) or metadata.st_uid != os.geteuid()
                    or stat.S_IMODE(metadata.st_mode) != 0o600 or metadata.st_nlink != 1):
                raise PipelineError('INVALID_CREDENTIALS')
            return _decode(source.read(MAX_CREDENTIAL_BYTES + 1))
    except OSError:
        raise PipelineError('INVALID_CREDENTIALS') from None


def provision() -> None:
    """Run as distro root. Read bounded JSON on stdin and replace the file atomically."""
    if sys.platform != 'linux' or os.geteuid() != 0:
        raise PipelineError('INVALID_CREDENTIALS')
    document = _decode(sys.stdin.buffer.read(MAX_CREDENTIAL_BYTES + 1))
    directory = _open_directory(CREDENTIAL_PATH.parent)
    try:
        metadata = os.fstat(directory)
        if metadata.st_uid != 0 or stat.S_IMODE(metadata.st_mode) != 0o755:
            raise PipelineError('INVALID_CREDENTIALS')
        descriptor, temporary = tempfile.mkstemp(prefix='.credential-', dir=CREDENTIAL_PATH.parent)
        try:
            with os.fdopen(descriptor, 'w', encoding='utf-8') as target:
                os.fchown(target.fileno(), WORKER_UID, WORKER_UID)
                os.fchmod(target.fileno(), 0o600)
                json.dump(document, target)
                target.flush()
                os.fsync(target.fileno())
            os.replace(Path(temporary).name, CREDENTIAL_PATH.name, src_dir_fd=directory, dst_dir_fd=directory)
            os.fsync(directory)
        finally:
            Path(temporary).unlink(missing_ok=True)
    finally:
        os.close(directory)


if __name__ == '__main__':
    if sys.argv[1:] != ['provision']:
        sys.exit('INVALID_CREDENTIALS')
    try:
        provision()
    except (PipelineError, OSError):
        sys.exit('INVALID_CREDENTIALS')

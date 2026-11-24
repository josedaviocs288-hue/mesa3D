"""Server-only adapter for the Mesa3D durable queue. Never contacts Supabase."""
import argparse
import hashlib
import json
import math
import os
from pathlib import Path
import re
import signal
import stat
import sys
import threading
import time
import zipfile

PHOTO_LIMIT = 12 * 1024**2
TOTAL_LIMIT = 300 * 1024**2


def validate_capture(directory: Path) -> list[Path]:
    directory = Path(directory)
    if directory.is_symlink() or not directory.is_dir():
        raise ValueError('INVALID_PHOTOS')
    manifest = directory / 'manifest.json'
    photos = directory / 'photos'
    if manifest.is_symlink() or not manifest.is_file() or manifest.stat().st_size > 20000 or photos.is_symlink() or not photos.is_dir():
        raise ValueError('INVALID_PHOTOS')
    try:
        data = json.loads(manifest.read_text())
        names = data['photos']
        if data.get('version') != 1 or not isinstance(names, list) or not 30 <= len(names) <= 100 or len(set(names)) != len(names):
            raise ValueError('INVALID_PHOTOS')
        total = 0
        paths = []
        for name in names:
            if not isinstance(name, str) or not re.fullmatch(r'[a-f0-9-]{36}\.(jpg|png)', name):
                raise ValueError('INVALID_PHOTOS')
            photo = photos / name
            info = photo.lstat()
            if not stat.S_ISREG(info.st_mode) or not 0 < info.st_size <= PHOTO_LIMIT or photo.resolve().parent != photos.resolve():
                raise ValueError('INVALID_PHOTOS')
            total += info.st_size
            if total > TOTAL_LIMIT:
                raise ValueError('INVALID_PHOTOS')
            paths.append(photo)
        return paths
    except (KeyError, TypeError, OSError, json.JSONDecodeError) as error:
        raise ValueError('INVALID_PHOTOS') from error


def build_capture(directory: Path) -> Path:
    paths = validate_capture(directory)
    target = directory / 'capture-server.zip'
    if target.is_symlink():
        raise ValueError('INVALID_PHOTOS')
    with zipfile.ZipFile(target, 'w', compression=zipfile.ZIP_STORED) as archive:
        for i, photo in enumerate(paths):
            archive.write(photo, f'{i:04d}{photo.suffix}')
    return target


def runtime_preflight():
    if sys.platform != 'linux' or os.environ.get('PRATOAR_SANDBOX_PROFILE') != 'lan':
        raise ValueError('SANDBOX_UNAVAILABLE')
    from app.pipeline.reconstruct import preflight
    runtime = preflight()
    runtime['digest'] = hashlib.sha256(runtime['digest'].encode() + Path(__file__).read_bytes()).hexdigest()
    runtime['capabilities'].append('mesa3d-local-queue-v1')
    return runtime


def emit(value):
    print(json.dumps(value), flush=True)


def main(argv=None):
    parser = argparse.ArgumentParser()
    parser.add_argument('--preflight', action='store_true')
    parser.add_argument('--job-dir', type=Path)
    parser.add_argument('--width-cm', type=float)
    args = parser.parse_args(argv)
    try:
        if args.preflight:
            emit({'runtime': runtime_preflight()})
            return 0
        if args.job_dir is None or args.width_cm is None or not math.isfinite(args.width_cm) or not 3 <= args.width_cm <= 150:
            raise ValueError('INVALID_SCALE')
        runtime_preflight()
        from app.pipeline.main import run_pipeline
        from app.pipeline.commands import cancellation, execution_deadline
        stop = threading.Event()
        signal.signal(signal.SIGTERM, lambda *_: stop.set())
        signal.signal(signal.SIGINT, lambda *_: stop.set())
        cancel_token = cancellation.set(stop)
        deadline_token = execution_deadline.set(time.monotonic() + 3600)
        try:
            directory = args.job_dir.absolute()
            capture = build_capture(directory)
            def progress(stage):
                if stop.is_set():
                    raise ValueError('CANCELLED')
                emit({'stage': stage})
            result = run_pipeline(capture, args.width_cm, directory, progress,
                                  photo_limits=(301 * 1024**2, TOTAL_LIMIT, PHOTO_LIMIT))
            for artifact, limit in [(result.model, 20 * 1024**2), (result.poster, 10 * 1024**2)]:
                if artifact.is_symlink() or not artifact.is_file() or not 0 < artifact.stat().st_size <= limit or artifact.resolve().parent != directory.resolve():
                    raise ValueError('INVALID_MODEL')
            if stop.is_set():
                raise ValueError('CANCELLED')
            emit({'result': {'metrics': {'captureFrames': result.metrics.get('captureFrames', 0),
                                        'durationSeconds': result.metrics.get('durationSeconds', 0)}}})
            return 0
        finally:
            cancellation.reset(cancel_token)
            execution_deadline.reset(deadline_token)
    except Exception as error:
        allowed = {'INVALID_PHOTOS', 'CAPTURE_QUALITY', 'RECAPTURE_BACKGROUND', 'TEXTURE_MISSING',
                   'TIMEOUT', 'DISK_LIMIT', 'INVALID_MODEL', 'INVALID_SCALE', 'MODEL_TOO_COMPLEX',
                   'RUNTIME_UNAVAILABLE', 'SANDBOX_UNAVAILABLE', 'RUNTIME_VERSION_MISMATCH', 'CANCELLED'}
        code = getattr(error, 'code', str(error))
        emit({'error': code if code in allowed else 'PROCESSING_FAILED'})
        return 1


if __name__ == '__main__':
    raise SystemExit(main())

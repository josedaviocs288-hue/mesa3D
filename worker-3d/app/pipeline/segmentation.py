"""Trusted model verification and bounded inference orchestration."""
import hashlib
import importlib.util
import os
import sys
import time
from pathlib import Path
from app.contracts import PipelineError
from .commands import run_command
from .reconstruct import sandbox_command

WEIGHTS_SHA256='6dbb90523a35330fedd7f1d3dfc66f995213d81b29a5ca8108dbcdd4e37d6c2f'


def segmentation_weights():
    weights=Path(os.environ.get('PRATOAR_SEGMENTATION_WEIGHTS','/vercel/pratoar/models/mobile_sam.pt'))
    if not weights.is_file() or not 0<weights.stat().st_size<=50*1024*1024 or hashlib.sha256(weights.read_bytes()).hexdigest()!=WEIGHTS_SHA256:raise PipelineError('RUNTIME_UNAVAILABLE')
    if any(importlib.util.find_spec(name) is None for name in ('torch','mobile_sam','cv2')):raise PipelineError('RUNTIME_UNAVAILABLE')
    return weights.resolve()


def segment_foreground(workdir:Path,deadline:float):
    script=Path(__file__).with_name('segment_scene.py').resolve()
    weights=segmentation_weights()
    run_command(sandbox_command([sys.executable,str(script),str(workdir.resolve()),str(weights)],workdir),workdir,min(deadline,time.monotonic()+120))
    if not (workdir/'foreground.npz').is_file():raise PipelineError('RECAPTURE_BACKGROUND')

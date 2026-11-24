import time
from pathlib import Path
from app.config import MAX_SECONDS
from .reconstruct import reconstruct
from .export import export_model
from .video import extract_frames
from .commands import execution_deadline
from .segmentation import segment_foreground
from .photos import extract_photos

def run_pipeline(video_path:Path,diameter_cm:float,workdir:Path,progress,*,photo_limits=None):
    started=time.monotonic()
    deadline=min(started+MAX_SECONDS,execution_deadline.get() or float('inf'))
    frames=(extract_photos(video_path,workdir/'frames',progress,deadline,limits=photo_limits) if video_path.suffix.lower()=='.zip'
            else extract_frames(video_path,workdir/'frames',progress,deadline))
    mesh=reconstruct(frames,workdir,progress,deadline)
    progress('PREPARING_PREVIEW')
    segment_foreground(workdir,deadline)
    result=export_model(mesh,diameter_cm,workdir,deadline)
    result.metrics.update({'durationSeconds':round(time.monotonic()-started,2),'captureFrames':len(frames),'captureType':'photos' if video_path.suffix.lower()=='.zip' else 'video'})
    return result

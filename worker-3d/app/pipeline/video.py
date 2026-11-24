import json
import hashlib
import math
import sys
import time
from pathlib import Path
from app.config import MAX_VIDEO_BYTES,MAX_FRAMES,MIN_FRAMES
from app.contracts import PipelineError,VideoInfo
from app.local_runtime import local_job_root
from .commands import run_command, execution_deadline
from .reconstruct import sandbox_command

def validate_probe(data: dict, size: int) -> VideoInfo:
    try:
        stream=next(s for s in data['streams'] if s.get('codec_type')=='video')
        duration=float(data['format']['duration'])
        width,height=int(stream['width']),int(stream['height'])
        rotation=abs(int(next((s['rotation'] for s in stream.get('side_data_list',[]) if 'rotation' in s),stream.get('tags',{}).get('rotate',0))))%180
        if rotation==90: width,height=height,width
        if not math.isfinite(duration) or not 10<=duration<=60 or not 0<size<=MAX_VIDEO_BYTES or min(width,height)<=0 or max(width,height)>1920 or min(width,height)>1080:
            raise ValueError()
        return VideoInfo(duration,width,height)
    except (KeyError,StopIteration,ValueError,TypeError,OverflowError) as exc:
        raise PipelineError('INVALID_VIDEO') from exc

def probe_video(path: Path) -> VideoInfo:
    if path.suffix.lower() not in ('.mp4','.mov','.webm'): raise PipelineError('INVALID_VIDEO')
    if path.stat().st_size>MAX_VIDEO_BYTES: raise PipelineError('INVALID_VIDEO')
    result=run_command(sandbox_command(['ffprobe','-v','error','-protocol_whitelist','file,pipe','-show_streams','-show_format','-of','json',str(path)],path.parent),path.parent,time.monotonic()+30)
    try:
        data=json.loads(result.stdout)
        if data.get('format',{}).get('duration') in (None,'N/A'):
            # MediaRecorder WebM is streamed and often has no duration header.
            # Check dimensions before decoding, then measure at most 61 seconds.
            # Never accept a client-supplied duration as proof of a valid capture.
            data.setdefault('format',{})['duration']='10'
            validate_probe(data,path.stat().st_size)
            measured=run_command(sandbox_command(['ffmpeg','-nostdin','-v','error',
                '-protocol_whitelist','file,pipe','-i',str(path),'-t','61','-map','0:v:0',
                '-an','-sn','-dn','-progress','pipe:1','-nostats','-f','null','-'],path.parent),
                path.parent,min(time.monotonic()+60,execution_deadline.get() or float('inf')))
            timestamps=[float(line.split('=',1)[1])/1_000_000 for line in measured.stdout.splitlines() if line.startswith('out_time_us=')]
            if not timestamps or any(not math.isfinite(value) for value in timestamps):raise ValueError()
            data['format']['duration']=max(timestamps)
        return validate_probe(data,path.stat().st_size)
    except (json.JSONDecodeError,AttributeError,TypeError,ValueError) as exc: raise PipelineError('INVALID_VIDEO') from exc

def frame_filter(info: VideoInfo) -> str:
    return f"fps={MAX_FRAMES/info.duration_seconds:.8f},scale=w='min(1280,iw)':h='min(1280,ih)':force_original_aspect_ratio=decrease"

def extract_frames(path: Path, output_dir: Path, progress, deadline=None) -> list[Path]:
    info=probe_video(path);output_dir.mkdir(parents=True,exist_ok=True);progress('EXTRACTING')
    run_command(sandbox_command(['ffmpeg','-nostdin','-v','error','-protocol_whitelist','file,pipe','-i',str(path),'-vf',frame_filter(info),'-frames:v',str(MAX_FRAMES),'-q:v','2',str(output_dir/'%04d.jpg')],path.parent),path.parent,deadline or time.monotonic()+120)
    if local_job_root.get() is not None:
        command=[sys.executable,'-P','-m','app.pipeline.artifact_checks','frames',str(output_dir)]
        run_command(sandbox_command(command,path.parent),path.parent,deadline or time.monotonic()+120)
        frames=sorted(output_dir.glob('*.jpg'))
    else:
        frames=filter_frames(output_dir)
    if len(frames)<MIN_FRAMES: raise PipelineError('CAPTURE_QUALITY')
    return frames


def filter_frames(output_dir: Path) -> list[Path]:
    import numpy as np
    from PIL import Image

    frames=[];seen=set()
    for file in sorted(output_dir.glob('*.jpg')):
        with Image.open(file) as image:
            pixels=np.asarray(image.convert('L'),dtype=np.float32)
        score=float((pixels[1:-1,:-2]+pixels[1:-1,2:]+pixels[:-2,1:-1]+pixels[2:,1:-1]-4*pixels[1:-1,1:-1]).var())
        fingerprint=hashlib.sha256(file.read_bytes()).digest()
        if score>=20 and fingerprint not in seen:
            frames.append(file);seen.add(fingerprint)
        else: file.unlink()
    return frames

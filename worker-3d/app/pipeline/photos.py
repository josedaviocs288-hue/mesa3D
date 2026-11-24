import sys
import time
from pathlib import Path
from app.contracts import PipelineError
from app.local_runtime import local_job_root, open_job_file
from .commands import run_command
from .reconstruct import sandbox_command


def extract_photos(path:Path,output:Path,progress,deadline,*,limits=None):
    progress('EXTRACTING');output.mkdir(parents=True,exist_ok=True)
    script=Path(__file__).with_name('photo_archive.py').resolve()
    extra=[str(n) for n in limits] if limits is not None else []
    try:run_command(sandbox_command([sys.executable,str(script),str(path.resolve()),str(output.resolve()),*extra],path.parent),path.parent,min(deadline,time.monotonic()+90))
    except PipelineError as error:
        report=output.parent/'capture-error.txt'
        if error.code=='PROCESSING_FAILED':
            try:
                if local_job_root.get() is None:
                    code=report.read_text()[:100] if report.is_file() else ''
                else:
                    with open_job_file(report,100) as source:
                        code=source.read(100).decode('ascii',errors='replace')
            except FileNotFoundError:
                code=''
            if code in ('INVALID_PHOTOS','CAPTURE_QUALITY'):raise PipelineError(code) from None
        raise
    frames=sorted(output.glob('*.jpg'))
    if not 30<=len(frames)<=100:raise PipelineError('CAPTURE_QUALITY')
    return frames

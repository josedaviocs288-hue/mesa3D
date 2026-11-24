import json
import math
import struct
import sys
import time
from pathlib import Path
from app.config import MAX_MODEL_BYTES
from app.contracts import ModelResult, PipelineError
from app.local_runtime import local_job_root
from .commands import run_command
from .reconstruct import sandbox_command

def validate_result(model:Path,poster:Path)->dict:
    from PIL import Image

    try:
        if not 20<=model.stat().st_size<=MAX_MODEL_BYTES: raise ValueError()
        data=model.read_bytes();magic,version,length,chunk,kind=struct.unpack('<5I',data[:20])
        if magic!=0x46546c67 or version!=2 or length!=len(data) or kind!=0x4e4f534a or chunk>len(data)-20: raise ValueError()
        document=json.loads(data[20:20+chunk])
        if not document.get('meshes') or not document.get('images') or len(document.get('scenes',[]))!=1: raise ValueError()
        if any(item.get('uri') for item in document.get('images',[])+document.get('buffers',[])): raise ValueError()
        with Image.open(poster) as image:
            if image.format!='PNG' or image.width>1024 or image.height>1024: raise ValueError()
        return {'modelBytes':len(data)}
    except (OSError,ValueError,KeyError,TypeError,AttributeError,RecursionError,struct.error) as exc:
        raise PipelineError('INVALID_MODEL') from exc


def validate_local_metrics(raw:str,diameter_cm:float)->dict:
    try:
        if len(raw)>4096:raise ValueError
        metrics=json.loads(raw)
        if not isinstance(metrics,dict):raise ValueError
        if metrics.keys()=={'error'} and metrics['error'] in ('INVALID_MODEL','INVALID_SCALE','MODEL_TOO_COMPLEX'):
            raise PipelineError(metrics['error'])
        if metrics.keys()!={'modelBytes','triangles','widthMeters','crop','segmentedViews'}:
            raise ValueError
        if (type(metrics['modelBytes']) is not int or not 20<=metrics['modelBytes']<=MAX_MODEL_BYTES
                or type(metrics['triangles']) is not int or metrics['triangles']<1
                or type(metrics['widthMeters']) not in (float,int) or not math.isfinite(metrics['widthMeters'])
                or metrics['crop']!='mobilesam-multiview-review-required'
                or type(metrics['segmentedViews']) is not int or not 1<=metrics['segmentedViews']<=100):
            raise ValueError
    except (ValueError,TypeError,RecursionError,OverflowError):
        raise PipelineError('INVALID_MODEL') from None
    if metrics['triangles']>100000:raise PipelineError('MODEL_TOO_COMPLEX')
    if abs(metrics['widthMeters']-diameter_cm/100)>.001:raise PipelineError('INVALID_SCALE')
    return metrics

def export_model(mesh_path:Path,diameter_cm:float,output_dir:Path,deadline=None)->ModelResult:
    script=Path(__file__).with_name('prepare_scene.py').resolve()
    run_command(sandbox_command(['blender','--background','--factory-startup','--python-exit-code','1','--python',str(script),'--',str(mesh_path),str(output_dir),str(diameter_cm)],output_dir),output_dir,deadline or time.monotonic()+600)
    model,poster=output_dir/'model.glb',output_dir/'poster.png'
    if local_job_root.get() is not None:
        command=[sys.executable,'-P','-m','app.pipeline.artifact_checks','preview',str(output_dir)]
        output=run_command(sandbox_command(command,output_dir),output_dir,deadline or time.monotonic()+60)
        return ModelResult(model,poster,validate_local_metrics(output.stdout,diameter_cm))
    metrics=validate_result(model,poster)
    metrics.update(json.loads((output_dir/'metrics.json').read_text()))
    if metrics['triangles']>100000: raise PipelineError('MODEL_TOO_COMPLEX')
    if abs(metrics['widthMeters']-diameter_cm/100)>.001: raise PipelineError('INVALID_SCALE')
    return ModelResult(model,poster,metrics)

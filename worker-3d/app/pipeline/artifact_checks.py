"""Decode pipeline artifacts only inside the local Bubblewrap subprocess."""

import json
import sys
from pathlib import Path

from app.contracts import PipelineError
from app.pipeline.export import validate_result
from app.pipeline.video import filter_frames


def preview_metrics(directory: Path) -> dict:
    try:
        metrics=validate_result(directory/'model.glb',directory/'poster.png')
        with (directory/'metrics.json').open('rb') as source:
            raw=source.read(4097)
        if len(raw)>4096:
            raise ValueError
        rendered=json.loads(raw)
        if not isinstance(rendered,dict) or 'modelBytes' in rendered:
            raise ValueError
        metrics.update(rendered)
        return metrics
    except (OSError,ValueError,RecursionError,PipelineError):
        return {'error':'INVALID_MODEL'}


if __name__=='__main__':
    action,output=sys.argv[1:]
    if action=='frames':
        filter_frames(Path(output))
    elif action=='preview':
        print(json.dumps(preview_metrics(Path(output))))
    else:
        sys.exit('INVALID_ARTIFACT_CHECK')

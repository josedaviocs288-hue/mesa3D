from dataclasses import dataclass
from pathlib import Path

class PipelineError(Exception):
    def __init__(self, code: str, retryable: bool = False):
        self.code, self.retryable = code, retryable
        super().__init__(code)

@dataclass(frozen=True)
class VideoInfo:
    duration_seconds: float
    width: int
    height: int

@dataclass(frozen=True)
class ModelResult:
    model: Path
    poster: Path
    metrics: dict

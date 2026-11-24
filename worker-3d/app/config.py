import os

MAX_VIDEO_BYTES = 40 * 1024 * 1024
MAX_MODEL_BYTES = 25 * 1024 * 1024
MAX_SCRATCH_BYTES = 10 * 1024**3
MAX_SECONDS = int(os.environ.get('PRATOAR_MAX_SECONDS','3600'))
if not 30<=MAX_SECONDS<=3600:raise ValueError('Invalid processing time limit')
MAX_FRAMES = 100
MIN_FRAMES = 30
HEARTBEAT_SECONDS = 30

def control_url():
    from urllib.parse import urlparse
    value=os.environ.get('PRATOAR_CONTROL_URL','').rstrip('/')
    parsed=urlparse(value)
    if not (parsed.scheme=='https' or parsed.scheme=='http' and parsed.hostname in ('localhost','127.0.0.1')) or parsed.username or parsed.query or parsed.fragment:
        raise ValueError('PRATOAR_CONTROL_URL must be an HTTPS origin')
    return value

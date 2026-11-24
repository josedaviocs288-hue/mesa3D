"""Bounded COLMAP pose reader and multi-view silhouette carving (NumPy only)."""
import struct
from pathlib import Path
import numpy as np


def rotation_matrix(quaternion):
    q=np.asarray(quaternion,dtype=float)
    if q.shape!=(4,) or not np.isfinite(q).all() or np.linalg.norm(q)<1e-8:raise ValueError('CAPTURE_QUALITY')
    w,x,y,z=q/np.linalg.norm(q)
    return np.array([[1-2*y*y-2*z*z,2*x*y-2*z*w,2*x*z+2*y*w],
        [2*x*y+2*z*w,1-2*x*x-2*z*z,2*y*z-2*x*w],
        [2*x*z-2*y*w,2*y*z+2*x*w,1-2*x*x-2*y*y]])


def _read(file,fmt):
    size=struct.calcsize(fmt);data=file.read(size)
    if len(data)!=size:raise ValueError('CAPTURE_QUALITY')
    return struct.unpack(fmt,data)


def read_cameras(path:Path):
    cameras={}
    with path.open('rb') as file:
        count,=_read(file,'<Q')
        if not 1<=count<=100:raise ValueError('CAPTURE_QUALITY')
        for _ in range(count):
            identity,model,width,height=_read(file,'<iiQQ')
            if model not in (0,1) or not 1<=width<=1920 or not 1<=height<=1920:raise ValueError('CAPTURE_QUALITY')
            params=_read(file,'<3d' if model==0 else '<4d')
            if model==0:params=(params[0],params[0],*params[1:])
            if not np.isfinite(params).all() or min(params[:2])<=0:raise ValueError('CAPTURE_QUALITY')
            cameras[identity]=(width,height,params)
    return cameras


def read_images(path:Path):
    images=[]
    with path.open('rb') as file:
        count,=_read(file,'<Q')
        if not 1<=count<=100:raise ValueError('CAPTURE_QUALITY')
        for _ in range(count):
            values=_read(file,'<idddddddi');name=bytearray()
            for _ in range(256):
                char=file.read(1)
                if char==b'\0':break
                if not char:raise ValueError('CAPTURE_QUALITY')
                name.extend(char)
            else:raise ValueError('CAPTURE_QUALITY')
            name=name.decode('utf8')
            if not name or '/' in name or '\\' in name or name.startswith('.'):raise ValueError('CAPTURE_QUALITY')
            translation=np.array(values[5:8])
            if not np.isfinite(translation).all():raise ValueError('CAPTURE_QUALITY')
            images.append({'name':name,'camera':values[8],'rotation':rotation_matrix(values[1:5]),'translation':translation})
            observations,=_read(file,'<Q')
            if observations>1000000 or file.tell()+observations*24>path.stat().st_size:raise ValueError('CAPTURE_QUALITY')
            file.seek(observations*24,1)
    return sorted(images,key=lambda image:image['name'])


def select_mask(masks,scores):
    candidates=[]
    for mask,score in zip(masks,scores):
        h,w=mask.shape;fraction=float(mask.mean())
        if not np.isfinite(score) or score<.85 or not .03<=fraction<=.8 or not mask[h//2,w//2]:continue
        border=np.concatenate((mask[0],mask[-1],mask[:,0],mask[:,-1]))
        if border.mean()>.02:continue
        candidates.append((float(score),fraction,mask))
    if not candidates:raise ValueError('RECAPTURE_BACKGROUND')
    top=max(item[0] for item in candidates)
    # Prefer the whole dish over a confidently segmented ingredient inside it.
    return max((item for item in candidates if item[0]>=top-.08),key=lambda item:item[1])[2]


def foreground_vertices(points,views):
    masks=views['masks'];rotations=views['rotations'];translations=views['translations'];intrinsics=views['intrinsics']
    if not 3<=len(masks)<=16 or not len(masks)==len(rotations)==len(translations)==len(intrinsics):raise ValueError('RECAPTURE_BACKGROUND')
    points=np.asarray(points,dtype=float)
    if points.ndim!=2 or points.shape[1]!=3 or not np.isfinite(points).all():raise ValueError('CAPTURE_QUALITY')
    votes=np.zeros(len(points),dtype=np.int32);observed=np.zeros(len(points),dtype=np.int32)
    for mask,rotation,translation,intrinsic in zip(masks,rotations,translations,intrinsics):
        camera=points@rotation.T+translation;z=camera[:,2];front=z>1e-6
        fx,fy,cx,cy=intrinsic
        x=np.rint(camera[:,0]/np.where(front,z,1)*fx+cx).astype(int)
        y=np.rint(camera[:,1]/np.where(front,z,1)*fy+cy).astype(int)
        h,w=mask.shape;inside=front&(x>=0)&(y>=0)&(x<w)&(y<h)
        observed+=inside
        ids=np.flatnonzero(inside);votes[ids]+=mask[y[ids],x[ids]].astype(bool)
    return (observed>=3)&(votes>=np.ceil(observed*.75))

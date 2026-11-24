"""Decode a bounded photo set inside the network-isolated subprocess."""
import hashlib
import sys
import warnings
import zipfile
from pathlib import Path
import numpy as np
from PIL import Image,ImageOps,UnidentifiedImageError


def prepare_photos(source:Path,output:Path,*,max_archive_bytes=40*1024**2,max_expanded_bytes=160*1024**2,max_photo_bytes=16*1024**2):
    if not (0<max_archive_bytes<=301*1024**2 and 0<max_expanded_bytes<=300*1024**2 and 0<max_photo_bytes<=16*1024**2):raise ValueError('INVALID_PHOTOS')
    if not 0<source.stat().st_size<=max_archive_bytes:raise ValueError('INVALID_PHOTOS')
    output.mkdir(parents=True,exist_ok=True)
    frames=[];seen=set();dimensions=None
    try:
        with zipfile.ZipFile(source) as archive:
            entries=archive.infolist()
            if not 30<=len(entries)<=100 or sum(item.file_size for item in entries)>max_expanded_bytes:raise ValueError('INVALID_PHOTOS')
            for entry in entries:
                name=entry.filename
                if '/' in name or '\\' in name or name.startswith('.') or Path(name).suffix.lower() not in ('.jpg','.jpeg','.png','.webp') or entry.flag_bits&1 or ((entry.external_attr>>16)&0o170000) not in (0,0o100000) or not 0<entry.file_size<=max_photo_bytes:raise ValueError('INVALID_PHOTOS')
                with archive.open(entry) as file, warnings.catch_warnings():
                    warnings.simplefilter('error',Image.DecompressionBombWarning)
                    with Image.open(file) as image:
                        if image.format not in ('JPEG','PNG','WEBP') or image.width*image.height>24_000_000 or min(image.size)<320 or getattr(image,'n_frames',1)!=1:raise ValueError('INVALID_PHOTOS')
                        image=ImageOps.exif_transpose(image).convert('RGB')
                        image.thumbnail((1280,1280),Image.Resampling.LANCZOS)
                        if dimensions is None:dimensions=image.size
                        if abs(image.width/image.height-dimensions[0]/dimensions[1])>.02:raise ValueError('INVALID_PHOTOS')
                        if image.size!=dimensions:image=image.resize(dimensions,Image.Resampling.LANCZOS)
                        pixels=np.asarray(image)
                        fingerprint=hashlib.sha256(pixels.tobytes()).digest()
                        gray=np.asarray(image.convert('L'),dtype=np.float32)
                        sharpness=float((gray[1:-1,:-2]+gray[1:-1,2:]+gray[:-2,1:-1]+gray[2:,1:-1]-4*gray[1:-1,1:-1]).var())
                        if fingerprint in seen or sharpness<20:continue
                        seen.add(fingerprint)
                        target=output/f'{len(frames):04d}.jpg';image.save(target,format='JPEG',quality=95,subsampling=0)
                        frames.append(target)
        if len(frames)<30:raise ValueError('CAPTURE_QUALITY')
        return frames
    except (OSError,zipfile.BadZipFile,RuntimeError,UnidentifiedImageError,Image.DecompressionBombError,Image.DecompressionBombWarning) as error:
        raise ValueError('INVALID_PHOTOS') from error


if __name__=='__main__':
    source,output=map(Path,sys.argv[1:3])
    options={}
    if len(sys.argv)==6:options=dict(zip(('max_archive_bytes','max_expanded_bytes','max_photo_bytes'),map(int,sys.argv[3:])))
    try:prepare_photos(source,output,**options)
    except ValueError as error:
        (output.parent/'capture-error.txt').write_text(str(error))
        raise SystemExit(1) from None

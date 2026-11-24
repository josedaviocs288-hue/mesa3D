"""Runs only in the isolated CPU subprocess. Uses masks inferred from this capture."""
import json
import sys
from pathlib import Path
import numpy as np
from PIL import Image,ImageFilter
import torch
from mobile_sam import sam_model_registry,SamPredictor
from foreground import read_cameras,read_images,select_mask


def main():
    root,weights=map(Path,sys.argv[1:])
    torch.set_num_threads(2)
    model=sam_model_registry['vit_t'](checkpoint=str(weights));model.eval()
    predictor=SamPredictor(model)
    cameras=read_cameras(root/'dense/sparse/cameras.bin')
    images=read_images(root/'dense/sparse/images.bin')
    if len(images)<12:raise ValueError('CAPTURE_QUALITY')
    selected=np.linspace(0,len(images)-1,min(12,len(images)),dtype=int)
    masks=[];rotations=[];translations=[];intrinsics=[]
    with torch.inference_mode():
        for index in selected:
            view=images[index];width,height,params=cameras[view['camera']]
            with Image.open(root/'dense/images'/view['name']) as image:
                if image.size!=(width,height):raise ValueError('CAPTURE_QUALITY')
                pixels=np.asarray(image.convert('RGB'))
            predictor.set_image(pixels)
            candidates,scores,_=predictor.predict(point_coords=np.array([[width*.5,height*.5]]),point_labels=np.array([1]),multimask_output=True)
            try:mask=select_mask(candidates,scores)
            except ValueError:continue
            scale=512/max(width,height);sw,sh=round(width*scale),round(height*scale)
            mask=Image.fromarray(mask.astype('uint8')*255).resize((sw,sh),Image.Resampling.NEAREST).filter(ImageFilter.MaxFilter(5))
            padded=np.zeros((512,512),dtype=np.uint8);padded[:sh,:sw]=np.asarray(mask)>0
            masks.append(padded);rotations.append(view['rotation']);translations.append(view['translation']);intrinsics.append(np.asarray(params)*scale)
    if len(masks)<8:raise ValueError('RECAPTURE_BACKGROUND')
    np.savez_compressed(root/'foreground.npz',masks=np.array(masks),rotations=np.array(rotations),translations=np.array(translations),intrinsics=np.array(intrinsics))
    print(json.dumps({'segmentedViews':len(masks),'method':'mobilesam-multiview'}))


if __name__=='__main__':main()

import io
import zipfile
import numpy as np
import pytest
from PIL import Image
from app.pipeline.photo_archive import prepare_photos


def archive(path,count=30,duplicate=False,bad_name=None):
    rng=np.random.default_rng(9)
    with zipfile.ZipFile(path,'w') as z:
        for i in range(count):
            out=io.BytesIO()
            pixels=np.random.default_rng(1).integers(0,255,(320,480,3),dtype=np.uint8) if duplicate else rng.integers(0,255,(320,480,3),dtype=np.uint8)
            Image.fromarray(pixels).save(out,format='JPEG')
            z.writestr(bad_name if bad_name and i==0 else f'{i:04d}.jpg',out.getvalue())


def test_photos_from_multiple_angles_are_normalized_for_reconstruction(tmp_path):
    path=tmp_path/'capture.zip';archive(path)
    frames=prepare_photos(path,tmp_path/'frames')
    assert len(frames)==30
    with Image.open(frames[0]) as image:assert image.size==(480,320) and image.format=='JPEG'


@pytest.mark.parametrize('options',[{'count':29},{'count':101},{'duplicate':True},{'bad_name':'../escape.jpg'},{'bad_name':'photo.exe'}])
def test_incomplete_repeated_or_unsafe_sets_are_rejected(tmp_path,options):
    path=tmp_path/'capture.zip';archive(path,**options)
    with pytest.raises(ValueError):prepare_photos(path,tmp_path/'frames')
    assert not (tmp_path/'escape.jpg').exists()


def test_photo_archive_does_not_accept_non_images_disguised_as_jpeg(tmp_path):
    path=tmp_path/'capture.zip'
    with zipfile.ZipFile(path,'w') as z:
        for i in range(30):z.writestr(f'{i}.jpg',b'not an image')
    with pytest.raises(ValueError):prepare_photos(path,tmp_path/'frames')

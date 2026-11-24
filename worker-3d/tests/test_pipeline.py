import time
import struct
from pathlib import Path
import pytest
from app.contracts import PipelineError
from app.pipeline.reconstruct import reconstruction_commands, preflight, reconstruct
from app.pipeline.reconstruct import sandbox_command
from app.pipeline.export import validate_result

def test_cpu_pipeline_order_is_explicit(tmp_path):
    commands=reconstruction_commands(tmp_path)
    names=[command[0] for _,command in commands]
    assert names==['colmap']*4+['InterfaceCOLMAP','DensifyPointCloud','ReconstructMesh','RefineMesh','TextureMesh']
    assert '--FeatureExtraction.use_gpu' in commands[0][1]
    assert '--FeatureMatching.use_gpu' in commands[1][1]
    assert commands[-1][1][-1]=='obj'

def test_cpu_depth_maps_have_a_mobile_processing_budget(tmp_path):
    command=reconstruction_commands(tmp_path)[5][1]
    assert int(command[command.index('--max-resolution')+1])<=640
    assert int(command[command.index('--min-resolution')+1])<=160
    assert int(command[command.index('--number-views')+1])<=3

def test_mesh_stages_write_real_projects_for_the_next_stage(tmp_path):
    for _,command in reconstruction_commands(tmp_path)[5:]:
        assert command[command.index('--archive-type')+1]=='2'

def test_sparse_selection_requires_enough_views_and_uses_the_largest_model(tmp_path):
    from app.pipeline.reconstruct import select_sparse_model
    for name,images,points in [('0',2,139),('1',25,2000),('2',30,3000)]:
        folder=tmp_path/name;folder.mkdir()
        (folder/'images.bin').write_bytes(struct.pack('<Q',images))
        (folder/'points3D.bin').write_bytes(struct.pack('<Q',points))
    assert select_sparse_model(tmp_path,40)==tmp_path/'2'
    with pytest.raises(PipelineError,match='CAPTURE_QUALITY'):select_sparse_model(tmp_path,100)

def test_missing_runtime_cannot_advertise_readiness(monkeypatch):
    monkeypatch.setattr('shutil.which',lambda _:None)
    with pytest.raises(PipelineError,match='RUNTIME_UNAVAILABLE'): preflight()

def test_missing_mesh_and_textures_cannot_become_success(tmp_path):
    with pytest.raises(PipelineError): validate_result(tmp_path/'model.glb',tmp_path/'poster.png')

def test_corrupt_output_is_rejected(tmp_path):
    (tmp_path/'model.glb').write_bytes(b'not a glb')
    (tmp_path/'poster.png').write_bytes(b'not a png')
    with pytest.raises(PipelineError): validate_result(tmp_path/'model.glb',tmp_path/'poster.png')

def test_preflight_hashes_the_packaged_source_lock(monkeypatch,tmp_path):
    from app.pipeline.commands import CommandResult
    weights=tmp_path/'verified-weights';weights.write_bytes(b'fixture')
    monkeypatch.setattr('app.pipeline.segmentation.segmentation_weights',lambda:weights)
    monkeypatch.setattr('shutil.which',lambda name:'/usr/bin/'+name)
    monkeypatch.setattr('app.pipeline.reconstruct.sys.platform','linux')
    monkeypatch.setattr('app.pipeline.reconstruct.run_command',lambda *args,**kwargs:CommandResult('--FeatureExtraction.use_gpu --FeatureMatching.use_gpu --input-file --max-threads'))
    result=preflight()
    assert len(result['digest'])==64
    assert 'sandbox-network-off' in result['capabilities']

def test_sandbox_mounts_tmp_before_exposing_workdir(monkeypatch,tmp_path):
    monkeypatch.setattr('shutil.which',lambda name:'/usr/bin/'+name)
    monkeypatch.setattr('app.pipeline.reconstruct.sys.platform','linux')
    command=sandbox_command(['true'],tmp_path)
    assert command.index('--tmpfs')<command.index('--bind')

def test_restricted_proc_profile_drops_capabilities_and_keeps_isolation(monkeypatch,tmp_path):
    monkeypatch.setenv('PRATOAR_SANDBOX_PROFILE','restricted-proc')
    monkeypatch.setattr('shutil.which',lambda name:'/usr/bin/'+name)
    monkeypatch.setattr('app.pipeline.reconstruct.sys.platform','linux')
    command=sandbox_command(['true'],tmp_path)
    assert command[:5]==['setpriv','--no-new-privs','--inh-caps=-all','--ambient-caps=-all','--bounding-set=-all']
    assert '--unshare-user' in command and '--unshare-net' in command and '--unshare-pid' in command
    assert '--proc' not in command
    assert any(command[i:i+2]==['--tmpfs','/proc'] for i in range(len(command)-1))
    assert '/proc/cpuinfo' in command and '/proc/meminfo' in command
    assert '/proc/1/environ' not in command
    assert command.index('--tmpfs')<command.index('--bind')

def test_unknown_sandbox_profile_cannot_disable_isolation(monkeypatch,tmp_path):
    monkeypatch.setenv('PRATOAR_SANDBOX_PROFILE','none')
    monkeypatch.setattr('shutil.which',lambda name:'/usr/bin/'+name)
    monkeypatch.setattr('app.pipeline.reconstruct.sys.platform','linux')
    with pytest.raises(PipelineError,match='SANDBOX_UNAVAILABLE'):
        sandbox_command(['true'],tmp_path)

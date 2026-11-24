"""Runs inside Blender only. Conservative support-plane crop; reject ambiguous scenes."""
import json
import math
import sys
from pathlib import Path
import bpy
import bmesh
import numpy as np
from mathutils import Vector
sys.path.insert(0,str(Path(__file__).resolve().parent))
from support_plane import support_plane
from foreground import foreground_vertices

def main():
    source,out,diameter=sys.argv[sys.argv.index('--')+1:]
    out=Path(out);diameter=float(diameter)
    if not 1<=diameter<=300: raise ValueError('INVALID_SCALE')
    bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
    # Preserve the COLMAP/OpenMVS world frame for silhouette projection.
    # Blender's default OBJ import rotates Y-up data by 90 degrees.
    bpy.ops.wm.obj_import(filepath=source,forward_axis='Y',up_axis='Z')
    objects=[item for item in bpy.context.scene.objects if item.type=='MESH']
    if not objects: raise ValueError('CAPTURE_QUALITY')
    bpy.ops.object.select_all(action='DESELECT')
    for item in objects: item.select_set(True)
    bpy.context.view_layer.objects.active=objects[0];bpy.ops.object.join();obj=bpy.context.object
    bpy.ops.object.transform_apply(location=True,rotation=True,scale=True)
    points=np.array([tuple(v.co) for v in obj.data.vertices])
    surface_normal=sum((np.array(tuple(face.normal))*face.area for face in obj.data.polygons),start=np.zeros(3))
    # Surface area, not tessellation density, determines support confidence.
    # Textured food has many more vertices than a simple tabletop/box.
    centers=np.array([tuple(face.center) for face in obj.data.polygons])
    areas=np.array([face.area for face in obj.data.polygons])
    normal,distance,threshold=support_plane(centers,surface_normal,areas)
    with np.load(out/'foreground.npz',allow_pickle=False) as views:
        foreground=foreground_vertices(points,views)
        segmented_views=len(views['masks'])
    if np.mean(foreground)<.03:raise ValueError('RECAPTURE_BACKGROUND')
    rotation=Vector(normal).rotation_difference(Vector((0,1,0)))
    bm=bmesh.new();bm.from_mesh(obj.data)
    remove=[vertex for vertex in bm.verts if not foreground[vertex.index] or np.dot(np.asarray(vertex.co),normal)+distance<=threshold]
    bmesh.ops.delete(bm,geom=remove,context='VERTS');bm.to_mesh(obj.data);bm.free()
    if not len(obj.data.polygons): raise ValueError('RECAPTURE_BACKGROUND')
    for vertex in obj.data.vertices: vertex.co=rotation@vertex.co
    # Keep only the dominant connected component after removing the support plane.
    bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT');bpy.ops.mesh.separate(type='LOOSE');bpy.ops.object.mode_set(mode='OBJECT')
    meshes=[item for item in bpy.context.scene.objects if item.type=='MESH']
    obj=max(meshes,key=lambda item:len(item.data.polygons))
    for item in meshes:
        if item!=obj: bpy.data.objects.remove(item,do_unlink=True)
    bpy.context.view_layer.objects.active=obj;obj.select_set(True)
    if not any(slot.material and slot.material.use_nodes and any(node.type=='TEX_IMAGE' and node.image for node in slot.material.node_tree.nodes) for slot in obj.material_slots): raise ValueError('TEXTURE_MISSING')
    triangles=sum(len(face.vertices)-2 for face in obj.data.polygons)
    if triangles>100000:
        modifier=obj.modifiers.new('Mobile budget','DECIMATE');modifier.ratio=98000/triangles;bpy.ops.object.modifier_apply(modifier=modifier.name)
    points=np.array([tuple(vertex.co) for vertex in obj.data.vertices]);low=points.min(axis=0);high=points.max(axis=0)
    scale=diameter/100/max(high[0]-low[0],high[2]-low[2]);offset=Vector(((low[0]+high[0])/2,low[1],(low[2]+high[2])/2))
    for vertex in obj.data.vertices: vertex.co=(vertex.co-offset)*scale
    bpy.ops.export_scene.gltf(filepath=str(out/'model.glb'),export_format='GLB',use_selection=True,export_yup=False)
    scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.device='CPU';scene.cycles.samples=16;scene.cycles.use_denoising=False
    scene.render.resolution_x=512;scene.render.resolution_y=512;scene.render.resolution_percentage=100
    scene.world.use_nodes=True;scene.world.node_tree.nodes['Background'].inputs['Color'].default_value=(1,1,1,1);scene.world.node_tree.nodes['Background'].inputs['Strength'].default_value=.7
    width=diameter/100
    # GLB is Y-up. Blender's preview camera uses Z-up; rotate only after export.
    obj.rotation_euler[0]=math.pi/2
    bpy.ops.object.camera_add(location=(width*.8,-width*.9,width*1.3));camera=bpy.context.object
    direction=Vector((0,0,width*.1))-camera.location;camera.rotation_euler=direction.to_track_quat('-Z','Y').to_euler();scene.camera=camera
    scene.render.filepath=str(out/'poster.png');scene.render.image_settings.file_format='PNG';scene.render.film_transparent=True;bpy.ops.render.render(write_still=True)
    (out/'metrics.json').write_text(json.dumps({'triangles':sum(len(face.vertices)-2 for face in obj.data.polygons),'widthMeters':width,'crop':'mobilesam-multiview-review-required','segmentedViews':segmented_views}))

if __name__=='__main__': main()

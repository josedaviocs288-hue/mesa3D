# Runtime dependencies

COLMAP: BSD, https://github.com/colmap/colmap/blob/3.13.0/COPYING.txt.
OpenMVS: AGPL-3.0, https://github.com/cdcseacave/openMVS/blob/v2.4.0/LICENSE.
VCG, Blender, FFmpeg and binary dependencies carry their respective licenses.

Preserve original copyright/license files. The container retains source checkouts
under /opt/sources; distribute corresponding source and any modifications when
required by applicable licenses. Do not assume subprocess isolation exempts a
network service from the licensing terms. This prototype is not cleared for
commercial distribution merely because its unit tests pass.

The Vercel Sandbox experiment uses COLMAP built from the pinned source under
`/vercel/pratoar/colmap`, distribution FFmpeg/Blender, and the official OpenMVS
v2.4.0 Ubuntu release (SHA256
`7104ae1ddd6ca38fbca9e0e4a70b20af59e21e0b497eb7181c864fbf38ca8d00`).
It is a separate build profile from the unbuilt Dockerfile. The release binary's
exact source commit has not independently been verified; retain the upstream
release/source references and do not represent the Docker source lock as proof
of the prebuilt binary's provenance.

MobileSAM: Apache-2.0, pinned revision f706ad9c4eb7f219c00d9050e46328518ffb65d2, https://github.com/ChaoningZhang/MobileSAM. Preserve MobileSAM-LICENSE beside the verified checkpoint. Its dependencies include PyTorch, TorchVision, timm and OpenCV with their own notices. The remote package lock records the CPU versions; no paid inference API is used.

Research fixtures from CO3Dv2 are CC BY-NC 4.0 and must remain private. They are not models for the commercial menu or public library.

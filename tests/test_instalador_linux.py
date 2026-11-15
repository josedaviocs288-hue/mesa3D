"""Testes offline de selecao/verificacao de pacotes do instalador Linux."""
import importlib.util
from pathlib import Path
import hashlib
import os
import tempfile
import unittest
import zipfile

MODULE = Path(__file__).resolve().parents[1] / 'instalador/instalar-linux.py'
spec = importlib.util.spec_from_file_location('instalar_linux', MODULE)
installer = importlib.util.module_from_spec(spec)
spec.loader.exec_module(installer)


class InstaladorLinuxTests(unittest.TestCase):
    def test_node_24_e_sha256_oficial(self):
        version, filename = installer.node_version([
            {'version': 'v22.15.0', 'files': ['linux-x64']},
            {'version': 'v24.11.0', 'files': ['linux-x64']},
        ])
        self.assertEqual(version, 'v24.11.0')
        self.assertEqual(filename, 'node-v24.11.0-linux-x64.tar.xz')
        digest = 'a' * 64
        self.assertEqual(installer.checksum_from_shasums(f'{digest}  {filename}\n', filename), digest)
        with self.assertRaisesRegex(RuntimeError, 'hash oficial'):
            installer.checksum_from_shasums('', filename)

    def test_asset_ubuntu_verificado(self):
        asset = {'name': 'OpenMVS_Ubuntu_x64.zip', 'digest': 'sha256:' + 'b' * 64,
                 'browser_download_url': 'https://github.com/cdcseacave/openMVS/releases/download/v2.4.0/OpenMVS_Ubuntu_x64.zip'}
        self.assertEqual(installer.select_ubuntu_asset({'tag_name': 'v2.4.0', 'assets': [asset]}), asset)
        with self.assertRaisesRegex(RuntimeError, 'SHA256'):
            installer.select_ubuntu_asset({'tag_name': 'v2.4.0', 'assets': [{**asset, 'digest': None}]})
        with self.assertRaisesRegex(RuntimeError, 'outra versao'):
            installer.select_ubuntu_asset({'tag_name': 'v2.3.0', 'assets': [asset]})
        with self.assertRaisesRegex(RuntimeError, 'Origem'):
            installer.select_ubuntu_asset({'tag_name': 'v2.4.0', 'assets': [{**asset, 'browser_download_url': 'https://evil.test/x'}]})

    def test_zip_inseguro_e_bloqueado(self):
        with tempfile.TemporaryDirectory() as temp:
            archive = Path(temp) / 'evil.zip'
            with zipfile.ZipFile(archive, 'w') as z:
                z.writestr('../fora.txt', 'inseguro')
            with self.assertRaisesRegex(RuntimeError, 'inseguro'):
                installer.safe_extract_zip(archive, Path(temp) / 'instalado')
            self.assertFalse((Path(temp) / 'fora.txt').exists())

    def test_arquivos_do_motor_necessarios(self):
        with tempfile.TemporaryDirectory() as temp:
            binary = Path(temp) / 'bin'
            binary.mkdir()
            for name in ('DensifyPointCloud', 'ReconstructMesh', 'TextureMesh', 'TransformScene'):
                (binary / name).write_bytes(b'fake')
            self.assertEqual(installer.locate_engine(Path(temp)), binary)
            (binary / 'TransformScene').unlink()
            # TransformScene e opcional desde 8.3.1: TextureMesh exporta GLB.
            self.assertEqual(installer.locate_engine(Path(temp)), binary)
            (binary / 'TextureMesh').unlink()
            self.assertIsNone(installer.locate_engine(Path(temp)))

    def test_download_arquivo_local_so_aceita_hash(self):
        with tempfile.TemporaryDirectory() as temp:
            source = Path(temp) / 'source'
            source.write_bytes(b'payload')
            target = Path(temp) / 'cached.zip'
            target.write_bytes(b'payload')
            digest = hashlib.sha256(b'payload').hexdigest()
            installer.download('https://example.org/not-used', target, digest)
            self.assertEqual(target.read_bytes(), b'payload')
            with self.assertRaisesRegex(RuntimeError, 'SHA256'):
                installer.download('https://example.org/not-used', target, 'invalid')

if __name__ == '__main__':
    unittest.main()

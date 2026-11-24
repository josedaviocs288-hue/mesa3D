"""No photogrammetry tools required: exercise the adapter's input boundary."""
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
import uuid
import zipfile

spec = importlib.util.spec_from_file_location('mesa3d_job', Path(__file__).parents[1] / 'scripts' / 'mesa3d-job.py')
adapter = importlib.util.module_from_spec(spec)
spec.loader.exec_module(adapter)


class AdapterTests(unittest.TestCase):
    def capture(self, directory):
        (directory / 'photos').mkdir()
        names = [str(uuid.uuid4()) + '.jpg' for _ in range(30)]
        for name in names:
            (directory / 'photos' / name).write_bytes(b'\xff\xd8\xfffixture')
        (directory / 'manifest.json').write_text(json.dumps({'version': 1, 'photos': names}))
        return names

    def test_server_archive_has_only_generated_safe_names(self):
        with tempfile.TemporaryDirectory() as tmp:
            directory = Path(tmp)
            self.capture(directory)
            with zipfile.ZipFile(adapter.build_capture(directory)) as archive:
                self.assertEqual(len(archive.infolist()), 30)
                self.assertTrue(all('/' not in i.filename and '\\' not in i.filename for i in archive.infolist()))

    def test_traversal_and_duplicate_rejected_before_decode(self):
        for invalid in ['../outside.jpg', 'x' * 36 + '.jpg']:
            with tempfile.TemporaryDirectory() as tmp:
                directory = Path(tmp)
                names = self.capture(directory)
                names[0] = invalid
                (directory / 'manifest.json').write_text(json.dumps({'version': 1, 'photos': names}))
                with self.assertRaises(ValueError):
                    adapter.validate_capture(directory)

    def test_photo_count_and_expansion_limits(self):
        with tempfile.TemporaryDirectory() as tmp:
            directory = Path(tmp)
            names = self.capture(directory)
            (directory / 'photos' / names[0]).write_bytes(b'')
            with self.assertRaises(ValueError):
                adapter.validate_capture(directory)


if __name__ == '__main__':
    unittest.main()

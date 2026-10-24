"""수집기 중복 실행·호출 장부·원천 백업 회귀 시험. 네트워크를 쓰지 않는다."""
import argparse
import datetime as dt
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

PIPELINE = Path(__file__).resolve().parents[1] / 'pipeline'
sys.path.insert(0, str(PIPELINE))
import collect_bus_variance as V
import backup_variance as B

CHILD = """
import os, sys
sys.path.insert(0, sys.argv[1])
import collect_bus_variance as v
v.OUT_DIR = sys.argv[2]
v.STATE = os.path.join(v.OUT_DIR, 'state.json')
print(v.take_lock(), flush=True)
if len(sys.argv) > 3:
    sys.stdin.read()
v.release_lock()
"""


class CollectionOpsTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        self.paths = patch.multiple(V, OUT_DIR=str(self.root), STATE=str(self.root / 'state.json'))
        self.paths.start()

    def tearDown(self):
        V.release_lock()
        self.paths.stop()
        self.tmp.cleanup()

    def test_sleeping_owner_is_not_replaced_by_stale_timestamp(self):
        self.assertTrue(V.take_lock())
        V.save_state({'lock': {'pid': 1, 't': '2000-01-01T00:00:00'}})
        result = subprocess.run([sys.executable, '-c', CHILD, str(PIPELINE), str(self.root)],
                                capture_output=True, text=True, timeout=10)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(result.stdout.strip(), 'False')

    def test_once_cannot_overlap_daemon_and_crash_releases_lock(self):
        child = subprocess.Popen([sys.executable, '-u', '-c', CHILD, str(PIPELINE),
                                  str(self.root), 'hold'], stdin=subprocess.PIPE,
                                 stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        try:
            self.assertEqual(child.stdout.readline().strip(), 'True')
            with patch.object(sys, 'argv', ['collector', '--once']), \
                 patch.object(V, 'collect') as collect, patch.object(V.C, 'log'):
                V.main()
                collect.assert_not_called()
        finally:
            child.kill()
            child.communicate(timeout=10)
        self.assertTrue(V.take_lock())

    def test_budget_is_reserved_before_request_and_survives_interrupt(self):
        today = dt.date.today().strftime('%Y%m%d')
        args = argparse.Namespace(routes=2, include_village=False, daemon=False,
                                  minutes=55, once=True, interval=5)
        def interrupted(*_):
            self.assertEqual(V.load_state()[today], 2)
            raise KeyboardInterrupt()
        with patch.object(V.C, 'load_keys', return_value={'DATA_GO_KR_KEY': 'test-only'}), \
             patch.object(V.C, 'log'), patch.object(V, 'DAILY_CAP', 2), \
             patch.object(V, 'build_panel', return_value=[('A', '1', 'trunk'), ('B', '2', 'trunk')]), \
             patch.object(V, 'snapshot', side_effect=interrupted) as snapshot:
            with self.assertRaises(KeyboardInterrupt):
                V.collect(args)
            snapshot.reset_mock()
            V.collect(args)
            snapshot.assert_not_called()
            self.assertEqual(V.load_state()[today], 2)

    def test_unreadable_budget_never_becomes_zero(self):
        Path(V.STATE).write_text('{broken', encoding='utf-8')
        with self.assertRaises(ValueError):
            V.load_state()
        Path(V.STATE).write_text('{"20261008":900}', encoding='utf-8-sig')
        self.assertEqual(V.load_state()['20261008'], 900)

    def test_failed_atomic_save_keeps_previous_budget(self):
        V.save_state({'used': 800})
        with patch.object(V.os, 'replace', side_effect=OSError('disk unavailable')):
            with self.assertRaises(OSError):
                V.save_state({'used': 900})
        self.assertEqual(V.load_state(), {'used': 800})
        self.assertEqual(list(self.root.glob('state-*.tmp')), [])

    def test_backup_keeps_nested_files_and_updates_same_size_changes(self):
        src, dest = self.root / 'src', self.root / 'dest'
        file = src / '20261008' / '0800.json.gz'
        file.parent.mkdir(parents=True)
        file.write_bytes(b'old')
        (src / 'collector.lock').write_bytes(b'0')
        self.assertEqual(B.backup_tree(str(src), str(dest)), 1)
        self.assertEqual(B.backup_tree(str(src), str(dest)), 0)
        file.write_bytes(b'new')
        os.utime(file, (1000000000, 1000000000))
        self.assertEqual(B.backup_tree(str(src), str(dest)), 1)
        self.assertEqual((dest / '20261008' / file.name).read_bytes(), b'new')
        self.assertFalse((dest / 'collector.lock').exists())
        (dest / 'older.json').write_text('keep', encoding='utf-8')
        B.backup_tree(str(src), str(dest))
        self.assertTrue((dest / 'older.json').exists())

    def test_failed_copy_keeps_previous_backup(self):
        src, dest = self.root / 'src', self.root / 'dest'
        src.mkdir(); dest.mkdir()
        (src / 'sample').write_bytes(b'new content')
        (dest / 'sample').write_bytes(b'old')
        with patch.object(B.shutil, 'copy2', side_effect=OSError('disk unavailable')):
            with self.assertRaises(OSError):
                B.backup_tree(str(src), str(dest))
        self.assertEqual((dest / 'sample').read_bytes(), b'old')
        self.assertEqual(list(dest.glob('*.tmp')), [])


if __name__ == '__main__':
    unittest.main()

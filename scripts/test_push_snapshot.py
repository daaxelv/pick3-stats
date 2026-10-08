"""The Pick 3/M4L and Quick Draw publishers use the same tested save logic."""
from pathlib import Path
import os
import subprocess
import unittest

import test_scratchoff_save as fixtures

ROOT = Path(__file__).resolve().parents[1]


class SharedPublisherTests(fixtures.SnapshotSaveTests):
    def save(self, wrapper=None):
        fixtures.git(self.bot, 'add', 'scratchoffs/data')
        fixtures.git(self.bot, 'commit', '-m', 'snapshot')
        env = dict(os.environ, SNAPSHOT_BRANCH='main')
        if wrapper:
            bindir = self.root / 'bin'
            bindir.mkdir()
            shim = bindir / 'git'
            shim.write_text(wrapper)
            shim.chmod(0o755)
            env['PATH'] = str(bindir) + os.pathsep + env['PATH']
        return subprocess.run(['bash', str(ROOT / 'scripts/push_snapshot.sh')],
                              cwd=self.bot, env=env, text=True,
                              stdout=subprocess.PIPE, stderr=subprocess.STDOUT)

    def test_workflows_use_shared_publisher(self):
        for name in ['update-results', 'quickdraw-backfill']:
            text = (ROOT / f'.github/workflows/{name}.yml').read_text()
            self.assertIn('bash scripts/push_snapshot.sh', text)
            self.assertIn('SNAPSHOT_BRANCH:', text)
            self.assertIn('fetch-depth: 0', text)
            self.assertNotIn('git push', text)


if __name__ == '__main__':
    unittest.main()

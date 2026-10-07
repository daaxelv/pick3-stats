"""Exercise the exact workflow save step using disposable local Git remotes."""
import os
from pathlib import Path
import subprocess
import tempfile
import unittest


WORKFLOW = Path(__file__).resolve().parents[1] / '.github/workflows/scratchoffs-update.yml'


def git(cwd, *args):
    return subprocess.check_output(['git', *args], cwd=cwd, stderr=subprocess.STDOUT, text=True)


class SnapshotSaveTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self.remote = self.root / 'remote.git'
        self.bot = self.root / 'bot'
        self.other = self.root / 'other'
        git(self.root, 'init', '--bare', '--initial-branch=main', str(self.remote))
        git(self.root, 'clone', str(self.remote), str(self.bot))
        for key, value in [('user.name', 'test'), ('user.email', 'test@example.invalid')]:
            git(self.bot, 'config', key, value)
        (self.bot / 'scratchoffs/data').mkdir(parents=True)
        (self.bot / 'scratchoffs/data/snapshot.json').write_text('old\n')
        git(self.bot, 'add', '.')
        git(self.bot, 'commit', '-m', 'initial')
        git(self.bot, 'push', 'origin', 'main')
        git(self.root, 'clone', str(self.remote), str(self.other))
        for key, value in [('user.name', 'other'), ('user.email', 'other@example.invalid')]:
            git(self.other, 'config', key, value)
        (self.bot / 'scratchoffs/data/snapshot.json').write_text('new snapshot\n')

    def advance(self, conflict=False):
        p = self.other / ('scratchoffs/data/snapshot.json' if conflict else 'draw-results.txt')
        p.write_text('new draw results\n')
        git(self.other, 'add', '.')
        git(self.other, 'commit', '-m', 'other collector')
        git(self.other, 'push', 'origin', 'main')

    def save(self, wrapper=None):
        text = WORKFLOW.read_text().split('      - name: Commit updated snapshots', 1)[1]
        script = '\n'.join(line[10:] for line in text.split('        run: |\n', 1)[1].splitlines())
        env = dict(os.environ, SNAPSHOT_BRANCH='main')
        if wrapper:
            bindir = self.root / 'bin'
            bindir.mkdir()
            shim = bindir / 'git'
            shim.write_text(wrapper)
            shim.chmod(0o755)
            env['PATH'] = str(bindir) + os.pathsep + env['PATH']
        return subprocess.run(['bash', '-e', '-c', script], cwd=self.bot, env=env,
                              text=True, stdout=subprocess.PIPE, stderr=subprocess.STDOUT)

    def assert_saved(self):
        self.assertEqual(git(self.remote, 'show', 'main:scratchoffs/data/snapshot.json'), 'new snapshot\n')
        self.assertEqual(git(self.remote, 'show', 'main:draw-results.txt'), 'new draw results\n')

    def test_remote_advance_before_save_preserves_both_collectors(self):
        self.advance()
        result = self.save()
        self.assertEqual(result.returncode, 0, result.stdout)
        self.assert_saved()

    def test_remote_advance_during_push_retries(self):
        self.advance()
        # Only the first push is intercepted to inject a second concurrent writer.
        real_git = subprocess.check_output(['which', 'git'], text=True).strip()
        marker = self.root / 'raced'
        wrapper = f'''#!/bin/bash
if [ "$1" = push ] && [ ! -f "{marker}" ]; then
  touch "{marker}"
  "{real_git}" -C "{self.other}" pull --ff-only >/dev/null
  echo raced > "{self.other}/another-draw.txt"
  "{real_git}" -C "{self.other}" add another-draw.txt
  "{real_git}" -C "{self.other}" commit -m raced >/dev/null
  "{real_git}" -C "{self.other}" push origin main >/dev/null
fi
exec "{real_git}" "$@"
'''
        result = self.save(wrapper)
        self.assertEqual(result.returncode, 0, result.stdout)
        self.assertIn('retrying', result.stdout)
        self.assert_saved()
        self.assertEqual(git(self.remote, 'show', 'main:another-draw.txt'), 'raced\n')

    def test_same_file_conflict_stops_without_overwriting(self):
        self.advance(conflict=True)
        result = self.save()
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('refusing to overwrite', result.stdout)
        self.assertEqual(git(self.remote, 'show', 'main:scratchoffs/data/snapshot.json'), 'new draw results\n')
        self.assertFalse((self.bot / '.git/rebase-merge').exists())

    def test_permission_rejection_stops_without_retry(self):
        hook = self.remote / 'hooks/pre-receive'
        hook.write_text('#!/bin/sh\nexit 1\n')
        hook.chmod(0o755)
        result = self.save()
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('check permissions or network', result.stdout)
        self.assertNotIn('retrying', result.stdout)
        self.assertEqual(git(self.remote, 'show', 'main:scratchoffs/data/snapshot.json'), 'old\n')


if __name__ == '__main__':
    unittest.main()

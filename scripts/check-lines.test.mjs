import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const lines = (count) => 'code\n'.repeat(count)
const exemption = (maxLines) => ({ maxLines, reason: 'Legacy fixture' })

function fixture(t, initial = {}, baseline = {}) {
  const directory = mkdtempSync(join(tmpdir(), 'socratic-lines-'))
  t.after(() => rmSync(directory, { recursive: true, force: true }))
  const write = (file, content) => {
    mkdirSync(dirname(join(directory, file)), { recursive: true })
    writeFileSync(join(directory, file), content)
  }
  const run = (command, args) => spawnSync(command, args, { cwd: directory, encoding: 'utf8' })
  const git = (...args) => {
    const result = run('git', ['-c', `core.hooksPath=${join(directory, 'hooks')}`, ...args])
    assert.equal(result.status, 0, result.stderr)
    return result.stdout.trim()
  }
  const checkpoint = () => {
    git('add', '.')
    git(
      '-c',
      'user.name=Size Test',
      '-c',
      'user.email=size@example.invalid',
      '-c',
      'commit.gpgsign=false',
      'commit',
      '--quiet',
      '-m',
      'fixture',
    )
    return git('rev-parse', 'HEAD')
  }
  const setBaseline = (value) => write('.code-size-baseline.json', JSON.stringify(value))
  for (const file of ['scripts/check-lines.mjs', 'scripts/lib/git-files.mjs']) {
    mkdirSync(dirname(join(directory, file)), { recursive: true })
    copyFileSync(join(root, file), join(directory, file))
  }
  write('.gitignore', 'ignored/\nnode_modules/\n')
  for (const [file, content] of Object.entries(initial)) write(file, content)
  if (baseline !== null) setBaseline(baseline)
  git('init', '--quiet')
  checkpoint()
  return {
    directory,
    write,
    git,
    checkpoint,
    setBaseline,
    check: (...args) => run(process.execPath, ['scripts/check-lines.mjs', ...args]),
  }
}

function expect(result, status, message) {
  const output = result.stdout + result.stderr
  assert.equal(result.status, status, output)
  if (message) assert.ok(output.includes(message), output)
}

test('checks staged, unstaged and untracked code; counts CRLF and final unterminated lines', (t) => {
  const f = fixture(t, { 'staged.ts': '', 'changed.py': '', 'deleted.ts': '' })
  f.write('staged.ts', lines(601))
  f.git('add', 'staged.ts')
  f.write('changed.py', lines(601))
  f.write('new file.vue', 'code\r\n'.repeat(600) + 'last')
  rmSync(join(f.directory, 'deleted.ts'))
  expect(f.check(), 1, 'staged.ts (601 > 600)')
  expect(f.check(), 1, 'changed.py (601 > 600)')
  expect(f.check(), 1, 'new file.vue (601 > 600)')
  for (const file of ['staged.ts', 'changed.py', 'new file.vue']) f.write(file, lines(600))
  expect(f.check(), 0, 'WARN')
})

test('test files have an 800-line cap and excluded artifacts are skipped', (t) => {
  const f = fixture(t)
  for (const file of [
    'tests/test_flow.py',
    'src/__tests__/flow.ts',
    'flow.spec.ts',
    'flow.test.mjs',
  ]) {
    f.write(file, lines(800))
  }
  for (const file of [
    'ignored/file.ts',
    'node_modules/file.ts',
    'frontend/dist/file.js',
    'backend/alembic/versions/0001_fixture.py',
    'src/api.generated.ts',
    'data.json',
  ])
    f.write(file, lines(1000))
  expect(f.check(), 0, 'limit 800')
  f.write('tests/test_flow.py', lines(801))
  expect(f.check(), 1, 'tests/test_flow.py (801 > 800)')
})

test('legacy exemptions cannot grow and must shrink with the source', (t) => {
  const f = fixture(t, { 'legacy.py': lines(650) }, { 'legacy.py': exemption(650) })
  expect(f.check(), 0, 'BASELINE legacy.py')
  f.write('legacy.py', lines(651))
  expect(f.check(), 1, 'Line baseline exceeded')
  f.setBaseline({ 'legacy.py': exemption(651) })
  expect(f.check(), 1, 'Baseline cannot be added or increased')
  f.write('legacy.py', lines(620))
  f.setBaseline({ 'legacy.py': exemption(650) })
  expect(f.check(), 1, 'Lower line baseline')
  f.setBaseline({ 'legacy.py': exemption(620) })
  expect(f.check(), 0)
  f.write('legacy.py', lines(600))
  expect(f.check(), 1, 'Remove resolved line baseline')
  f.setBaseline({})
  expect(f.check(), 0)
})

test('new exemptions and renames cannot bypass the limit', (t) => {
  const f = fixture(t, { 'legacy.ts': lines(650) }, { 'legacy.ts': exemption(650) })
  f.git('mv', 'legacy.ts', 'renamed.ts')
  expect(f.check(), 1, 'Remove deleted file from line baseline')
  f.setBaseline({ 'renamed.ts': exemption(650) })
  expect(f.check(), 1, 'Baseline cannot be added or increased')
  f.setBaseline({})
  expect(f.check(), 1, 'renamed.ts (650 > 600)')
})

test('all mode finds untouched violations; CI compares committed changes to the supplied base', (t) => {
  const f = fixture(t, { 'untouched.ts': lines(601), 'committed.ts': '' })
  expect(f.check(), 0)
  expect(f.check('--all'), 1, 'untouched.ts')
  const base = f.git('rev-parse', 'HEAD')
  f.write('committed.ts', lines(601))
  f.checkpoint()
  expect(f.check(), 0)
  expect(f.check(`--base=${base}`), 1, 'committed.ts (601 > 600)')
  const emptyTree = f.git('hash-object', '-w', '-t', 'tree', '/dev/null')
  expect(f.check(`--base=${emptyTree}`), 1, 'untouched.ts')
  expect(f.check('--all', `--base=${base}`), 2, 'Usage:')
  expect(f.check('--base='), 2, 'Usage:')
  expect(f.check('--unknown'), 2, 'Usage:')
  expect(f.check('--base=missing-ref'), 2)
})

test('initial adoption can register existing debt without allowing subsequent additions', (t) => {
  const f = fixture(t, { 'legacy.py': lines(650) }, null)
  const base = f.git('rev-parse', 'HEAD')
  f.setBaseline({ 'legacy.py': exemption(650) })
  f.checkpoint()
  expect(f.check(`--base=${base}`), 0, 'BASELINE legacy.py')
  f.setBaseline({ 'legacy.py': { maxLines: 650, reason: '' } })
  expect(f.check(), 2, 'Invalid line baseline')
})

test('a first push cannot hide a baseline increase in an earlier commit', (t) => {
  const f = fixture(t, { 'legacy.py': lines(650) }, { 'legacy.py': exemption(650) })
  f.write('legacy.py', lines(651))
  f.setBaseline({ 'legacy.py': exemption(651) })
  f.checkpoint()
  f.write('unrelated.ts', 'export const value = 1\n')
  f.checkpoint()
  const emptyTree = f.git('hash-object', '-w', '-t', 'tree', '/dev/null')
  expect(f.check(`--base=${emptyTree}`), 1, 'Baseline cannot be added or increased')
})

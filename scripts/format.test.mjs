import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

const root = dirname(dirname(fileURLToPath(import.meta.url)))

test('format command checks and fixes changed files without rewriting unrelated files', () => {
  const fixture = mkdtempSync(join(tmpdir(), 'socratic-format-'))
  const run = (command, args) =>
    spawnSync(command, args, { cwd: fixture, encoding: 'utf8', env: process.env })
  const git = (...args) => {
    const result = run('git', ['-c', `core.hooksPath=${join(fixture, 'hooks')}`, ...args])
    assert.equal(result.status, 0, result.stderr)
  }
  const write = (file, content) => writeFileSync(join(fixture, file), content)
  const read = (file) => readFileSync(join(fixture, file), 'utf8')
  const format = (...args) => run(process.execPath, ['scripts/format.mjs', ...args])

  try {
    for (const directory of ['scripts', 'frontend', 'backend', 'ignored', 'hooks']) {
      mkdirSync(join(fixture, directory))
    }
    for (const file of [
      'scripts/format.mjs',
      '.prettierrc.json',
      '.prettierignore',
      '.editorconfig',
      'pyproject.toml',
    ]) {
      copyFileSync(join(root, file), join(fixture, file))
    }
    symlinkSync(
      join(root, 'frontend/node_modules'),
      join(fixture, 'frontend/node_modules'),
      'junction',
    )
    symlinkSync(join(root, 'backend/.venv'), join(fixture, 'backend/.venv'), 'junction')
    write('.gitignore', 'ignored/\nfrontend/node_modules/\nbackend/.venv/\n')
    write('untouched.ts', 'const untouched={value:1};\n')
    write('untouched.py', 'untouched={"value":1}\n')
    write('staged.ts', 'export const staged = 1\n')
    write('unstaged.ts', 'export const unstaged = 1\n')
    write('deleted.ts', 'export const deleted = 1\n')
    git('init', '--quiet')
    git('add', '.')
    git(
      '-c',
      'user.name=Formatter Test',
      '-c',
      'user.email=formatter@example.invalid',
      '-c',
      'commit.gpgsign=false',
      'commit',
      '--quiet',
      '-m',
      'fixture',
    )

    const changed = {
      'staged.ts': 'export const staged={value:2};\n',
      'unstaged.ts': 'export const unstaged={value:2};\n',
      'new file.ts': 'export const added={value:3};\n',
      'new.css': '.test{color:red;}\n',
      'new.vue':
        '<template><div class="test">{{ message.text }}</div></template>\n' +
        '<script setup lang="ts">const message={text:"Hello"};</script>\n' +
        '<style scoped>.test{color:red;}</style>\n',
      'new.py': 'added={"value":3}\n',
    }
    for (const [file, content] of Object.entries(changed)) write(file, content)
    git('add', 'staged.ts')
    rmSync(join(fixture, 'deleted.ts'))
    write('ignored/bad.ts', 'const ignored={value:1};\n')
    write('frontend/pnpm-lock.yaml', 'example:    true\n')

    const check = format('--check')
    assert.equal(check.status, 1, check.stdout + check.stderr)
    for (const [file, content] of Object.entries(changed)) {
      assert.ok((check.stdout + check.stderr).includes(file), `Missing check for ${file}`)
      assert.equal(read(file), content, '--check must not rewrite files')
    }

    const fix = format('--write')
    assert.equal(fix.status, 0, fix.stdout + fix.stderr)
    const recheck = format('--check')
    assert.equal(recheck.status, 0, recheck.stdout + recheck.stderr)
    assert.equal(read('untouched.ts'), 'const untouched={value:1};\n')
    assert.equal(read('untouched.py'), 'untouched={"value":1}\n')
    assert.equal(read('ignored/bad.ts'), 'const ignored={value:1};\n')
    assert.equal(read('frontend/pnpm-lock.yaml'), 'example:    true\n')
    assert.equal(run('git', ['show', ':staged.ts']).stdout, changed['staged.ts'])

    const all = format('--check', '--all')
    assert.equal(all.status, 1, all.stdout + all.stderr)
    assert.ok((all.stdout + all.stderr).includes('untouched.ts'))
    assert.ok((all.stdout + all.stderr).includes('untouched.py'))
    assert.equal(format('--check', '--write').status, 2)
    assert.equal(format('--unknown').status, 2)

    git('add', '.')
    git(
      '-c',
      'user.name=Formatter Test',
      '-c',
      'user.email=formatter@example.invalid',
      '-c',
      'commit.gpgsign=false',
      'commit',
      '--quiet',
      '-m',
      'formatted fixture',
    )
    const clean = format('--check')
    assert.equal(clean.status, 0, clean.stdout + clean.stderr)
    assert.ok(clean.stdout.includes('No supported code files to format.'))
  } finally {
    rmSync(fixture, { recursive: true, force: true })
  }
})

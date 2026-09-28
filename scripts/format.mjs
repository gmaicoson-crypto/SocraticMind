import { spawnSync } from 'node:child_process'
import { existsSync, statSync } from 'node:fs'
import { dirname, extname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const args = process.argv.slice(2)
const options = new Set(args.filter((arg) => !arg.startsWith('--base=')))
const baseOptions = args.filter((arg) => arg.startsWith('--base='))
if (
  [...options].some((option) => !['--check', '--write', '--all'].includes(option)) ||
  (options.has('--check') && options.has('--write')) ||
  baseOptions.length > 1 ||
  (baseOptions.length === 1 && (baseOptions[0] === '--base=' || options.has('--all')))
) {
  console.error('Usage: node scripts/format.mjs [--check | --write] [--all | --base=<ref>]')
  process.exit(2)
}
const base = baseOptions[0]?.slice('--base='.length)

function gitFiles(args) {
  const result = spawnSync('git', args, { cwd: root, encoding: 'utf8' })
  if (result.error || result.status !== 0) {
    console.error(result.error?.message ?? result.stderr)
    process.exit(2)
  }
  return result.stdout.split('\0').filter(Boolean)
}

// NUL-separated paths preserve spaces; --base includes committed PR changes.
const tracked = options.has('--all')
  ? gitFiles(['ls-files', '-z'])
  : gitFiles(['diff', base ? `${base}...HEAD` : 'HEAD', '--name-only', '--diff-filter=ACMR', '-z'])
const files = [
  ...new Set([...tracked, ...gitFiles(['ls-files', '--others', '--exclude-standard', '-z'])]),
]
  .filter((file) => existsSync(join(root, file)) && statSync(join(root, file)).isFile())
  .sort()

const prettierExtensions = new Set([
  '.vue',
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
  '.css',
  '.scss',
  '.less',
  '.html',
  '.json',
  '.yaml',
  '.yml',
])
const prettierFiles = files.filter((file) => prettierExtensions.has(extname(file)))
const pythonFiles = files.filter((file) => extname(file) === '.py')
const write = options.has('--write')
let failed = false

function run(command, args) {
  const result = spawnSync(command, args, { cwd: root, stdio: 'inherit' })
  if (result.error) console.error(result.error.message)
  if (result.error || result.status !== 0) failed = true
}

if (prettierFiles.length) {
  const prettier = join(root, 'frontend/node_modules/prettier/bin/prettier.cjs')
  if (!existsSync(prettier)) {
    console.error('Prettier is missing. Run: pnpm --dir frontend install')
    failed = true
  } else {
    run(process.execPath, [prettier, write ? '--write' : '--check', '--', ...prettierFiles])
  }
}

if (pythonFiles.length) {
  const python = join(
    root,
    'backend/.venv',
    process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python',
  )
  if (!existsSync(python)) {
    console.error('Python environment is missing. Run: python -m venv backend/.venv')
    failed = true
  } else {
    console.log('Python formatter dependency: backend/requirements-dev.txt')
    run(python, ['-m', 'ruff', 'format', ...(write ? [] : ['--check']), '--', ...pythonFiles])
  }
}

if (!prettierFiles.length && !pythonFiles.length) console.log('No supported code files to format.')
process.exitCode = failed ? 1 : 0

import { readFileSync } from 'node:fs'
import { dirname, extname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { codeFiles, git } from './lib/git-files.mjs'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const baselinePath = '.code-size-baseline.json'
const args = process.argv.slice(2)
const baseArgs = args.filter((arg) => arg.startsWith('--base='))
const all = args.includes('--all')
if (
  args.some((arg) => arg !== '--all' && !arg.startsWith('--base=')) ||
  args.filter((arg) => arg === '--all').length > 1 ||
  baseArgs.length > 1 ||
  (baseArgs.length && (all || baseArgs[0] === '--base='))
) {
  console.error('Usage: node scripts/check-lines.mjs [--all | --base=<ref>]')
  process.exit(2)
}
const base = baseArgs[0]?.slice('--base='.length)
const extensions = new Set([
  '.vue',
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
  '.py',
  '.css',
  '.scss',
  '.less',
  '.html',
  '.sql',
  '.sh',
])

function supported(file) {
  return (
    extensions.has(extname(file)) &&
    !/(^|\/)(node_modules|\.venv|dist|build|coverage|generated|__generated__)(\/|$)/.test(file) &&
    !file.startsWith('backend/alembic/versions/') &&
    !/\.(generated|gen)\./.test(file)
  )
}

function limits(file) {
  const test =
    /(^|\/)(tests|__tests__|test)\//.test(file) ||
    /(^|\/)test_[^/]+\.py$|\.(spec|test)\.[^/]+$/.test(file)
  return test ? { warn: 600, max: 800 } : { warn: 400, max: 600 }
}

function lineCount(content) {
  if (!content) return 0
  return content.split('\n').length - (content.endsWith('\n') ? 1 : 0)
}

function readBaseline(content) {
  const entries = JSON.parse(content)
  if (!entries || typeof entries !== 'object' || Array.isArray(entries)) {
    throw new Error('Line baseline must be an object keyed by repository-relative paths.')
  }
  for (const [file, entry] of Object.entries(entries)) {
    if (
      !supported(file) ||
      file.startsWith('/') ||
      file.split('/').includes('..') ||
      !Number.isInteger(entry?.maxLines) ||
      entry.maxLines <= limits(file).max ||
      typeof entry.reason !== 'string' ||
      !entry.reason.trim()
    )
      throw new Error(`Invalid line baseline: ${file}`)
  }
  return entries
}

try {
  const baseline = readBaseline(readFileSync(join(root, baselinePath), 'utf8'))
  const comparison = base ?? 'HEAD'
  const previousPaths = new Set(
    git(root, ['ls-tree', '-r', '--name-only', '-z', comparison]).split('\0'),
  )
  let previous = previousPaths.has(baselinePath)
    ? readBaseline(git(root, ['show', `${comparison}:${baselinePath}`]))
    : null
  let failed = false
  const fail = (message) => {
    console.error(message)
    failed = true
  }

  const checkGrowth = (next, prior) => {
    for (const [file, entry] of Object.entries(next)) {
      if (!prior[file] || entry.maxLines > prior[file].maxLines) {
        fail(`Baseline cannot be added or increased: ${file}`)
      }
    }
  }
  // A first push compares with an empty tree. Audit committed baseline changes
  // in that case so several commits cannot hide an added/increased exemption.
  if (!previous) {
    const revisions = git(root, [
      'log',
      '--first-parent',
      '--format=%H',
      'HEAD',
      '--',
      baselinePath,
    ])
      .trim()
      .split('\n')
      .filter(Boolean)
      .reverse()
    for (const revision of revisions) {
      const next = readBaseline(git(root, ['show', `${revision}:${baselinePath}`]))
      if (previous) checkGrowth(next, previous)
      previous = next
    }
  }
  if (previous) checkGrowth(baseline, previous)

  const files = codeFiles(root, { all, base }).filter(supported)
  // Validate all exemptions even on a clean tree, including stale/deleted entries.
  const checked = [...new Set([...files, ...Object.keys(baseline)])].sort()
  for (const file of checked) {
    const { warn, max } = limits(file)
    const entry = baseline[file]
    let count
    try {
      count = lineCount(readFileSync(join(root, file), 'utf8'))
    } catch (error) {
      if (error.code !== 'ENOENT') throw error
      fail(`Remove deleted file from line baseline: ${file}`)
      continue
    }
    if (entry) {
      if (count <= max) fail(`Remove resolved line baseline: ${file} (${count} <= ${max})`)
      else if (count < entry.maxLines)
        fail(`Lower line baseline: ${file} (${entry.maxLines} -> ${count})`)
      else if (count > entry.maxLines)
        fail(`Line baseline exceeded: ${file} (${count} > ${entry.maxLines})`)
      else console.log(`BASELINE ${file}: ${count} (${entry.reason})`)
    } else if (count > max) {
      fail(`Line limit exceeded: ${file} (${count} > ${max})`)
    } else if (count > warn) {
      console.warn(`WARN ${file}: ${count} lines (recommended <= ${warn}, limit ${max})`)
    }
  }
  console.log(
    `Line check: ${checked.length} files, ${Object.keys(baseline).length} legacy exemptions.`,
  )
  process.exitCode = failed ? 1 : 0
} catch (error) {
  console.error(error.message)
  process.exitCode = 2
}

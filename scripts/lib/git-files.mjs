import { spawnSync } from 'node:child_process'
import { existsSync, statSync } from 'node:fs'
import { join } from 'node:path'

export function git(root, args) {
  const result = spawnSync('git', args, { cwd: root, encoding: 'utf8' })
  if (result.error || result.status !== 0) {
    throw new Error(result.error?.message ?? result.stderr.trim())
  }
  return result.stdout
}

export function codeFiles(root, { all = false, base } = {}) {
  const tracked = all
    ? git(root, ['ls-files', '-z'])
    : git(root, [
        'diff',
        '--no-renames',
        ...(base ? [base, 'HEAD'] : ['HEAD']),
        '--name-only',
        '--diff-filter=ACM',
        '-z',
      ])
  return [
    ...new Set(
      `${tracked}${git(root, ['ls-files', '--others', '--exclude-standard', '-z'])}`
        .split('\0')
        .filter(Boolean),
    ),
  ]
    .filter((file) => existsSync(join(root, file)) && statSync(join(root, file)).isFile())
    .sort()
}

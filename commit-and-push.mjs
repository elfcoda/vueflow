import { spawnSync } from 'node:child_process'

const commitMessage = process.argv.slice(2).join(' ').trim()

if (!commitMessage) {
  console.error('Usage: node commit-and-push.mjs "your commit message"')
  process.exit(1)
}

const steps = [
  ['git', ['add', '.']],
  ['git', ['commit', '-m', commitMessage]],
  ['git', ['push', 'origin', 'main']],
]

for (const [command, args] of steps) {
  const result = spawnSync(command, args, {
    stdio: 'inherit',
  })

  if (result.status !== 0) {
    process.exit(result.status ?? 1)
  }
}
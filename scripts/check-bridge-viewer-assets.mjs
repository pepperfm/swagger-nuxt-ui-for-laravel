import { spawnSync } from 'node:child_process'
import {
  copyFileSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import process from 'node:process'

const assetFiles = [
  'resources/assets/viewer.js',
  'resources/assets/viewer.css',
]

for (const filePath of assetFiles) {
  if (!existsSync(filePath)) {
    console.error(`[swagger-ui] Missing bridge viewer asset: ${filePath}`)
    process.exit(1)
  }
}

const snapshotDir = mkdtempSync(join(tmpdir(), 'swagger-ui-bridge-assets-'))

try {
  for (const filePath of assetFiles) {
    copyFileSync(filePath, join(snapshotDir, basename(filePath)))
  }

  const build = spawnSync('bun', ['run', 'build:bridge-assets'], {
    stdio: 'inherit',
  })

  if (build.status !== 0) {
    process.exit(build.status ?? 1)
  }

  const changedFiles = assetFiles.filter((filePath) => {
    const before = readFileSync(join(snapshotDir, basename(filePath)), 'utf8')
    const after = readFileSync(filePath, 'utf8')

    return before !== after
  })

  if (changedFiles.length > 0) {
    console.error('[swagger-ui] Bridge viewer assets were stale and have been rebuilt:')
    for (const filePath of changedFiles) {
      console.error(`- ${filePath}`)
    }
    console.error('[swagger-ui] Include the rebuilt assets in the commit, then rerun this check.')
    process.exit(1)
  }

  console.info('[swagger-ui] Bridge viewer assets are current.')
} finally {
  rmSync(snapshotDir, {
    force: true,
    recursive: true,
  })
}

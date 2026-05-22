import process from 'node:process'

/**
 * Print migration hints for the deprecated JS installer entrypoint.
 *
 * @returns {{ ok: true, skipped: true, reason: string }} Deprecated installer status payload.
 */
export async function installLaravelBridge() {
  console.warn('[swagger-ui] WARN swagger-ui-bridge-install is deprecated')
  console.warn('[swagger-ui] WARN Composer-first install is canonical now')
  console.warn('[swagger-ui] WARN Run: composer require pepperfm/swagger-nuxt-ui-for-laravel')

  return {
    ok: true,
    skipped: true,
    reason: 'deprecated_installer',
  }
}

const isDirectRun = process.argv[1]?.endsWith('install-laravel-bridge.mjs')
if (isDirectRun) {
  await installLaravelBridge()
}

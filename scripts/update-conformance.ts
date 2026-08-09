/**
 * Rewrites every conformance `expected.css` from the current implementation.
 *
 * Exists as a script rather than an inline env assignment so the command is
 * identical on POSIX shells and PowerShell.
 */
import { spawn } from 'node:child_process'

const child = spawn('npx vitest run test/conformance.test.ts', {
  shell: true,
  stdio: 'inherit',
  env: { ...process.env, UPDATE_CONFORMANCE: '1' },
})

child.on('exit', (code: number | null) => {
  if (code === 0) {
    console.log('\nSnapshots refreshed. Review the diff before committing.')
  }
  process.exit(code ?? 1)
})

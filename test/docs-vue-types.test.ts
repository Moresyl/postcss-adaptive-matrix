import { execFileSync } from 'node:child_process'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, it } from 'vitest'

it('checks Vue template expressions rather than treating components as opaque modules', async () => {
  const directory = await mkdtemp(fileURLToPath(new URL('./.vue-check-', import.meta.url)))
  try {
    await writeFile(
      join(directory, 'tsconfig.json'),
      JSON.stringify({
        extends: '../../docs/.vitepress/tsconfig.json',
        include: ['./Fixture.vue'],
        exclude: [],
      }),
    )
    const check = () =>
      execFileSync(
        process.execPath,
        [
          fileURLToPath(new URL('../node_modules/vue-tsc/bin/vue-tsc.js', import.meta.url)),
          '--noEmit',
          '-p',
          join(directory, 'tsconfig.json'),
        ],
        { encoding: 'utf8', stdio: 'pipe' },
      )
    await writeFile(
      join(directory, 'Fixture.vue'),
      '<script setup lang="ts">const count = 1</script><template>{{ count.toFixed(0) }}</template>',
    )
    expect(check()).toBe('')
    await writeFile(
      join(directory, 'Fixture.vue'),
      '<script setup lang="ts">const count = 1</script><template>{{ count.toUpperCase() }}</template>',
    )
    try {
      check()
      expect.fail('Invalid Vue template passed the type gate')
    } catch (error) {
      expect((error as { stdout: string }).stdout).toContain(
        "Property 'toUpperCase' does not exist",
      )
    }
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
}, 15_000)

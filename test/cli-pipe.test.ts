import { spawn, spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, it } from 'vitest'

it.skipIf(!existsSync(new URL('../dist/cli.js', import.meta.url)))(
  'preserves Unicode CSS through real stdin and stdout pipes',
  () => {
    const css = '/* 中文 🌏 */\n.卡片::before { content: "你好 🌏 24px"; color: red }'
    const result = spawnSync(
      process.execPath,
      [fileURLToPath(new URL('../dist/cli.js', import.meta.url)), '-', '--css', '--no-color'],
      { input: Buffer.from(css, 'utf8'), encoding: 'utf8', timeout: 10_000 },
    )
    expect(result.error).toBeUndefined()
    expect(result.status, result.stderr).toBe(0)
    expect(result.stderr).toBe('')
    expect(result.stdout).toBe(`${css}\n`)
  },
)

it.skipIf(!existsSync(new URL('../dist/cli.js', import.meta.url)))(
  'loads CSS and configuration from Unicode paths with spaces and URL-significant characters',
  async () => {
    const directory = await mkdtemp(join(tmpdir(), 'adaptive 中文 #%-'))
    try {
      const css = join(directory, '样式 #100%.css')
      const config = join(directory, '配置 #100%.mjs')
      await writeFile(css, '.card { width: 24px }')
      await writeFile(config, 'export default { profiles: { app: 375 }, libraries: false }')
      const result = spawnSync(
        process.execPath,
        [
          fileURLToPath(new URL('../dist/cli.js', import.meta.url)),
          css,
          '--config',
          config,
          '--css',
          '--no-color',
        ],
        { encoding: 'utf8', timeout: 10_000 },
      )
      expect(result.error).toBeUndefined()
      expect(result.status, result.stderr).toBe(0)
      expect(result.stderr).toBe('')
      expect(result.stdout.trim()).toBe('.card { width: calc(6.4vw) }')
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  },
  15_000,
)

it.skipIf(!existsSync(new URL('../dist/cli.js', import.meta.url))).each(['--css', '--json'])(
  'fails promptly when a real downstream pipe closes during %s output',
  async (mode) => {
    const directory = await mkdtemp(join(tmpdir(), 'adaptive-pipe-close-'))
    try {
      const path = join(directory, 'large.css')
      await writeFile(path, `.${'x'.repeat(4 * 1024 * 1024)} { width: 24px }`)
      const child = spawn(
        process.execPath,
        [fileURLToPath(new URL('../dist/cli.js', import.meta.url)), path, mode, '--no-color'],
        { stdio: ['ignore', 'pipe', 'pipe'] },
      )
      let errors = ''
      child.stderr.setEncoding('utf8')
      child.stderr.on('data', (chunk: string) => {
        errors += chunk
      })
      child.stdout.once('data', () => child.stdout.destroy())
      let timedOut = false
      const deadline = setTimeout(() => {
        timedOut = true
        child.kill()
      }, 10_000)
      try {
        const code = await new Promise<number | null>((resolve, reject) => {
          child.once('error', reject)
          child.once('close', resolve)
        })
        expect(timedOut).toBe(false)
        expect(code, errors).toBe(1)
        expect(errors).toMatch(/EPIPE|Output stream closed|ECONNRESET/)
        expect(errors).not.toContain('Unhandled')
      } finally {
        clearTimeout(deadline)
        if (child.exitCode === null && child.signalCode === null) child.kill()
      }
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  },
  15_000,
)

it.skipIf(!existsSync(new URL('../dist/cli.js', import.meta.url)))(
  'delivers complete ordered CSS through a paused real output pipe',
  async () => {
    const directory = await mkdtemp(join(tmpdir(), 'adaptive-pipe-'))
    try {
      const files = []
      const expected = []
      for (let index = 0; index < 4; index++) {
        const css = `/* ${'x'.repeat(256 * 1024)} */\n.file-${index} { color: red }`
        const path = join(directory, `${index}.css`)
        await writeFile(path, css)
        files.push(path)
        expected.push(`${css}\n`)
      }
      const child = spawn(
        process.execPath,
        [
          fileURLToPath(new URL('../dist/cli.js', import.meta.url)),
          ...files,
          '--css',
          '--no-color',
        ],
        { stdio: ['ignore', 'pipe', 'pipe'] },
      )
      let output = ''
      let errors = ''
      child.stdout.setEncoding('utf8')
      child.stderr.setEncoding('utf8')
      child.stdout.on('data', (chunk: string) => {
        output += chunk
      })
      child.stderr.on('data', (chunk: string) => {
        errors += chunk
      })
      child.stdout.pause()
      const completed = new Promise<number | null>((resolve, reject) => {
        child.once('error', reject)
        child.once('close', resolve)
      })
      const deadline = setTimeout(() => child.kill(), 10_000)
      try {
        await new Promise<void>((resolve) => setTimeout(resolve, 150))
        child.stdout.resume()
        expect(await completed, errors).toBe(0)
        expect(errors).toBe('')
        expect(output).toBe(expected.join(''))
      } finally {
        clearTimeout(deadline)
        if (child.exitCode === null && child.signalCode === null) child.kill()
      }
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  },
  15_000,
)

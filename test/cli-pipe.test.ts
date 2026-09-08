import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, it } from 'vitest'

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

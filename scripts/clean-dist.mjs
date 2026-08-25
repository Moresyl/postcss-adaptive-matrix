import { rm } from 'node:fs/promises'

// tsup evaluates array configurations concurrently. Letting one member own
// `clean` means it can remove declaration files another member has just
// written. Clean exactly once before any build worker starts.
await rm('dist', { recursive: true, force: true })

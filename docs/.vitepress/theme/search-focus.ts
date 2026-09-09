/** Restore only a dismissed search, never an active dialog or another focused control. */
export function installSearchFocusRestore(doc: Document): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined
  const restore = (event: KeyboardEvent) => {
    if (event.key !== 'Escape' || !doc.querySelector('.VPLocalSearchBox')) return
    clearTimeout(timer)
    timer = setTimeout(() => {
      if (doc.querySelector('.VPLocalSearchBox') || doc.activeElement !== doc.body) return
      doc.querySelector<HTMLButtonElement>('#local-search button')?.focus({ preventScroll: true })
    }, 0)
  }
  doc.addEventListener('keydown', restore, true)
  return () => {
    clearTimeout(timer)
    doc.removeEventListener('keydown', restore, true)
  }
}

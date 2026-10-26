/** Restore only a dismissed search, never an active dialog or another focused control. */
export function installSearchFocusRestore(doc: Document): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined
  const schedule = () => {
    clearTimeout(timer)
    timer = setTimeout(() => {
      if (doc.querySelector('.VPLocalSearchBox') || doc.activeElement !== doc.body) return
      doc.querySelector<HTMLButtonElement>('#local-search button')?.focus({ preventScroll: true })
    }, 0)
  }
  const restore = (event: KeyboardEvent) => {
    if (event.key === 'Escape' && doc.querySelector('.VPLocalSearchBox')) schedule()
  }
  const rememberClose = (event: MouseEvent) => {
    if (!doc.querySelector('.VPLocalSearchBox')) return
    const target = event.target as Element | null
    if (target?.closest?.('.VPLocalSearchBox .back-button, .VPLocalSearchBox .backdrop')) schedule()
  }
  doc.addEventListener('keydown', restore, true)
  doc.addEventListener('click', rememberClose, true)
  return () => {
    clearTimeout(timer)
    doc.removeEventListener('keydown', restore, true)
    doc.removeEventListener('click', rememberClose, true)
  }
}

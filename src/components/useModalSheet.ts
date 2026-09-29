"use client"

// src/components/useModalSheet.ts
//
// The shared modal mechanics for the install-hint sheets (InstallHintAsk and
// InstallHintSheet), copied in origin from src/app/groups/[id]/EmailAskNote.tsx,
// the product's first modal, whose header documents each decision. EmailAskNote
// keeps its own copy on purpose.
//
// On mount: remember what had focus, focus the sheet itself (not a field), lock
// body scroll remembering the previous value. On unmount: hand both back.
// Escape calls the latest onClose (held in a ref updated in a layout effect, so
// it runs before the browser can dispatch a key event for the commit). Tab is
// trapped inside the sheet.

import { useEffect, useLayoutEffect, useRef } from "react"

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])'

export function useModalSheet(onClose: () => void) {
  const sheetRef = useRef<HTMLDivElement>(null)
  const returnFocusTo = useRef<Element | null>(null)
  const onCloseRef = useRef(onClose)
  useLayoutEffect(() => {
    onCloseRef.current = onClose
  })

  useEffect(() => {
    returnFocusTo.current = document.activeElement
    sheetRef.current?.focus()
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => {
      document.body.style.overflow = previousOverflow
      const back = returnFocusTo.current
      if (back instanceof HTMLElement && back.isConnected) back.focus()
    }
  }, [])

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault()
        onCloseRef.current()
        return
      }
      if (event.key !== "Tab") return
      const sheet = sheetRef.current
      if (!sheet) return
      const focusables = Array.from(sheet.querySelectorAll<HTMLElement>(FOCUSABLE))
      if (focusables.length === 0) {
        event.preventDefault()
        sheet.focus()
        return
      }
      const first = focusables[0]
      const last = focusables[focusables.length - 1]
      const active = document.activeElement
      if (event.shiftKey && (active === first || active === sheet)) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && active === last) {
        event.preventDefault()
        first.focus()
      }
    }
    document.addEventListener("keydown", onKeyDown)
    return () => document.removeEventListener("keydown", onKeyDown)
  }, [])

  return sheetRef
}

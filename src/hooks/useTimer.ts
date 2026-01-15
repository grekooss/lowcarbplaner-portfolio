/**
 * Hook do zarządzania timerem kroków gotowania
 *
 * Wzorowany na implementacji z .meal_prep/hooks/useTimer.ts
 * Obsługuje:
 * - Start/pauza/reset timera
 * - Dodawanie/odejmowanie czasu (+/- 1 min)
 * - Callback przy zakończeniu
 * - Bezpieczne zarządzanie interwałem
 */

import { useState, useEffect, useCallback, useRef } from 'react'

interface UseTimerOptions {
  /** Callback wywoływany gdy timer dojdzie do 0 */
  onExpire?: () => void
  /** Czy timer ma się automatycznie uruchomić */
  autoStart?: boolean
}

interface UseTimerReturn {
  /** Pozostały czas w sekundach */
  seconds: number
  /** Czy timer jest aktywny (odlicza) */
  isActive: boolean
  /** Przełącz start/pauza */
  toggle: () => void
  /** Uruchom timer */
  start: () => void
  /** Zatrzymaj timer */
  pause: () => void
  /** Zresetuj timer do początkowej wartości */
  reset: () => void
  /** Dodaj/odejmij sekundy (np. +60 lub -60) */
  adjust: (amount: number) => void
  /** Bezpośrednio ustaw sekundy (np. przy przywracaniu z tła) */
  setSeconds: (seconds: number) => void
  /** Ustaw sekundy i od razu uruchom timer (atomowa operacja) */
  startWith: (seconds: number) => void
  /** Czy timer się skończył (seconds === 0) */
  isFinished: boolean
  /** Sformatowany czas (MM:SS lub HH:MM:SS) */
  formattedTime: string
}

export function useTimer(
  initialSeconds: number,
  options: UseTimerOptions = {}
): UseTimerReturn {
  const { onExpire, autoStart = false } = options

  const [seconds, setSeconds] = useState(initialSeconds)
  const [isActive, setIsActive] = useState(autoStart)

  // Użyj ref dla callbacku by uniknąć problemów z zależnościami efektu
  const onExpireRef = useRef(onExpire)
  useEffect(() => {
    onExpireRef.current = onExpire
  }, [onExpire])

  // Główna logika timera
  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | null = null

    if (isActive && seconds > 0) {
      interval = setInterval(() => {
        setSeconds((prev) => prev - 1)
      }, 1000)
    } else if (seconds === 0 && isActive) {
      // Timer właśnie doszedł do 0
      setIsActive(false)
      if (onExpireRef.current) {
        onExpireRef.current()
      }
    }

    return () => {
      if (interval !== null) clearInterval(interval)
    }
  }, [isActive, seconds])

  const toggle = useCallback(() => {
    setIsActive((prev) => !prev)
  }, [])

  const start = useCallback(() => {
    // Użyj funkcji aktualizującej aby uniknąć problemów z closure
    setSeconds((currentSeconds) => {
      if (currentSeconds > 0) {
        setIsActive(true)
      }
      return currentSeconds
    })
  }, [])

  const pause = useCallback(() => {
    setIsActive(false)
  }, [])

  const reset = useCallback(() => {
    setSeconds(initialSeconds)
    setIsActive(false)
  }, [initialSeconds])

  const adjust = useCallback((amount: number) => {
    setSeconds((prev) => Math.max(0, prev + amount))
  }, [])

  const setSecondsDirectly = useCallback((newSeconds: number) => {
    setSeconds(Math.max(0, newSeconds))
  }, [])

  // Atomowa operacja: ustaw sekundy i uruchom timer
  const startWith = useCallback((newSeconds: number) => {
    const safeSeconds = Math.max(0, newSeconds)
    setSeconds(safeSeconds)
    if (safeSeconds > 0) {
      setIsActive(true)
    }
  }, [])

  // Formatowanie czasu
  const formattedTime = useCallback(() => {
    const h = Math.floor(seconds / 3600)
    const m = Math.floor((seconds % 3600) / 60)
    const s = seconds % 60

    if (h > 0) {
      return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
    }
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
  }, [seconds])

  return {
    seconds,
    isActive,
    toggle,
    start,
    pause,
    reset,
    adjust,
    setSeconds: setSecondsDirectly,
    startWith,
    isFinished: seconds === 0,
    formattedTime: formattedTime(),
  }
}

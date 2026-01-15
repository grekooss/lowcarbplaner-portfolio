'use client'

/**
 * CookingTimeline - Główny komponent osi czasu sesji gotowania
 *
 * Wyświetla:
 * - Pasek postępu całej sesji
 * - Listę kroków z timerami
 * - Grupowanie Mise en Place
 * - Konflikty zasobów
 * - Panel Background Timers
 * - Focus Mode (tryb skupienia)
 *
 * Wzorowany na logice z .meal_prep/components/session/ActiveSession.tsx
 */

import { useState, useEffect, useCallback } from 'react'
import { cn } from '@/lib/utils'
import { Progress } from '@/components/ui/progress'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Clock, CheckCircle2, AlertTriangle, Timer, Flame } from 'lucide-react'
import { TimelineStep } from './TimelineStep'
import { MisePlaceGroup } from './MisePlaceGroup'
import { BackgroundTimersPanel } from './BackgroundTimersPanel'
import { useBackgroundTimers } from '@/hooks/useBackgroundTimers'
import type {
  CookingTimelineDTO,
  CookingSessionStatus,
  TimelineStepDTO,
} from '@/types/dto.types'

interface CookingTimelineProps {
  timeline: CookingTimelineDTO
  sessionStatus: CookingSessionStatus
  currentStepIndex: number
  onStepComplete: (stepId: string) => void
  onStartSession: () => void
  onPauseSession: () => void
  onResumeSession: () => void
  onCompleteSession: () => void
  /** Callback do zamknięcia/anulowania sesji */
  onCloseSession?: () => void
  /** Callback do zmiany aktualnego kroku (np. cofnięcie) */
  onStepChange?: (newIndex: number) => void
  className?: string
}

export function CookingTimeline({
  timeline,
  sessionStatus,
  currentStepIndex,
  onStepComplete,
  onStartSession: _onStartSession,
  onPauseSession,
  onResumeSession,
  onCompleteSession,
  onCloseSession,
  onStepChange,
  className,
}: CookingTimelineProps) {
  void _onStartSession // Keep prop for API compatibility but unused
  const [elapsedMinutes, setElapsedMinutes] = useState(0)
  const [timerOverride, setTimerOverride] = useState<number | null>(null)

  // Background timers hook
  const {
    timers: backgroundTimers,
    addTimer,
    removeTimer,
    reclaimTimer,
  } = useBackgroundTimers()

  // Oblicz postęp
  const completedSteps = timeline.steps.filter(
    (s) => s.status === 'completed'
  ).length
  const totalSteps = timeline.steps.length
  const progressPercent =
    totalSteps > 0 ? Math.round((completedSteps / totalSteps) * 100) : 0

  // Timer elapsed time
  useEffect(() => {
    if (sessionStatus !== 'in_progress') return

    const interval = setInterval(() => {
      setElapsedMinutes((prev) => prev + 1)
    }, 60000) // co minutę

    return () => clearInterval(interval)
  }, [sessionStatus])

  // Grupuj kroki - prep jest obsługiwany przez MisePlaceGroup
  const otherSteps = timeline.steps.filter((s) => s.action_type !== 'prep')

  const remainingMinutes = Math.max(
    0,
    timeline.total_estimated_minutes - elapsedMinutes
  )

  // Formatuj minuty do formatu "1h 35min" lub "45min"
  const formatTime = (minutes: number): string => {
    if (minutes < 60) {
      return `${minutes}min`
    }
    const hours = Math.floor(minutes / 60)
    const mins = minutes % 60
    if (mins === 0) {
      return `${hours}h`
    }
    return `${hours}h ${mins}min`
  }

  // Handler do uruchomienia timera w tle
  const handleStartBackground = useCallback(
    (step: TimelineStepDTO, currentSeconds: number) => {
      addTimer({
        label: step.description,
        recipeName: step.recipe_name,
        durationSeconds: currentSeconds,
        originalStepId: step.id,
      })
      // Automatycznie przejdź do następnego kroku
      onStepComplete(step.id)
      setTimerOverride(null)
    },
    [addTimer, onStepComplete]
  )

  // Handler do cofnięcia się
  const handleStepBack = useCallback(() => {
    if (currentStepIndex > 0 && onStepChange) {
      const prevIndex = currentStepIndex - 1
      const prevStep = otherSteps[prevIndex]

      if (prevStep) {
        // Sprawdź czy poprzedni krok jest w tle
        const reclaimedTime = reclaimTimer(prevStep.id)

        if (reclaimedTime !== null) {
          setTimerOverride(reclaimedTime)
        } else {
          setTimerOverride(null)
        }

        onStepChange(prevIndex)
      }
    }
  }, [currentStepIndex, onStepChange, otherSteps, reclaimTimer])

  // Wrapper dla onStepComplete który resetuje override
  const handleStepComplete = useCallback(
    (stepId: string) => {
      setTimerOverride(null)
      onStepComplete(stepId)
    },
    [onStepComplete]
  )

  return (
    <div className={cn('space-y-6 pb-32', className)}>
      {/* Panel sesji gotowania - glassmorphism style */}
      <section className='relative flex flex-col gap-3 rounded-md border-2 border-white bg-white/40 px-3 py-3 shadow-sm backdrop-blur-xl sm:rounded-3xl sm:px-6 sm:py-4'>
        {/* Action buttons - prawy górny róg */}
        <div className='absolute top-3 right-3 flex gap-2 sm:top-4 sm:right-6'>
          {sessionStatus === 'in_progress' && (
            <Button
              onClick={onPauseSession}
              size='sm'
              className='bg-red-600 hover:bg-red-700'
            >
              Wstrzymaj
            </Button>
          )}
          {sessionStatus === 'paused' && (
            <Button
              onClick={onResumeSession}
              size='sm'
              className='bg-red-600 hover:bg-red-700'
            >
              Wznów
            </Button>
          )}
          {onCloseSession && (
            <Button
              onClick={onCloseSession}
              size='sm'
              variant='outline'
              className='border-red-300 bg-white text-red-600 hover:bg-red-50'
            >
              Zakończ
            </Button>
          )}
        </div>

        {/* Header */}
        <div>
          <h2 className='text-base font-bold tracking-tight text-gray-800 sm:text-xl'>
            Sesja gotowania
          </h2>
          <p className='text-xs text-gray-500'>
            Krok {currentStepIndex + 1} z {otherSteps.length}
          </p>
        </div>

        {/* Progress bar */}
        <div className='space-y-1.5'>
          <div className='flex justify-between text-xs text-gray-600 sm:text-sm'>
            <span>Postęp: {progressPercent}%</span>
            <span>
              {completedSteps} / {totalSteps} kroków
            </span>
          </div>
          <Progress value={progressPercent} className='h-2.5' />
        </div>

        {/* Time info */}
        <div className='flex flex-wrap gap-3 text-xs sm:gap-4 sm:text-sm'>
          <div className='flex items-center gap-1.5'>
            <Timer className='h-4 w-4 text-gray-500' />
            <span className='text-gray-700'>
              Szacowany czas:{' '}
              <span className='font-semibold'>
                {formatTime(timeline.total_estimated_minutes)}
              </span>
            </span>
          </div>
          <div className='flex items-center gap-1.5'>
            <Clock className='h-4 w-4 text-gray-500' />
            <span className='text-gray-700'>
              Pozostało:{' '}
              <span className='font-semibold'>
                ~{formatTime(remainingMinutes)}
              </span>
            </span>
          </div>
          <div className='flex items-center gap-1.5'>
            <Flame className='h-4 w-4 text-orange-500' />
            <span className='text-gray-700'>
              Aktywny czas:{' '}
              <span className='font-semibold'>
                {formatTime(timeline.active_minutes)}
              </span>
            </span>
          </div>
        </div>
      </section>

      {/* Konflikty zasobów */}
      {timeline.resource_conflicts.length > 0 && (
        <Card className='border-2 border-amber-300 bg-amber-50/50 backdrop-blur-md'>
          <CardHeader className='pb-2'>
            <CardTitle className='flex items-center gap-2 text-lg text-amber-800'>
              <AlertTriangle className='h-5 w-5' />
              Konflikty zasobów ({timeline.resource_conflicts.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className='space-y-2 text-sm'>
              {timeline.resource_conflicts.map((conflict, index) => (
                <li key={index} className='flex items-start gap-2'>
                  <span className='font-medium'>
                    {conflict.equipment_name}:
                  </span>
                  <span className='text-gray-600'>
                    {conflict.resolution_suggestion}
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* Mise en Place */}
      {timeline.mise_place_groups.length > 0 && (
        <div className='space-y-4'>
          <h3 className='text-lg font-semibold'>
            Przygotowanie (Mise en Place)
          </h3>
          <div className='grid gap-4 md:grid-cols-2'>
            {timeline.mise_place_groups.map((group) => (
              <MisePlaceGroup key={group.id} group={group} />
            ))}
          </div>
        </div>
      )}

      {/* Lista kroków */}
      <>
        <div className='space-y-4'>
          <h3 className='text-lg font-semibold'>Kroki gotowania</h3>
          <div className='space-y-3'>
            {otherSteps.map((step, index) => {
              // W widoku listy pokaż tylko ostatni, aktualny i kolejne kroki
              if (
                index < currentStepIndex - 1 ||
                index > currentStepIndex + 2
              ) {
                return null
              }

              const isActive =
                sessionStatus === 'in_progress' && index === currentStepIndex

              return (
                <div
                  key={step.id}
                  className={
                    index < currentStepIndex ? 'opacity-50 grayscale' : ''
                  }
                >
                  <TimelineStep
                    step={step}
                    isActive={isActive}
                    onComplete={() => handleStepComplete(step.id)}
                    onStartBackground={
                      step.action_type === 'passive'
                        ? (seconds) => handleStartBackground(step, seconds)
                        : undefined
                    }
                    onBack={handleStepBack}
                    hasPrevious={currentStepIndex > 0}
                    initialSecondsOverride={isActive ? timerOverride : null}
                  />
                </div>
              )
            })}

            {/* Informacja o ukrytych krokach */}
            {currentStepIndex + 3 < otherSteps.length && (
              <div className='py-4 text-center text-sm text-gray-400'>
                + {otherSteps.length - (currentStepIndex + 3)} więcej kroków...
              </div>
            )}
          </div>
        </div>

        {/* Wymagany sprzęt */}
        {timeline.required_equipment.length > 0 && (
          <Card className='border-2 border-white/30 bg-white/20 backdrop-blur-md'>
            <CardHeader className='pb-2'>
              <CardTitle className='text-lg'>Wymagany sprzęt</CardTitle>
            </CardHeader>
            <CardContent>
              <div className='flex flex-wrap gap-2'>
                {timeline.required_equipment.map((eq) => (
                  <Badge key={eq.id} variant='outline' className='text-sm'>
                    {eq.name}
                    {eq.quantity > 1 && ` (×${eq.quantity})`}
                  </Badge>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </>

      {/* Zakończenie sesji (widoczne w obu trybach) */}
      {currentStepIndex >= otherSteps.length &&
        sessionStatus === 'in_progress' && (
          <Card className='border-2 border-emerald-300 bg-emerald-50/50 backdrop-blur-md'>
            <CardContent className='py-8 text-center'>
              <div className='mx-auto mb-4 inline-flex rounded-full bg-emerald-100 p-3 text-emerald-600'>
                <CheckCircle2 size={32} />
              </div>
              <h3 className='mb-2 text-xl font-bold text-emerald-900'>
                Sesja Zakończona!
              </h3>
              <p className='mb-4 text-emerald-700'>
                Wszystkie kroki wykonane. Nie zapomnij zaktualizować spiżarni.
              </p>
              <Button
                onClick={onCompleteSession}
                className='bg-emerald-600 font-bold hover:bg-emerald-700'
              >
                Zakończ i Zapisz
              </Button>
            </CardContent>
          </Card>
        )}

      {/* Panel Background Timers */}
      <BackgroundTimersPanel
        timers={backgroundTimers}
        onDismiss={removeTimer}
      />
    </div>
  )
}

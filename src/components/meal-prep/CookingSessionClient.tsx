'use client'

/**
 * CookingSessionClient - Komponent klienta dla aktywnej sesji gotowania
 *
 * Wyświetla:
 * - CookingTimeline z krokami i panelem sesji
 */

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { ArrowLeft, AlertTriangle, Loader2 } from 'lucide-react'
import { CookingTimeline } from './CookingTimeline'
import { IngredientsCheckStep } from './IngredientsCheckStep'
import { useCookingSession } from '@/hooks/useCookingSession'
import { cancelSessionAction } from '@/lib/actions/cooking-sessions'

interface CookingSessionClientProps {
  sessionId: string
}

type SessionPhase = 'ingredients_check' | 'cooking'

export function CookingSessionClient({ sessionId }: CookingSessionClientProps) {
  const router = useRouter()
  const queryClient = useQueryClient()
  const [isClosing, setIsClosing] = useState(false)
  const [showCloseDialog, setShowCloseDialog] = useState(false)
  const [currentPhase, setCurrentPhase] =
    useState<SessionPhase>('ingredients_check')

  const {
    session,
    timeline,
    currentStepIndex,
    isLoading,
    isError,
    error,
    status,
    startSession,
    pauseSession,
    resumeSession,
    completeSession,
    completeStep,
    setCurrentStepIndex,
    isStarting,
    isPausing,
    isResuming,
    isCompleting,
  } = useCookingSession({
    sessionId,
    enableRealtime: !isClosing, // Wyłącz realtime gdy zamykamy sesję
    enableWakeLock: !isClosing,
  })

  // Handle close session - shows confirmation dialog
  const handleCloseSession = () => {
    setShowCloseDialog(true)
  }

  // Confirm close session - closes and redirects to meal-prep
  const confirmCloseSession = async () => {
    setShowCloseDialog(false)
    setIsClosing(true)
    try {
      // Najpierw usuń dane z cache aby zatrzymać realtime queries
      queryClient.removeQueries({ queryKey: ['cooking-session', sessionId] })
      queryClient.removeQueries({ queryKey: ['active-cooking-session'] })

      const result = await cancelSessionAction(sessionId)
      if ('error' in result) {
        console.error('Error closing session:', result.error)
      }

      // Unieważnij pozostałe cache
      await queryClient.invalidateQueries({ queryKey: ['cooking-sessions'] })

      // Użyj replace zamiast push aby zapobiec powrotowi przyciskiem "wstecz"
      router.replace('/cooking')
    } catch (error) {
      console.error('Error closing session:', error)
      // Nawet przy błędzie spróbuj przekierować
      router.replace('/cooking')
    }
  }

  if (isLoading) {
    return (
      <div className='flex justify-center py-12'>
        <Loader2 className='h-8 w-8 animate-spin text-red-500' />
      </div>
    )
  }

  if (isError) {
    return (
      <Card className='border-2 border-red-300 bg-red-50/50 backdrop-blur-md'>
        <CardContent className='flex flex-col items-center gap-4 py-8'>
          <AlertTriangle className='h-12 w-12 text-red-500' />
          <div className='text-center'>
            <h2 className='text-lg font-semibold text-red-700'>
              Błąd ładowania sesji
            </h2>
            <p className='text-sm text-red-600'>
              {error?.message || 'Nie udało się załadować sesji gotowania'}
            </p>
          </div>
          <Button onClick={() => router.push('/cooking')} variant='outline'>
            <ArrowLeft className='mr-2 h-4 w-4' />
            Wróć do listy sesji
          </Button>
        </CardContent>
      </Card>
    )
  }

  if (!session) {
    return (
      <Card className='border-2 border-white/30 bg-white/20 backdrop-blur-md'>
        <CardContent className='flex flex-col items-center gap-4 py-8'>
          <div className='text-center'>
            <h2 className='text-lg font-semibold'>Sesja nie znaleziona</h2>
            <p className='text-sm text-gray-500'>
              Sesja o podanym ID nie istnieje lub została usunięta
            </p>
          </div>
          <Button onClick={() => router.push('/cooking')} variant='outline'>
            <ArrowLeft className='mr-2 h-4 w-4' />
            Wróć do listy sesji
          </Button>
        </CardContent>
      </Card>
    )
  }

  const handleStepComplete = (stepId: string) => {
    completeStep(stepId)
  }

  const handleIngredientsConfirmed = () => {
    setCurrentPhase('cooking')
    // Automatycznie rozpocznij sesję gdy użytkownik potwierdzi składniki
    if (status === 'planned') {
      startSession()
    }
  }

  const handleBackFromIngredients = () => {
    router.push('/cooking')
  }

  return (
    <div className='space-y-6'>
      {/* Faza 1: Weryfikacja składników */}
      {currentPhase === 'ingredients_check' && session && (
        <IngredientsCheckStep
          session={session}
          onConfirm={handleIngredientsConfirmed}
          onBack={handleBackFromIngredients}
        />
      )}

      {/* Faza 2: Gotowanie - Timeline */}
      {currentPhase === 'cooking' && (
        <>
          {timeline && timeline.steps.length > 0 ? (
            <CookingTimeline
              timeline={timeline}
              sessionStatus={status || 'planned'}
              currentStepIndex={currentStepIndex}
              onStepComplete={handleStepComplete}
              onStartSession={startSession}
              onPauseSession={pauseSession}
              onResumeSession={resumeSession}
              onCompleteSession={completeSession}
              onCloseSession={handleCloseSession}
              onStepChange={setCurrentStepIndex}
            />
          ) : (
            <Card className='border-2 border-amber-300 bg-amber-50/50 backdrop-blur-md'>
              <CardContent className='py-8 text-center'>
                <AlertTriangle className='mx-auto mb-4 h-12 w-12 text-amber-500' />
                <h2 className='text-lg font-semibold text-amber-800'>
                  Nie można wygenerować osi czasu
                </h2>
                <p className='text-sm text-amber-600'>
                  Przepisy nie mają zdefiniowanych instrukcji gotowania
                  (recipe_instructions). Dodaj instrukcje do przepisów w panelu
                  administracyjnym.
                </p>
                {session?.meals && session.meals.length > 0 && (
                  <p className='mt-2 text-xs text-amber-500'>
                    Sesja zawiera {session.meals.length} posiłków, ale brak
                    kroków do wyświetlenia.
                  </p>
                )}
              </CardContent>
            </Card>
          )}
        </>
      )}

      {/* Loading states for mutations */}
      {(isStarting || isPausing || isResuming || isCompleting || isClosing) && (
        <div className='fixed inset-0 z-50 flex items-center justify-center bg-black/20 backdrop-blur-sm'>
          <Card className='border-2 border-white/30 bg-white/90 backdrop-blur-md'>
            <CardContent className='py-6 text-center'>
              <div className='mx-auto mb-3 h-8 w-8 animate-spin rounded-full border-4 border-gray-300 border-t-green-600' />
              <p className='text-sm text-gray-600'>
                {isStarting && 'Rozpoczynanie sesji...'}
                {isPausing && 'Wstrzymywanie sesji...'}
                {isResuming && 'Wznawianie sesji...'}
                {isCompleting && 'Kończenie sesji...'}
                {isClosing && 'Zamykanie sesji...'}
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Close session confirmation dialog */}
      <AlertDialog open={showCloseDialog} onOpenChange={setShowCloseDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Zamknąć sesję?</AlertDialogTitle>
            <AlertDialogDescription>
              Czy na pewno chcesz zamknąć tę sesję gotowania? Postęp zostanie
              utracony.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Anuluj</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmCloseSession}
              className='bg-red-600 hover:bg-red-700'
            >
              Zamknij sesję
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

/**
 * DashboardClient (client component)
 *
 * Manages selected date, data fetching and coordinates dashboard sub-components.
 * Refactored to use extracted hooks and state components for better maintainability.
 */

'use client'

import { useEffect, useRef, useMemo } from 'react'
import { CalendarStrip } from './CalendarStrip'
import { MacroProgressSection } from './MacroProgressSection'
import { MealsList } from './MealsList'
import {
  DashboardGeneratingState,
  DashboardErrorState,
  DashboardSectionLoader,
  MealsListLoader,
} from './DashboardStates'
import { useDashboardStore } from '@/lib/zustand/stores/useDashboardStore'
import { usePlannedMealsQuery } from '@/hooks/usePlannedMealsQuery'
import { useRecipeModal } from '@/hooks/useRecipeModal'
import { useAutoGenerateMealPlan } from '@/hooks/useAutoGenerateMealPlan'
import { useIsMobile } from '@/hooks/useIsMobile'
import { formatLocalDate } from '@/lib/utils/date-formatting'
import type { PlannedMealDTO } from '@/types/dto.types'
import type { Enums } from '@/types/database.types'
import { RecipeModal as RecipePreviewModal } from '@/components/meal-plan/RecipeModal'

/**
 * Mapowanie meal_plan_type na liczbę posiłków dziennie
 * (taka sama logika jak w MealPlanClient)
 */
function getMealTypesCountForPlan(
  mealPlanType: Enums<'meal_plan_type_enum'>,
  selectedMeals: Enums<'meal_type_enum'>[] | null
): number {
  switch (mealPlanType) {
    case '3_main_2_snacks':
      return 5 // breakfast, snack_morning, lunch, snack_afternoon, dinner
    case '3_main_1_snack':
      return 4 // breakfast, lunch, snack_afternoon, dinner
    case '3_main':
      return 3 // breakfast, lunch, dinner
    case '2_main':
      // Dla 2_main używamy selected_meals z profilu
      if (selectedMeals && selectedMeals.length === 2) {
        return 2
      }
      return 2 // Fallback: breakfast + dinner
    default:
      return 3
  }
}

interface MealScheduleConfig {
  eatingStartTime: string
  eatingEndTime: string
  mealPlanType: Enums<'meal_plan_type_enum'>
  selectedMeals: Enums<'meal_type_enum'>[] | null
}

interface DashboardClientProps {
  initialMeals: PlannedMealDTO[]
  targetMacros: {
    target_calories: number
    target_protein_g: number
    target_carbs_g: number
    target_fats_g: number
  }
  initialDate: string // YYYY-MM-DD
  mealScheduleConfig: MealScheduleConfig
}

export function DashboardClient({
  initialMeals,
  targetMacros,
  initialDate,
  mealScheduleConfig,
}: DashboardClientProps) {
  const { selectedDate, setSelectedDate } = useDashboardStore()
  const isMobile = useIsMobile()

  // Oblicz liczbę posiłków na dzień na podstawie typu planu
  const mealsPerDay = useMemo(
    () =>
      getMealTypesCountForPlan(
        mealScheduleConfig.mealPlanType,
        mealScheduleConfig.selectedMeals
      ),
    [mealScheduleConfig.mealPlanType, mealScheduleConfig.selectedMeals]
  )

  // Initialize the selected date once from server data
  useEffect(() => {
    const initial = new Date(initialDate)
    setSelectedDate(initial)
  }, [initialDate, setSelectedDate])

  // Normalize value coming from zustand persist (rehydrates as string)
  const normalizedSelectedDate =
    selectedDate instanceof Date
      ? selectedDate
      : selectedDate
        ? new Date(selectedDate)
        : new Date()

  const selectedDateStr = !Number.isNaN(normalizedSelectedDate.getTime())
    ? formatLocalDate(normalizedSelectedDate)
    : ''

  // Check if selected date is today
  const today = new Date()
  const isToday =
    formatLocalDate(normalizedSelectedDate) === formatLocalDate(today)

  // Track previous date to distinguish date change from refetch after meal status change
  const prevDateRef = useRef(selectedDateStr)
  const isDateChanging = prevDateRef.current !== selectedDateStr

  // Oblicz zakres dat dla 7 dni (od dzisiaj)
  const todayStr = formatLocalDate(today)
  const weekEndDate = useMemo(() => {
    const end = new Date(today)
    end.setDate(end.getDate() + 6)
    return formatLocalDate(end)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [todayStr])

  // Pobierz posiłki dla całego tygodnia (do sprawdzenia kompletności)
  const { data: weekMeals, isLoading: isLoadingWeek } = usePlannedMealsQuery(
    todayStr,
    weekEndDate
  )

  // Pobierz posiłki dla wybranego dnia (do wyświetlenia)
  const {
    data: meals,
    isLoading,
    isFetching,
    error,
    refetch,
  } = usePlannedMealsQuery(selectedDateStr, selectedDateStr)

  // Auto-generuj plan - taka sama logika jak w MealPlanClient
  const {
    mutate: generatePlan,
    isPending: isGenerating,
    error: generateError,
  } = useAutoGenerateMealPlan()

  // Track czy już próbowaliśmy wygenerować w tej sesji
  // (zapobiega nieskończonej pętli gdy generacja nie wypełni całego tygodnia)
  const hasAttemptedGeneration = useRef(false)
  const lastWeekMealsCount = useRef<number | null>(null)

  useEffect(() => {
    // 7 dni x liczba posiłków zależna od planu
    const expectedMealsCount = 7 * mealsPerDay
    const currentMealsCount = weekMeals?.length ?? 0
    const hasIncompletePlan = currentMealsCount < expectedMealsCount

    // Reset flagi jeśli liczba posiłków się zmieniła (np. użytkownik usunął posiłki)
    if (
      lastWeekMealsCount.current !== null &&
      lastWeekMealsCount.current !== currentMealsCount
    ) {
      hasAttemptedGeneration.current = false
    }
    lastWeekMealsCount.current = currentMealsCount

    const shouldGenerate =
      !isLoadingWeek &&
      !isGenerating &&
      hasIncompletePlan &&
      !hasAttemptedGeneration.current

    if (shouldGenerate) {
      hasAttemptedGeneration.current = true
      generatePlan()
    }
  }, [
    isLoadingWeek,
    isGenerating,
    weekMeals?.length,
    mealsPerDay,
    generatePlan,
  ])

  // Update previous date when data is loaded
  useEffect(() => {
    if (!isFetching) {
      prevDateRef.current = selectedDateStr
    }
  }, [isFetching, selectedDateStr])

  // Use meals if available, otherwise initialMeals
  const displayMeals = meals ?? initialMeals

  // Recipe modal management
  const {
    modalState: recipeModal,
    openModal: handleRecipePreview,
    handleOpenChange: handleRecipeModalChange,
    checkedIngredients,
    toggleIngredientChecked,
  } = useRecipeModal(meals)

  // Show full-screen spinner ONLY during active plan generation
  if (isGenerating) {
    return <DashboardGeneratingState />
  }

  // Check if generation error is ignorable ("plan already exists")
  const isGenerateErrorIgnorable =
    generateError instanceof Error &&
    generateError.message.includes('już istnieje')

  // Handle errors (ignore "plan already exists" error)
  if (error || (generateError && !isGenerateErrorIgnorable)) {
    const isGenError = !!generateError && !isGenerateErrorIgnorable
    return (
      <DashboardErrorState
        error={isGenError ? generateError : error}
        isGenerationError={isGenError}
        onRetry={isGenError ? () => generatePlan() : refetch}
      />
    )
  }

  return (
    <div className='space-y-3 sm:space-y-8'>
      <div className='grid items-start gap-3 sm:gap-8 xl:grid-cols-3'>
        {/* Column 1 - calendar (spans 2 cols on xl) */}
        <div className='xl:col-span-2'>
          <CalendarStrip
            selectedDate={normalizedSelectedDate}
            onDateChange={setSelectedDate}
          />
        </div>

        {/* Column 2 - calories / macros (spans 1 col, 2 rows on xl) */}
        <div className='w-full xl:col-span-1 xl:row-span-2'>
          {isFetching && isDateChanging ? (
            <DashboardSectionLoader />
          ) : (
            <MacroProgressSection
              key={selectedDateStr}
              meals={displayMeals}
              targetMacros={targetMacros}
              isToday={isToday}
              isMobile={isMobile}
            />
          )}
        </div>

        {/* Column 1 continued - meals list */}
        <div className='xl:col-span-2'>
          {isFetching && !isLoading && isDateChanging ? (
            <MealsListLoader />
          ) : (
            <MealsList
              meals={displayMeals}
              date={selectedDateStr}
              onRecipePreview={handleRecipePreview}
              mealScheduleConfig={mealScheduleConfig}
            />
          )}
        </div>
      </div>

      <RecipePreviewModal
        isOpen={recipeModal.isOpen}
        meal={recipeModal.meal}
        onOpenChange={handleRecipeModalChange}
        enableIngredientEditing={true}
        checkedIngredients={checkedIngredients}
        onToggleChecked={toggleIngredientChecked}
      />
    </div>
  )
}

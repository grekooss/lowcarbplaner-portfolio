'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { CheckCircle2, Circle, Loader2, Minus, Plus } from 'lucide-react'
import { ShoppingListCategoryCard } from './ShoppingListCategoryCard'
import { SendToPantryModal } from './SendToPantryModal'
import { CreateNewListModal } from './CreateNewListModal'
import { ExpiredListModal } from './ExpiredListModal'
import { DiscrepancyModal } from './DiscrepancyModal'
import { Button } from '@/components/ui/button'
import { logWarning } from '@/lib/error-logger'
import { updateShoppingListItem } from '@/lib/actions/shopping-list'
import { pantryKeys } from '@/hooks/usePantryQuery'
import type { UserInventoryItemDTO } from '@/types/dto.types'
import type {
  ShoppingListSnapshotItem,
  DiscrepancyCheckResult,
} from '@/lib/actions/shopping-list'
import type { PurchasedItemForPantry } from './SendToPantryModal'
import type { StorageLocation } from '@/types/dto.types'
import type { Enums } from '@/types/database.types'

type IngredientCategory = Enums<'ingredient_category_enum'>

/**
 * Informacja o składniku w spiżarni
 */
export interface PantryStockInfo {
  quantity: number
  unit: string
  storage_location: StorageLocation
}

/**
 * Mapa ingredient_id -> ilość w spiżarni
 */
export type PantryStockMap = Map<number, PantryStockInfo>

interface ShoppingListClientProps {
  startDate: string
  endDate: string
  items: ShoppingListSnapshotItem[]
  itemsByCategory?: Record<string, ShoppingListSnapshotItem[]>
  pantryItems: UserInventoryItemDTO[]
  isExpired?: boolean
  discrepancyData?: DiscrepancyCheckResult | null
}

/**
 * Parsuje datę i zwraca obiekt z komponentami
 */
function parseDateComponents(dateStr: string) {
  const date = new Date(dateStr)
  const dayNames = [
    'Niedziela',
    'Poniedziałek',
    'Wtorek',
    'Środa',
    'Czwartek',
    'Piątek',
    'Sobota',
  ]
  const monthNames = [
    'styczeń',
    'luty',
    'marzec',
    'kwiecień',
    'maj',
    'czerwiec',
    'lipiec',
    'sierpień',
    'wrzesień',
    'październik',
    'listopad',
    'grudzień',
  ]

  return {
    dayOfWeek: dayNames[date.getDay()],
    day: date.getDate(),
    month: monthNames[date.getMonth()],
    year: date.getFullYear(),
  }
}

/**
 * Formatuje zakres dat do czytelnej postaci polskiej (np. "10-14 stycznia")
 */
function formatDateRangePolish(startDate: string, endDate: string): string {
  const monthNames = [
    'stycznia',
    'lutego',
    'marca',
    'kwietnia',
    'maja',
    'czerwca',
    'lipca',
    'sierpnia',
    'września',
    'października',
    'listopada',
    'grudnia',
  ]

  const start = new Date(startDate)
  const end = new Date(endDate)

  const startDay = start.getDate()
  const endDay = end.getDate()
  const startMonth = start.getMonth()
  const endMonth = end.getMonth()

  if (startDate === endDate) {
    return `${startDay} ${monthNames[startMonth]}`
  }

  if (startMonth === endMonth) {
    return `${startDay}-${endDay} ${monthNames[endMonth]}`
  } else {
    return `${startDay} ${monthNames[startMonth]} - ${endDay} ${monthNames[endMonth]}`
  }
}

/**
 * ShoppingListClient - Główny wrapper po stronie klienta
 *
 * ARCHITEKTURA (Snapshot-based w shopping_list_items):
 * - Lista zakupów jest "zamrożona" w momencie tworzenia
 * - Stan produktów (kupione/usunięte) jest zapisywany w shopping_list_items
 * - Niezależna od regeneracji planu posiłków
 */
export const ShoppingListClient = ({
  startDate,
  endDate,
  items: initialItems,
  pantryItems,
  isExpired = false,
  discrepancyData = null,
}: ShoppingListClientProps) => {
  const queryClient = useQueryClient()

  // Stan produktów (lokalnie dla optymistycznych aktualizacji)
  const [items, setItems] = useState(initialItems)
  const [isHydrated, setIsHydrated] = useState(false)
  const [isPantryModalOpen, setIsPantryModalOpen] = useState(false)
  const [isCreateNewListModalOpen, setIsCreateNewListModalOpen] =
    useState(false)
  const [isExpiredModalOpen, setIsExpiredModalOpen] = useState(isExpired)
  const [isDiscrepancyModalOpen, setIsDiscrepancyModalOpen] = useState(
    discrepancyData?.hasDiscrepancies ?? false
  )
  const [openCategories, setOpenCategories] = useState<Set<string>>(new Set())

  // Buduj mapę dostępnych składników w spiżarni
  const pantryStockMap = useMemo((): PantryStockMap => {
    const map: PantryStockMap = new Map()
    for (const item of pantryItems) {
      if (item.ingredient_id && !item.is_consumed) {
        const existing = map.get(item.ingredient_id)
        if (existing) {
          if (item.quantity > existing.quantity) {
            map.set(item.ingredient_id, {
              quantity: item.quantity,
              unit: item.unit,
              storage_location: item.storage_location,
            })
          }
        } else {
          map.set(item.ingredient_id, {
            quantity: item.quantity,
            unit: item.unit,
            storage_location: item.storage_location,
          })
        }
      }
    }
    return map
  }, [pantryItems])

  // Grupowanie produktów po kategoriach (dynamicznie aktualizowane)
  const itemsByCategory = useMemo(() => {
    const grouped: Record<string, ShoppingListSnapshotItem[]> = {}
    for (const item of items) {
      const category = item.ingredient_category
      if (!grouped[category]) {
        grouped[category] = []
      }
      grouped[category].push(item)
    }
    return grouped
  }, [items])

  // Mark as hydrated
  useEffect(() => {
    setIsHydrated(true)
  }, [])

  // Auto-usuwanie produktów, które mamy w spiżarni w wystarczającej ilości
  // Uruchamia się raz po hydracji
  useEffect(() => {
    if (!isHydrated) return

    // Znajdź produkty do auto-usunięcia
    const itemsToAutoRemove = items.filter((item) => {
      // Pomiń już usunięte lub kupione
      if (item.is_removed || item.is_purchased) return false

      const pantryStock = pantryStockMap.get(item.ingredient_id)
      if (!pantryStock) return false

      // Sprawdź czy jednostki się zgadzają (np. oba w gramach)
      if (pantryStock.unit !== item.unit) return false

      // Jeśli w spiżarni mamy >= potrzebnej ilości, oznacz do usunięcia
      return pantryStock.quantity >= item.total_amount
    })

    // Automatycznie oznacz jako usunięte
    itemsToAutoRemove.forEach((item) => {
      updateItemState(item.ingredient_id, false, true)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isHydrated]) // Celowo tylko isHydrated - uruchom raz po hydracji

  // Inicjalizacja: otwórz wszystkie kategorie z niepurchased produktami
  useEffect(() => {
    if (!isHydrated) return
    const categoriesToOpen = new Set<string>()

    Object.entries(itemsByCategory).forEach(([category, categoryItems]) => {
      const hasUnpurchased = categoryItems.some(
        (item) => !item.is_purchased && !item.is_removed
      )
      if (hasUnpurchased) {
        categoriesToOpen.add(category)
      }
    })

    setOpenCategories(categoriesToOpen)
  }, [isHydrated, itemsByCategory])

  // Funkcja aktualizacji stanu produktu
  const updateItemState = useCallback(
    async (
      ingredientId: number,
      isPurchased?: boolean,
      isRemoved?: boolean
    ) => {
      // Optymistyczna aktualizacja UI
      setItems((prev) =>
        prev.map((item) => {
          if (item.ingredient_id === ingredientId) {
            return {
              ...item,
              is_purchased: isPurchased ?? item.is_purchased,
              is_removed: isRemoved ?? item.is_removed,
            }
          }
          return item
        })
      )

      // Zapisz do bazy danych (używamy istniejącej funkcji upsert)
      const result = await updateShoppingListItem({
        ingredient_id: ingredientId,
        is_purchased: isPurchased,
        is_removed: isRemoved,
      })

      if (result.error) {
        logWarning(new Error(result.error), {
          source: 'ShoppingListClient.updateItemState',
        })
        // Cofnij optymistyczną aktualizację przy błędzie
        setItems(initialItems)
      }
    },
    [initialItems]
  )

  const handleTogglePurchased = useCallback(
    (category: string, itemName: string) => {
      const item = items.find(
        (i) =>
          i.ingredient_category === category && i.ingredient_name === itemName
      )
      if (!item) return

      updateItemState(item.ingredient_id, !item.is_purchased)
    },
    [items, updateItemState]
  )

  const handleToggleRemoved = useCallback(
    (category: string, itemName: string) => {
      const item = items.find(
        (i) =>
          i.ingredient_category === category && i.ingredient_name === itemName
      )
      if (!item) return

      if (item.is_removed) {
        // Przywróć produkt
        updateItemState(item.ingredient_id, undefined, false)
      } else {
        // Usuń produkt (i odznacz jako kupiony)
        updateItemState(item.ingredient_id, false, true)
      }
    },
    [items, updateItemState]
  )

  // Calculate stats
  const stats = useMemo(() => {
    let totalItems = 0
    let purchasedCount = 0
    let removedCount = 0

    items.forEach((item) => {
      if (item.is_removed) {
        removedCount++
      } else {
        totalItems++
        if (item.is_purchased) {
          purchasedCount++
        }
      }
    })

    const toBuyCount = totalItems - purchasedCount
    return { totalItems, purchasedCount, toBuyCount, removedCount }
  }, [items])

  // Lista kupionych produktów do wysłania do spiżarni
  const purchasedItemsForPantry = useMemo((): PurchasedItemForPantry[] => {
    return items
      .filter((item) => item.is_purchased && !item.is_removed)
      .map((item) => ({
        ingredient_id: item.ingredient_id,
        name: item.ingredient_name,
        total_amount: item.total_amount,
        unit: item.unit,
        unit_conversion: item.unit_conversion
          ? {
              unit_name: item.unit_conversion.unit_name,
              grams_equivalent: item.unit_conversion.grams_equivalent,
            }
          : null,
        category: item.ingredient_category,
      }))
  }, [items])

  // Po wysłaniu do spiżarni - przenieś produkty do usuniętych i odśwież cache pantry
  const handlePantrySuccess = useCallback(() => {
    purchasedItemsForPantry.forEach((item) => {
      updateItemState(item.ingredient_id, false, true)
    })
    // Invaliduj cache pantry aby nowe produkty były widoczne od razu
    queryClient.invalidateQueries({ queryKey: pantryKeys.inventory() })
  }, [purchasedItemsForPantry, updateItemState, queryClient])

  // Konwertuj items do formatu oczekiwanego przez ShoppingListCategoryCard
  const getItemsForCategory = useCallback(
    (category: string) => {
      return (itemsByCategory[category] || []).map((item) => ({
        ingredient_id: item.ingredient_id,
        name: item.ingredient_name,
        total_amount: item.total_amount,
        unit: item.unit,
        unit_conversion: item.unit_conversion
          ? {
              unit_name: item.unit_conversion.unit_name,
              grams_equivalent: item.unit_conversion.grams_equivalent,
            }
          : null,
      }))
    },
    [itemsByCategory]
  )

  // Konwertuj stan do formatu oczekiwanego przez ShoppingListCategoryCard
  const purchasedItemsState = useMemo(() => {
    const state: Record<string, boolean> = {}
    items.forEach((item) => {
      if (item.is_purchased) {
        state[`${item.ingredient_category}__${item.ingredient_name}`] = true
      }
    })
    return state
  }, [items])

  const removedItemsState = useMemo(() => {
    const state: Record<string, boolean> = {}
    items.forEach((item) => {
      if (item.is_removed) {
        state[`${item.ingredient_category}__${item.ingredient_name}`] = true
      }
    })
    return state
  }, [items])

  // Show spinner overlay during hydration
  if (!isHydrated) {
    return (
      <div className='fixed inset-0 z-50 flex items-center justify-center bg-white/60 backdrop-blur-sm'>
        <div className='rounded-2xl border-2 border-white bg-white/80 p-6 shadow-lg backdrop-blur-xl'>
          <Loader2 className='text-primary h-10 w-10 animate-spin' />
        </div>
      </div>
    )
  }

  if (items.length === 0) {
    return (
      <div className='flex min-h-[300px] flex-col items-center justify-center rounded-[20px] border-2 border-white bg-white/60 p-8 text-center shadow-[var(--shadow-card)]'>
        <p className='text-gray-500'>
          Lista zakupów jest pusta. Prawdopodobnie nie ma żadnych zaplanowanych
          posiłków w wybranym zakresie dat.
        </p>
        <Button
          variant='outline'
          className='mt-4'
          onClick={() => setIsCreateNewListModalOpen(true)}
        >
          <Plus className='mr-1.5 h-4 w-4' />
          Utwórz nową listę
        </Button>
      </div>
    )
  }

  const categories = Object.keys(itemsByCategory) as IngredientCategory[]

  return (
    <div className='space-y-6'>
      {/* Header z datami, statystykami i przyciskami */}
      <section className='grid grid-cols-1 gap-4 lg:grid-cols-2'>
        {/* Lewa strona - daty i statystyki */}
        <div className='flex flex-col gap-3 rounded-[20px] border-2 border-white bg-white/60 px-4 py-3 shadow-[var(--shadow-card)] sm:px-6'>
          {/* Zakres dat */}
          <div className='flex flex-col items-center gap-1'>
            <div className='flex items-center gap-2'>
              {(() => {
                const start = parseDateComponents(startDate)
                const isSingleDay = startDate === endDate

                if (isSingleDay) {
                  // Jeden dzień - nie pokazuj zakresu
                  return (
                    <div className='flex items-center gap-2'>
                      <span className='text-sm font-medium text-gray-500'>
                        {start.dayOfWeek}
                      </span>
                      <div className='flex h-10 w-10 items-center justify-center rounded-sm bg-red-600'>
                        <span className='text-lg font-bold text-white'>
                          {start.day}
                        </span>
                      </div>
                      <span className='text-sm font-medium text-gray-900'>
                        {start.month}
                      </span>
                      <span className='text-xs text-gray-400'>{start.year}</span>
                    </div>
                  )
                }

                // Zakres dat - pokaż od-do
                const end = parseDateComponents(endDate)
                return (
                  <>
                    <div className='flex items-center gap-2'>
                      <span className='text-sm font-medium text-gray-500'>
                        {start.dayOfWeek}
                      </span>
                      <div className='flex h-10 w-10 items-center justify-center rounded-sm bg-red-600'>
                        <span className='text-lg font-bold text-white'>
                          {start.day}
                        </span>
                      </div>
                      <span className='text-sm font-medium text-gray-900'>
                        {start.month}
                      </span>
                    </div>

                    <span className='mx-2 text-xl font-bold text-gray-400'>–</span>

                    <div className='flex items-center gap-2'>
                      <span className='text-sm font-medium text-gray-500'>
                        {end.dayOfWeek}
                      </span>
                      <div className='flex h-10 w-10 items-center justify-center rounded-sm bg-red-600'>
                        <span className='text-lg font-bold text-white'>
                          {end.day}
                        </span>
                      </div>
                      <span className='text-sm font-medium text-gray-900'>
                        {end.month}
                      </span>
                      <span className='text-xs text-gray-400'>{end.year}</span>
                    </div>
                  </>
                )
              })()}
            </div>
            <span className='text-xs text-gray-400'>
              {startDate === endDate
                ? 'Składniki potrzebne do przygotowania posiłków z tego dnia'
                : 'Składniki potrzebne do przygotowania posiłków z tego zakresu'}
            </span>
          </div>

          <div className='bg-border h-px w-full' />

          {/* Statystyki */}
          <div className='flex items-center justify-center gap-4 sm:gap-6'>
            <div className='flex items-center gap-3'>
              <div className='flex h-8 w-8 items-center justify-center rounded-sm bg-gray-400'>
                <CheckCircle2 className='h-4 w-4 text-white' />
              </div>
              <div className='text-center'>
                <p className='text-xs font-bold tracking-wide text-gray-400 uppercase'>
                  Kupione
                </p>
                <p className='text-lg font-bold text-gray-400'>
                  {stats.purchasedCount}
                </p>
              </div>
            </div>

            <div className='bg-border h-8 w-px' />

            <div className='flex items-center gap-3'>
              <div className='flex h-8 w-8 items-center justify-center rounded-sm bg-gray-900'>
                <Circle className='h-4 w-4 text-white' />
              </div>
              <div className='text-center'>
                <p className='text-xs font-bold tracking-wide text-gray-900 uppercase'>
                  Do kupienia
                </p>
                <p className='text-lg font-bold text-gray-900'>
                  {stats.toBuyCount}
                </p>
              </div>
            </div>

            <div className='bg-border h-8 w-px' />

            <div className='flex items-center gap-3'>
              <div className='relative flex h-8 w-8 items-center justify-center rounded-sm bg-red-600'>
                <Circle className='h-4 w-4 text-white' />
                <Minus
                  className='absolute h-2.5 w-2.5 text-white'
                  strokeWidth={3}
                />
              </div>
              <div className='text-center'>
                <p className='text-xs font-bold tracking-wide text-red-600 uppercase'>
                  Usunięte
                </p>
                <p className='text-lg font-bold text-red-600'>
                  {stats.removedCount}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Prawa strona - przyciski akcji */}
        <div className='flex items-center justify-end gap-2'>
          <Button
            variant='outline'
            size='sm'
            onClick={() => setIsCreateNewListModalOpen(true)}
          >
            <Plus className='mr-1.5 h-4 w-4' />
            Nowa lista
          </Button>
          {stats.purchasedCount > 0 && (
            <Button onClick={() => setIsPantryModalOpen(true)} size='sm'>
              Dodaj do Moje produkty
            </Button>
          )}
        </div>
      </section>

      {/* Shopping List - Dwie kolumny */}
      <section className='grid grid-cols-1 gap-4 lg:grid-cols-2'>
        {/* Lewa kolumna */}
        <div className='flex flex-col gap-4'>
          {categories
            .filter((_, index) => index % 2 === 0)
            .map((category) => (
              <ShoppingListCategoryCard
                key={category}
                category={category}
                items={getItemsForCategory(category)}
                purchasedItems={purchasedItemsState}
                removedItems={removedItemsState}
                pantryStockMap={pantryStockMap}
                onTogglePurchased={handleTogglePurchased}
                onRemoveItem={handleToggleRemoved}
                isOpen={openCategories.has(category)}
                onOpenChange={(open) => {
                  setOpenCategories((prev) => {
                    const newSet = new Set(prev)
                    if (open) {
                      newSet.add(category)
                    } else {
                      newSet.delete(category)
                    }
                    return newSet
                  })
                }}
              />
            ))}
        </div>

        {/* Prawa kolumna */}
        <div className='flex flex-col gap-4'>
          {categories
            .filter((_, index) => index % 2 === 1)
            .map((category) => (
              <ShoppingListCategoryCard
                key={category}
                category={category}
                items={getItemsForCategory(category)}
                purchasedItems={purchasedItemsState}
                removedItems={removedItemsState}
                pantryStockMap={pantryStockMap}
                onTogglePurchased={handleTogglePurchased}
                onRemoveItem={handleToggleRemoved}
                isOpen={openCategories.has(category)}
                onOpenChange={(open) => {
                  setOpenCategories((prev) => {
                    const newSet = new Set(prev)
                    if (open) {
                      newSet.add(category)
                    } else {
                      newSet.delete(category)
                    }
                    return newSet
                  })
                }}
              />
            ))}
        </div>
      </section>

      {/* Modal wysyłania do spiżarni */}
      <SendToPantryModal
        isOpen={isPantryModalOpen}
        onClose={() => setIsPantryModalOpen(false)}
        purchasedItems={purchasedItemsForPantry}
        onSuccess={handlePantrySuccess}
      />

      {/* Modal tworzenia nowej listy */}
      <CreateNewListModal
        isOpen={isCreateNewListModalOpen}
        onClose={() => setIsCreateNewListModalOpen(false)}
      />

      {/* Modal wygaśnięcia listy */}
      <ExpiredListModal
        isOpen={isExpiredModalOpen}
        onClose={() => setIsExpiredModalOpen(false)}
        expiredDateRangeText={formatDateRangePolish(startDate, endDate)}
      />

      {/* Modal rozbieżności (lista nieaktualna) */}
      {discrepancyData && (
        <DiscrepancyModal
          isOpen={isDiscrepancyModalOpen}
          onClose={() => setIsDiscrepancyModalOpen(false)}
          startDate={startDate}
          endDate={endDate}
        />
      )}
    </div>
  )
}

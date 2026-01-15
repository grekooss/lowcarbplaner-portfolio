import {
  getShoppingListSnapshot,
  createShoppingListFromMeals,
  getShoppingListDateRange,
  checkShoppingListDiscrepancies,
} from '@/lib/actions/shopping-list'
import { getInventoryAction } from '@/lib/actions/pantry'
import { ShoppingListClient } from '@/components/shopping-list/ShoppingListClient'
import { createServerClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

// Force dynamic rendering because of Supabase auth (cookies)
export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'Lista Zakupów - LowCarbPlaner',
  description: 'Twoja zagregowana lista zakupów na nadchodzący tydzień',
}

interface ShoppingListPageProps {
  searchParams: Promise<{
    create?: string
    start?: string
    end?: string
  }>
}

/**
 * Waliduje format daty YYYY-MM-DD
 */
function isValidDateFormat(dateStr: string): boolean {
  const regex = /^\d{4}-\d{2}-\d{2}$/
  if (!regex.test(dateStr)) return false
  const date = new Date(dateStr)
  return !isNaN(date.getTime())
}

/**
 * ShoppingListPage - Główna strona widoku Listy Zakupów
 *
 * ARCHITEKTURA (Snapshot-based w shopping_list_items):
 * - Lista zakupów jest tworzona automatycznie przy generowaniu planu posiłków
 * - Lista jest "zamrożona" w momencie tworzenia (niezależna od regeneracji planu)
 * - Jedna aktywna lista na użytkownika (bez historii)
 * - Przy tworzeniu nowej listy stara jest usuwana
 * - Rozbieżności (zmiany w planie) powodują wyświetlenie modala z informacją
 *
 * Server Component odpowiedzialny za:
 * - Sprawdzenie autentykacji
 * - Obsługę żądania tworzenia nowej listy (URL params)
 * - Wykrywanie rozbieżności między snapshotem a aktualnym planem
 * - Przekazanie danych do ShoppingListClient
 */
export default async function ShoppingListPage({
  searchParams,
}: ShoppingListPageProps) {
  const supabase = await createServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Pobierz parametry z URL
  const params = await searchParams
  const { create, start, end } = params

  // Obsłuż żądanie utworzenia nowej listy (z modali CreateNewList / Expired / Discrepancy)
  if (
    create === 'true' &&
    start &&
    end &&
    isValidDateFormat(start) &&
    isValidDateFormat(end)
  ) {
    // Utwórz nową listę zakupów ze snapshotem
    await createShoppingListFromMeals(start, end)

    // Przekieruj bez parametrów create
    redirect('/shopping-list')
  }

  // Sprawdź czy mamy zakres dat w profilu (lista została utworzona)
  const dateRangeResult = await getShoppingListDateRange()
  const existingDateRange = dateRangeResult.data
  const hasExistingList =
    !dateRangeResult.error &&
    existingDateRange?.start_date &&
    existingDateRange?.end_date

  // Pobierz spiżarnię (do oznaczania produktów które już mamy)
  const inventoryResult = await getInventoryAction()
  const pantryItems = 'data' in inventoryResult ? inventoryResult.data : []

  // Jeśli nie ma listy zakupów (użytkownik nie wygenerował jeszcze planu)
  // zwróć pustą listę - ShoppingListClient wyświetli odpowiedni EmptyState
  if (!hasExistingList) {
    const today = new Date()
    const todayStr = today.toISOString().slice(0, 10)
    const nextWeek = new Date(today)
    nextWeek.setDate(nextWeek.getDate() + 6)
    const nextWeekStr = nextWeek.toISOString().slice(0, 10)

    return (
      <main className='w-full space-y-6'>
        <ShoppingListClient
          startDate={todayStr}
          endDate={nextWeekStr}
          items={[]}
          itemsByCategory={{}}
          pantryItems={pantryItems}
          isExpired={false}
          discrepancyData={null}
        />
      </main>
    )
  }

  // Pobierz listę zakupów (snapshot)
  const listResult = await getShoppingListSnapshot()

  // Jeśli błąd lub brak danych w snapshocie, użyj zakresu z profilu
  const listData = listResult.data ?? {
    startDate: existingDateRange!.start_date!,
    endDate: existingDateRange!.end_date!,
    items: [],
    itemsByCategory: {},
  }

  // Sprawdź czy lista jest wygasła (end_date < dzisiaj)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const listEndDate = new Date(listData.endDate)
  const isExpired = listEndDate < today

  // Sprawdź rozbieżności między snapshotem a aktualnym planem
  // Pokazuj modal gdy:
  // - Lista nie jest wygasła (dni się zgadzają)
  // - Ale składniki się zmieniły (przepisy zmienione lub gramatury zmienione)
  let discrepancyData = null
  if (listData.items.length > 0 && !isExpired) {
    const discrepancyResult = await checkShoppingListDiscrepancies()
    if (!discrepancyResult.error && discrepancyResult.data?.hasDiscrepancies) {
      discrepancyData = discrepancyResult.data
    }
  }

  return (
    <main className='w-full space-y-6'>
      <ShoppingListClient
        startDate={listData.startDate}
        endDate={listData.endDate}
        items={listData.items}
        itemsByCategory={listData.itemsByCategory}
        pantryItems={pantryItems}
        isExpired={isExpired}
        discrepancyData={discrepancyData}
      />
    </main>
  )
}

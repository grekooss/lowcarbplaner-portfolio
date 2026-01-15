/**
 * Server Actions for Shopping List API
 *
 * Implementuje logikę biznesową dla operacji na liście zakupów:
 * - GET /shopping-list (generowanie zagregowanej listy zakupów)
 * - GET /shopping-list/state (pobieranie stanu listy z DB)
 * - POST /shopping-list/item (aktualizacja stanu produktu)
 * - POST /shopping-list/bulk (masowa aktualizacja stanów)
 * - DELETE /shopping-list/state (czyszczenie stanu)
 *
 * @see .ai/10c01 api-shopping-list-implementation-plan.md
 */

'use server'

import { createServerClient } from '@/lib/supabase/server'
import { logErrorLevel } from '@/lib/error-logger'
import { generateShoppingList } from '@/services/shopping-list'
import {
  shoppingListQuerySchema,
  type ShoppingListQueryInput,
} from '@/lib/validation/shopping-list'
import type { ShoppingListResponseDTO } from '@/types/dto.types'
import type { Database } from '@/types/database.types'

/**
 * Typ stanu pojedynczego produktu na liście zakupów
 */
export type ShoppingListItemState = {
  ingredient_id: number
  is_purchased: boolean
  is_removed: boolean
  purchased_at: string | null
  removed_at: string | null
}

/**
 * Typ do aktualizacji stanu produktu
 */
export type ShoppingListItemUpdate = {
  ingredient_id: number
  is_purchased?: boolean
  is_removed?: boolean
}

/**
 * Standardowy typ wyniku Server Action (Discriminated Union)
 */
type ActionResult<T> =
  | { data: T; error?: never }
  | { data?: never; error: string; code?: string }

/**
 * GET /shopping-list - Generuje zagregowaną listę zakupów w zakresie dat
 *
 * Lista bazuje na oryginalnych przepisach (bez ingredient_overrides).
 * Składniki są sumowane i grupowane według kategorii.
 *
 * Wymagania:
 * - Użytkownik musi być zalogowany (Supabase Auth)
 * - start_date i end_date w formacie YYYY-MM-DD
 * - start_date <= end_date
 * - Zakres dat <= 30 dni
 *
 * @param params - Parametry zapytania (start_date, end_date)
 * @returns Lista kategorii ze składnikami i zsumowanymi ilościami
 *
 * @example
 * ```typescript
 * const result = await getShoppingList({
 *   start_date: '2025-01-15',
 *   end_date: '2025-01-21'
 * })
 *
 * if (result.error) {
 *   console.error(result.error)
 * } else {
 *   console.log(result.data) // [{ category: 'meat', items: [...] }]
 * }
 * ```
 */
export async function getShoppingList(
  params: ShoppingListQueryInput
): Promise<ActionResult<ShoppingListResponseDTO>> {
  try {
    // 1. Walidacja parametrów wejściowych
    const validated = shoppingListQuerySchema.safeParse(params)
    if (!validated.success) {
      return {
        error: `Nieprawidłowe parametry zapytania: ${validated.error.issues
          .map((e) => `${e.path.join('.')}: ${e.message}`)
          .join(', ')}`,
        code: 'VALIDATION_ERROR',
      }
    }

    const { start_date, end_date } = validated.data

    // 2. Autoryzacja - sprawdzenie czy użytkownik jest zalogowany
    const supabase = await createServerClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return {
        error: 'Brak autoryzacji. Wymagane logowanie.',
        code: 'UNAUTHORIZED',
      }
    }

    const userId = user.id

    // 3. Generowanie listy zakupów przez service layer
    const shoppingList = await generateShoppingList(
      userId,
      start_date,
      end_date
    )

    // 4. Zwrócenie wyniku
    return {
      data: shoppingList,
    }
  } catch (err) {
    logErrorLevel(err, { source: 'shopping-list.getShoppingList' })
    return {
      error: 'Błąd serwera podczas generowania listy zakupów',
      code: 'INTERNAL_SERVER_ERROR',
    }
  }
}

/**
 * Pobiera stan listy zakupów z bazy danych (globalny per składnik).
 *
 * @returns Tablica stanów produktów
 */
export async function getShoppingListState(): Promise<
  ActionResult<ShoppingListItemState[]>
> {
  try {
    // 1. Autoryzacja
    const supabase = await createServerClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return {
        error: 'Brak autoryzacji. Wymagane logowanie.',
        code: 'UNAUTHORIZED',
      }
    }

    // 2. Wywołanie funkcji SQL
    const { data, error } = await supabase.rpc('get_shopping_list_state', {
      p_user_id: user.id,
    })

    if (error) {
      logErrorLevel(error, { source: 'shopping-list.getShoppingListState' })
      return {
        error: 'Błąd pobierania stanu listy zakupów',
        code: 'DATABASE_ERROR',
      }
    }

    return { data: data || [] }
  } catch (err) {
    logErrorLevel(err, { source: 'shopping-list.getShoppingListState' })
    return {
      error: 'Błąd serwera podczas pobierania stanu listy',
      code: 'INTERNAL_SERVER_ERROR',
    }
  }
}

/**
 * Aktualizuje stan pojedynczego produktu na liście zakupów.
 *
 * @param item - Dane produktu do aktualizacji
 * @returns Zaktualizowany rekord
 */
export async function updateShoppingListItem(
  item: ShoppingListItemUpdate
): Promise<
  ActionResult<Database['public']['Tables']['shopping_list_items']['Row']>
> {
  try {
    // 1. Walidacja
    if (!item.ingredient_id || typeof item.ingredient_id !== 'number') {
      return {
        error: 'Nieprawidłowy ingredient_id',
        code: 'VALIDATION_ERROR',
      }
    }

    // 2. Autoryzacja
    const supabase = await createServerClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return {
        error: 'Brak autoryzacji. Wymagane logowanie.',
        code: 'UNAUTHORIZED',
      }
    }

    // 3. Wywołanie funkcji SQL upsert
    const { data, error } = await supabase.rpc('upsert_shopping_list_item', {
      p_user_id: user.id,
      p_ingredient_id: item.ingredient_id,
      p_is_purchased: item.is_purchased ?? null,
      p_is_removed: item.is_removed ?? null,
    })

    if (error) {
      logErrorLevel(error, { source: 'shopping-list.updateShoppingListItem' })
      return {
        error: 'Błąd aktualizacji stanu produktu',
        code: 'DATABASE_ERROR',
      }
    }

    return { data }
  } catch (err) {
    logErrorLevel(err, { source: 'shopping-list.updateShoppingListItem' })
    return {
      error: 'Błąd serwera podczas aktualizacji produktu',
      code: 'INTERNAL_SERVER_ERROR',
    }
  }
}

/**
 * Czyści cały stan listy zakupów użytkownika.
 *
 * @returns Liczba usuniętych rekordów
 */
export async function clearShoppingListState(): Promise<ActionResult<number>> {
  try {
    // 1. Autoryzacja
    const supabase = await createServerClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return {
        error: 'Brak autoryzacji. Wymagane logowanie.',
        code: 'UNAUTHORIZED',
      }
    }

    // 2. Wywołanie funkcji SQL clear
    const { data, error } = await supabase.rpc('clear_shopping_list_state', {
      p_user_id: user.id,
    })

    if (error) {
      logErrorLevel(error, { source: 'shopping-list.clearShoppingListState' })
      return {
        error: 'Błąd czyszczenia stanu listy zakupów',
        code: 'DATABASE_ERROR',
      }
    }

    return { data: data || 0 }
  } catch (err) {
    logErrorLevel(err, { source: 'shopping-list.clearShoppingListState' })
    return {
      error: 'Błąd serwera podczas czyszczenia stanu',
      code: 'INTERNAL_SERVER_ERROR',
    }
  }
}

/**
 * Typ zakresu dat listy zakupów
 */
export type ShoppingListDateRange = {
  start_date: string | null
  end_date: string | null
}

/**
 * Pobiera zakres dat listy zakupów z profilu użytkownika.
 * Umożliwia synchronizację zakresu między urządzeniami.
 *
 * @returns Zakres dat (null jeśli nie ustawiony - użyj domyślnego)
 */
export async function getShoppingListDateRange(): Promise<
  ActionResult<ShoppingListDateRange>
> {
  try {
    // 1. Autoryzacja
    const supabase = await createServerClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return {
        error: 'Brak autoryzacji. Wymagane logowanie.',
        code: 'UNAUTHORIZED',
      }
    }

    // 2. Wywołanie funkcji SQL
    const { data, error } = await supabase.rpc('get_shopping_list_date_range', {
      p_user_id: user.id,
    })

    if (error) {
      logErrorLevel(error, { source: 'shopping-list.getShoppingListDateRange' })
      return {
        error: 'Błąd pobierania zakresu dat',
        code: 'DATABASE_ERROR',
      }
    }

    // Funkcja zwraca tablicę z jednym elementem
    const dateRange = data?.[0] || { start_date: null, end_date: null }

    return { data: dateRange }
  } catch (err) {
    logErrorLevel(err, { source: 'shopping-list.getShoppingListDateRange' })
    return {
      error: 'Błąd serwera podczas pobierania zakresu dat',
      code: 'INTERNAL_SERVER_ERROR',
    }
  }
}

/**
 * Aktualizuje zakres dat listy zakupów w profilu użytkownika.
 * Umożliwia synchronizację zakresu między urządzeniami.
 *
 * @param startDate - Data początkowa (YYYY-MM-DD)
 * @param endDate - Data końcowa (YYYY-MM-DD)
 * @returns Zaktualizowany profil
 */
export async function updateShoppingListDateRange(
  startDate: string,
  endDate: string
): Promise<ActionResult<{ success: boolean }>> {
  try {
    // 1. Walidacja
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/
    if (!dateRegex.test(startDate) || !dateRegex.test(endDate)) {
      return {
        error: 'Nieprawidłowy format daty. Wymagany format: YYYY-MM-DD',
        code: 'VALIDATION_ERROR',
      }
    }

    // 2. Autoryzacja
    const supabase = await createServerClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return {
        error: 'Brak autoryzacji. Wymagane logowanie.',
        code: 'UNAUTHORIZED',
      }
    }

    // 3. Wywołanie funkcji SQL
    const { error } = await supabase.rpc('update_shopping_list_date_range', {
      p_user_id: user.id,
      p_start_date: startDate,
      p_end_date: endDate,
    })

    if (error) {
      logErrorLevel(error, {
        source: 'shopping-list.updateShoppingListDateRange',
      })
      return {
        error: 'Błąd aktualizacji zakresu dat',
        code: 'DATABASE_ERROR',
      }
    }

    return { data: { success: true } }
  } catch (err) {
    logErrorLevel(err, { source: 'shopping-list.updateShoppingListDateRange' })
    return {
      error: 'Błąd serwera podczas aktualizacji zakresu dat',
      code: 'INTERNAL_SERVER_ERROR',
    }
  }
}

// ============================================================
// SNAPSHOT-BASED SHOPPING LIST (Simple Architecture)
// ============================================================

/**
 * Typ konwersji jednostek (np. sztuki -> gramy)
 */
export type ShoppingListUnitConversion = {
  unit_name: string
  grams_equivalent: number
} | null

/**
 * Typ produktu na liście zakupów (snapshot w shopping_list_items)
 */
export type ShoppingListSnapshotItem = {
  ingredient_id: number
  ingredient_name: string
  ingredient_category: Database['public']['Enums']['ingredient_category_enum']
  total_amount: number
  unit: string
  unit_conversion: ShoppingListUnitConversion
  is_purchased: boolean
  is_removed: boolean
}

/**
 * Typ listy zakupów z produktami
 */
export type ShoppingListWithItems = {
  startDate: string
  endDate: string
  items: ShoppingListSnapshotItem[]
  itemsByCategory: Record<string, ShoppingListSnapshotItem[]>
}

/**
 * Tworzy nową listę zakupów z snapshotem składników.
 * Usuwa poprzednią listę i tworzy snapshot z planned_meals.
 *
 * @param startDate - Data początkowa (YYYY-MM-DD)
 * @param endDate - Data końcowa (YYYY-MM-DD)
 * @returns Liczba utworzonych elementów
 */
export async function createShoppingListFromMeals(
  startDate: string,
  endDate: string
): Promise<ActionResult<{ itemsCount: number }>> {
  try {
    // 1. Walidacja
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/
    if (!dateRegex.test(startDate) || !dateRegex.test(endDate)) {
      return {
        error: 'Nieprawidłowy format daty. Wymagany format: YYYY-MM-DD',
        code: 'VALIDATION_ERROR',
      }
    }

    if (startDate > endDate) {
      return {
        error: 'Data początkowa musi być <= daty końcowej',
        code: 'VALIDATION_ERROR',
      }
    }

    // 2. Autoryzacja
    const supabase = await createServerClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return {
        error: 'Brak autoryzacji. Wymagane logowanie.',
        code: 'UNAUTHORIZED',
      }
    }

    // 3. Wywołanie funkcji SQL
    const { data, error } = await supabase.rpc(
      'create_shopping_list_from_meals',
      {
        p_user_id: user.id,
        p_start_date: startDate,
        p_end_date: endDate,
      }
    )

    if (error) {
      logErrorLevel(error, {
        source: 'shopping-list.createShoppingListFromMeals',
      })
      return {
        error: 'Błąd tworzenia listy zakupów',
        code: 'DATABASE_ERROR',
      }
    }

    return { data: { itemsCount: data } }
  } catch (err) {
    logErrorLevel(err, { source: 'shopping-list.createShoppingListFromMeals' })
    return {
      error: 'Błąd serwera podczas tworzenia listy zakupów',
      code: 'INTERNAL_SERVER_ERROR',
    }
  }
}

/**
 * Pobiera listę zakupów z snapshotem produktów.
 *
 * @returns Lista zakupów z produktami pogrupowanymi po kategoriach
 */
export async function getShoppingListSnapshot(): Promise<
  ActionResult<ShoppingListWithItems | null>
> {
  try {
    // 1. Autoryzacja
    const supabase = await createServerClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return {
        error: 'Brak autoryzacji. Wymagane logowanie.',
        code: 'UNAUTHORIZED',
      }
    }

    // 2. Pobierz zakres dat z profilu
    const dateRangeResult = await getShoppingListDateRange()
    if (dateRangeResult.error) {
      return { error: dateRangeResult.error, code: 'DATABASE_ERROR' }
    }

    const dateRange = dateRangeResult.data
    if (!dateRange || !dateRange.start_date || !dateRange.end_date) {
      return { data: null }
    }
    const { start_date, end_date } = dateRange

    // 3. Pobierz snapshot produktów
    const { data, error } = await supabase.rpc('get_shopping_list_snapshot', {
      p_user_id: user.id,
    })

    if (error) {
      logErrorLevel(error, { source: 'shopping-list.getShoppingListSnapshot' })
      return {
        error: 'Błąd pobierania listy zakupów',
        code: 'DATABASE_ERROR',
      }
    }

    // 4. Brak danych = pusta lista
    if (!data || data.length === 0) {
      return {
        data: {
          startDate: start_date,
          endDate: end_date,
          items: [],
          itemsByCategory: {},
        },
      }
    }

    // 5. Mapowanie i grupowanie
    // Typ rozszerzony o unit_conversion_json (po zastosowaniu migracji)
    type RowWithConversion = (typeof data)[0] & {
      unit_conversion_json?: {
        unit_name?: string
        grams_equivalent?: number
      } | null
    }

    const items: ShoppingListSnapshotItem[] = data.map((row) => {
      const rowExt = row as RowWithConversion

      // Parsuj unit_conversion_json z bazy danych
      let unit_conversion: ShoppingListUnitConversion = null
      if (rowExt.unit_conversion_json) {
        const json = rowExt.unit_conversion_json
        if (json.unit_name && json.grams_equivalent) {
          unit_conversion = {
            unit_name: json.unit_name,
            grams_equivalent: json.grams_equivalent,
          }
        }
      }

      return {
        ingredient_id: row.ingredient_id,
        ingredient_name: row.ingredient_name,
        ingredient_category: row.ingredient_category,
        total_amount: row.total_amount,
        unit: row.unit,
        unit_conversion,
        is_purchased: row.is_purchased,
        is_removed: row.is_removed,
      }
    })

    const itemsByCategory: Record<string, ShoppingListSnapshotItem[]> = {}
    for (const item of items) {
      const category = item.ingredient_category
      if (!itemsByCategory[category]) {
        itemsByCategory[category] = []
      }
      itemsByCategory[category].push(item)
    }

    return {
      data: {
        startDate: start_date,
        endDate: end_date,
        items,
        itemsByCategory,
      },
    }
  } catch (err) {
    logErrorLevel(err, { source: 'shopping-list.getShoppingListSnapshot' })
    return {
      error: 'Błąd serwera podczas pobierania listy zakupów',
      code: 'INTERNAL_SERVER_ERROR',
    }
  }
}

// ============================================================
// DISCREPANCY CHECK (Snapshot vs Current Plan)
// ============================================================

/**
 * Typ rozbieżności między snapshotem a aktualnym planem
 */
export type ShoppingListDiscrepancy = {
  discrepancy_type: 'added' | 'removed' | 'amount_changed'
  ingredient_id: number
  ingredient_name: string
  snapshot_amount: number | null // null = nowy składnik
  current_amount: number | null // null = usunięty składnik
  unit: string
}

/**
 * Wynik sprawdzenia rozbieżności
 */
export type DiscrepancyCheckResult = {
  hasDiscrepancies: boolean
  discrepancies: ShoppingListDiscrepancy[]
  summary: {
    added: number
    removed: number
    changed: number
  }
}

/**
 * Sprawdza rozbieżności między snapshotem listy zakupów
 * a aktualnym planem posiłków.
 *
 * @returns Lista rozbieżności z podsumowaniem
 */
export async function checkShoppingListDiscrepancies(): Promise<
  ActionResult<DiscrepancyCheckResult>
> {
  try {
    // 1. Autoryzacja
    const supabase = await createServerClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return {
        error: 'Brak autoryzacji. Wymagane logowanie.',
        code: 'UNAUTHORIZED',
      }
    }

    // 2. Wywołaj funkcję SQL
    const { data, error } = await supabase.rpc(
      'check_shopping_list_discrepancies',
      {
        p_user_id: user.id,
      }
    )

    if (error) {
      // DEBUG: szczegółowy log błędu
      console.error('[checkShoppingListDiscrepancies] Supabase RPC error:', {
        message: error.message,
        code: error.code,
        details: error.details,
        hint: error.hint,
      })
      logErrorLevel(error, {
        source: 'shopping-list.checkShoppingListDiscrepancies',
      })
      return {
        error: 'Błąd sprawdzania rozbieżności',
        code: 'DATABASE_ERROR',
      }
    }

    // 3. Mapuj wyniki
    const discrepancies: ShoppingListDiscrepancy[] = (data || []).map(
      (row) => ({
        discrepancy_type: row.discrepancy_type as
          | 'added'
          | 'removed'
          | 'amount_changed',
        ingredient_id: row.ingredient_id,
        ingredient_name: row.ingredient_name,
        snapshot_amount: row.snapshot_amount,
        current_amount: row.current_amount,
        unit: row.unit,
      })
    )

    // 4. Policz podsumowanie
    const summary = {
      added: discrepancies.filter((d) => d.discrepancy_type === 'added').length,
      removed: discrepancies.filter((d) => d.discrepancy_type === 'removed')
        .length,
      changed: discrepancies.filter(
        (d) => d.discrepancy_type === 'amount_changed'
      ).length,
    }

    return {
      data: {
        hasDiscrepancies: discrepancies.length > 0,
        discrepancies,
        summary,
      },
    }
  } catch (err) {
    logErrorLevel(err, {
      source: 'shopping-list.checkShoppingListDiscrepancies',
    })
    return {
      error: 'Błąd serwera podczas sprawdzania rozbieżności',
      code: 'INTERNAL_SERVER_ERROR',
    }
  }
}

/**
 * Szybkie sprawdzenie czy są jakiekolwiek rozbieżności.
 * Używaj tej funkcji gdy potrzebujesz tylko boolean.
 *
 * @returns true jeśli są rozbieżności
 */
export async function hasShoppingListDiscrepancies(): Promise<
  ActionResult<boolean>
> {
  try {
    // 1. Autoryzacja
    const supabase = await createServerClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return {
        error: 'Brak autoryzacji. Wymagane logowanie.',
        code: 'UNAUTHORIZED',
      }
    }

    // 2. Wywołaj funkcję SQL
    const { data, error } = await supabase.rpc(
      'has_shopping_list_discrepancies',
      {
        p_user_id: user.id,
      }
    )

    if (error) {
      logErrorLevel(error, {
        source: 'shopping-list.hasShoppingListDiscrepancies',
      })
      return {
        error: 'Błąd sprawdzania rozbieżności',
        code: 'DATABASE_ERROR',
      }
    }

    return { data: data ?? false }
  } catch (err) {
    logErrorLevel(err, {
      source: 'shopping-list.hasShoppingListDiscrepancies',
    })
    return {
      error: 'Błąd serwera podczas sprawdzania rozbieżności',
      code: 'INTERNAL_SERVER_ERROR',
    }
  }
}

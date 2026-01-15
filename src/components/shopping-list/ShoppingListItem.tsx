'use client'

import {
  Check,
  Trash2,
  Refrigerator,
  Snowflake,
  Archive,
  Square,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import type {
  ShoppingListUnitConversionDTO,
  StorageLocation,
} from '@/types/dto.types'
import type { PantryStockInfo } from './ShoppingListClient'

/**
 * Konfiguracja lokalizacji przechowywania
 */
const STORAGE_CONFIG: Record<
  StorageLocation,
  { label: string; icon: React.ElementType }
> = {
  fridge: { label: 'w lodówce', icon: Refrigerator },
  freezer: { label: 'w zamrażarce', icon: Snowflake },
  pantry: { label: 'w spiżarni', icon: Archive },
  counter: { label: 'na blacie', icon: Square },
}

interface ShoppingListItemProps {
  item: {
    ingredient_id: number
    name: string
    total_amount: number
    unit: string
    unit_conversion: ShoppingListUnitConversionDTO | null
    isPurchased: boolean
    isRemoved: boolean
  }
  isPurchased: boolean
  isRemoved: boolean
  /** Informacja o dostępności w spiżarni (jeśli jest) */
  pantryStock?: PantryStockInfo
  onToggle: () => void
  onRemove: () => void
}

/**
 * ShoppingListItem - Pojedynczy produkt na liście zakupów
 *
 * Wyświetla checkbox, nazwę składnika, ilość i jednostkę.
 * Produkt zaznaczony (zakupiony) jest wizualnie przekreślony.
 * Produkt usunięty jest przekreślony i przycisk kosza jest podświetlony.
 */
export const ShoppingListItem = ({
  item,
  isPurchased,
  isRemoved,
  pantryStock,
  onToggle,
  onRemove,
}: ShoppingListItemProps) => {
  // Format amount: remove unnecessary decimals (.00)
  const formatAmount = (amount: number): string => {
    const rounded = Math.round(amount * 100) / 100
    return rounded % 1 === 0 ? rounded.toFixed(0) : rounded.toFixed(2)
  }

  const handleClick = () => {
    // Nie pozwalaj na toggle checkbox gdy usunięte
    if (isRemoved) return
    onToggle()
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      if (isRemoved) return
      onToggle()
    }
  }

  return (
    <li
      className={cn(
        'group flex items-center gap-3 rounded-lg border border-white bg-white/70 px-3 py-3 shadow-sm transition-all duration-200',
        isRemoved
          ? 'bg-gray-100/50 opacity-60'
          : isPurchased
            ? 'cursor-pointer opacity-60 hover:border-gray-200 hover:opacity-80'
            : 'cursor-pointer hover:border-gray-200'
      )}
      onClick={handleClick}
      role='button'
      tabIndex={isRemoved ? -1 : 0}
      aria-pressed={isPurchased}
      aria-disabled={isRemoved}
      onKeyDown={handleKeyDown}
    >
      {/* Custom Checkbox */}
      <div
        className={cn(
          'flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-md border-2 shadow-md transition-all duration-200',
          isRemoved
            ? 'cursor-not-allowed border-gray-200 bg-gray-100 opacity-50'
            : isPurchased
              ? 'border-red-500 bg-red-500'
              : 'border-white bg-white hover:border-red-600'
        )}
      >
        {isPurchased && !isRemoved && (
          <Check className='h-4 w-4 text-white' strokeWidth={3} />
        )}
      </div>

      {/* Item Name + Pantry Badge */}
      <div className='min-w-0 flex-1'>
        <p
          className={cn(
            'truncate text-sm font-medium text-gray-800 transition-all duration-200',
            isPurchased && 'text-gray-400',
            isRemoved && 'text-gray-400 line-through'
          )}
        >
          {item.name}
        </p>
        {pantryStock &&
          (() => {
            const storageConfig = STORAGE_CONFIG[pantryStock.storage_location]
            const StorageIcon = storageConfig.icon
            const uc = item.unit_conversion
            const hasConversion =
              uc && pantryStock.unit === 'g' && uc.grams_equivalent > 0

            return (
              <div className='text-primary mt-0.5 flex items-center gap-1 text-xs'>
                <StorageIcon className='h-3 w-3' strokeWidth={3} />
                <span>
                  Masz {storageConfig.label}:{' '}
                  {hasConversion ? (
                    <>
                      <strong>
                        {(
                          Math.round(
                            (pantryStock.quantity / uc.grams_equivalent) * 10
                          ) / 10
                        )
                          .toFixed(1)
                          .replace('.0', '')}
                        x
                      </strong>{' '}
                      {uc.unit_name}{' '}
                      <strong>
                        ({formatAmount(pantryStock.quantity)}
                        {pantryStock.unit})
                      </strong>
                    </>
                  ) : (
                    <>
                      <strong>{formatAmount(pantryStock.quantity)}</strong>{' '}
                      {pantryStock.unit}
                    </>
                  )}
                </span>
              </div>
            )
          })()}
      </div>

      {/* Amount */}
      <div
        className={cn(
          'flex items-baseline gap-1 whitespace-nowrap transition-all duration-200',
          (isPurchased || isRemoved) && 'opacity-50'
        )}
      >
        {item.unit_conversion &&
        item.unit === 'g' &&
        item.unit_conversion.grams_equivalent > 0 ? (
          // Wyświetl obie wartości: sztuki + gramy w nawiasie
          <>
            <span className='text-text-main text-lg font-bold'>
              {(
                Math.round(
                  (item.total_amount / item.unit_conversion.grams_equivalent) *
                    10
                ) / 10
              )
                .toFixed(1)
                .replace('.0', '')}
              x
            </span>
            <span className='text-text-muted text-sm'>
              {item.unit_conversion.unit_name}
            </span>
            <span className='text-text-main text-sm font-bold'>
              ({formatAmount(item.total_amount)}
              {item.unit})
            </span>
          </>
        ) : (
          // Standardowe wyświetlanie
          <>
            <span className='text-text-main text-lg font-bold'>
              {formatAmount(item.total_amount)}
            </span>
            <span className='text-text-muted text-sm'>{item.unit}</span>
          </>
        )}
      </div>

      {/* Trash button */}
      <button
        type='button'
        onClick={(e) => {
          e.stopPropagation()
          onRemove()
        }}
        className={cn(
          'ml-1 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-md border-2 shadow-md transition-all duration-200',
          isRemoved
            ? 'border-red-500 bg-red-500 hover:bg-red-600'
            : 'border-white bg-white hover:border-red-400 hover:bg-red-50'
        )}
        title={isRemoved ? 'Przywróć produkt' : 'Usuń z listy'}
      >
        <Trash2
          className={cn(
            'h-3.5 w-3.5',
            isRemoved ? 'text-white' : 'text-gray-400'
          )}
        />
      </button>
    </li>
  )
}

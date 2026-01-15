/**
 * Walidacja dla Pantry (Spiżarnia) API
 *
 * Ten plik zawiera schematy Zod dla walidacji formularzy spiżarni.
 */

import { z } from 'zod'

/**
 * Schema dla lokalizacji przechowywania
 */
export const storageLocationSchema = z.enum([
  'fridge',
  'freezer',
  'pantry',
  'counter',
] as const)

/**
 * Schema dla typu przedmiotu w spiżarni
 */
export const inventoryItemTypeSchema = z.enum([
  'ingredient',
  'component',
  'meal',
] as const)

/**
 * Schema dla dodawania składnika do spiżarni
 */
export const addInventoryItemSchema = z.object({
  item_type: inventoryItemTypeSchema.default('ingredient'),
  ingredient_id: z.number().int().positive('Wybierz składnik').optional(),
  recipe_id: z.number().int().positive('Wybierz przepis').optional(),
  quantity: z
    .number()
    .positive('Ilość musi być większa od 0')
    .max(10000, 'Ilość nie może przekraczać 10000'),
  unit: z
    .string()
    .min(1, 'Jednostka jest wymagana')
    .max(20, 'Jednostka może mieć max 20 znaków'),
  storage_location: storageLocationSchema,
})

/**
 * Schema z walidacją zależności między typem a ID
 */
export const addInventoryItemWithDependenciesSchema = addInventoryItemSchema
  .refine(
    (data) => {
      if (data.item_type === 'ingredient') {
        return data.ingredient_id !== undefined && data.ingredient_id > 0
      }
      return true
    },
    {
      message: 'Dla typu "składnik" musisz wybrać składnik',
      path: ['ingredient_id'],
    }
  )
  .refine(
    (data) => {
      if (data.item_type === 'component' || data.item_type === 'meal') {
        return data.recipe_id !== undefined && data.recipe_id > 0
      }
      return true
    },
    {
      message: 'Dla tego typu musisz wybrać przepis',
      path: ['recipe_id'],
    }
  )

/**
 * Typ dla walidowanych danych formularza
 */
export type AddInventoryItemInput = z.infer<typeof addInventoryItemSchema>

/**
 * Typ dla walidowanych danych z zależnościami
 */
export type AddInventoryItemWithDependencies = z.infer<
  typeof addInventoryItemWithDependenciesSchema
>

/**
 * Schema dla filtrowania spiżarni
 */
export const pantryFilterSchema = z.object({
  storage_location: storageLocationSchema.optional(),
  item_type: inventoryItemTypeSchema.optional(),
  search: z.string().max(100).optional(),
})

export type PantryFilterInput = z.infer<typeof pantryFilterSchema>

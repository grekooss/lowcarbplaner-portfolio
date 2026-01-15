# 🍳 Prompt: Generator migracji SQL dla przepisów LowCarbPlaner (z komponentami)

Jesteś ekspertem od bazy danych PostgreSQL dla aplikacji LowCarbPlaner - aplikacji do planowania niskowęglowodanowych posiłków.

## Twoje zadanie

Wygeneruj kompletną migrację SQL dodającą nowy przepis do bazy danych.

### Kluczowe zasady:

1. **MODULARNOŚĆ**: Jeśli przepis zawiera element, który może być użyty samodzielnie lub w innych przepisach (np. chleb keto, sos, pesto, makaron keto, majonezy domowe), ZAWSZE wydziel go jako osobny komponent.

2. **KOMPONENTY to osobne przepisy** z `is_component = true`, które mogą być:
   - Pieczywo (chleb keto, bułki, placki)
   - Sosy (pesto, bolognese, carbonara, majonez)
   - Bazy (makaron keto, ryż z kalafiora, puree)
   - Dodatki (masło czosnkowe, marynaty)

3. **Przepis główny** używa komponentu przez tabelę `recipe_components`, NIE przez `recipe_ingredients`.

---

## Struktura bazy danych

### Tabela `ingredients`
```sql
-- Kategorie składników (ENUM ingredient_category_enum):
-- vegetables, fruits, meat, fish, dairy, eggs, nuts_seeds, oils_fats,
-- spices_herbs, flours, beverages, sweeteners, condiments, other

INSERT INTO public.ingredients (
  name,                         -- TEXT, unikalna nazwa po polsku
  category,                     -- ingredient_category_enum
  unit,                         -- TEXT, domyślna jednostka ('g' lub 'ml')
  calories_per_100_units,       -- NUMERIC, kalorie na 100g/ml
  carbs_per_100_units,          -- NUMERIC, węglowodany na 100g/ml
  protein_per_100_units,        -- NUMERIC, białko na 100g/ml
  fats_per_100_units,           -- NUMERIC, tłuszcze na 100g/ml
  fiber_per_100_units,          -- NUMERIC, błonnik na 100g/ml (default 0)
  polyols_per_100_units,        -- NUMERIC, poliole na 100g/ml (default 0)
  saturated_fat_per_100_units,  -- NUMERIC, tłuszcze nasycone (default 0)
  is_divisible,                 -- BOOLEAN, czy można dzielić (default true)
  description,                  -- TEXT, opcjonalny opis
  is_low_carb_friendly          -- BOOLEAN, TRUE jeśli net_carbs <= 10g/100g
) VALUES (...);

-- WAŻNE: Net Carbs = carbs - fiber - polyols
-- is_low_carb_friendly = TRUE gdy net_carbs <= 10
```

### Tabela `recipes`
```sql
-- Typy posiłków (ENUM meal_type_enum):
-- breakfast, lunch, dinner, snack, snack_morning, snack_afternoon

-- Poziom trudności (ENUM difficulty_level_enum): easy, medium, hard
-- Prep timing (ENUM prep_timing_enum): prep_ahead, cook_fresh, flexible

INSERT INTO public.recipes (
  name,                   -- TEXT, nazwa przepisu po polsku
  slug,                   -- TEXT, URL-friendly slug (lowercase, z myślnikami)
  image_url,              -- TEXT, URL do obrazka (NULL dla nowych)
  meal_types,             -- meal_type_enum[], np. array['breakfast', 'snack']
  tags,                   -- TEXT[], tagi (dodaj 'komponent' dla komponentów)
  prep_time_min,          -- INTEGER, czas przygotowania w minutach
  cook_time_min,          -- INTEGER, czas gotowania w minutach (0 jeśli brak)
  difficulty_level,       -- difficulty_level_enum
  base_servings,          -- INTEGER, bazowa liczba porcji
  serving_unit,           -- TEXT, jednostka ('porcja', 'sztuka', 'kromka', 'ml')
  is_batch_friendly,      -- BOOLEAN, czy nadaje się do batch cooking
  suggested_batch_size,   -- INTEGER, sugerowana wielkość batch (NULL jeśli nie)
  min_servings,           -- INTEGER, minimalna liczba porcji
  is_component,           -- BOOLEAN, TRUE dla komponentów (chlebów, sosów)
  prep_timing             -- prep_timing_enum (default 'cook_fresh')
) VALUES (...);
```

### Tabela `recipe_ingredients` (dla zwykłych składników)
```sql
INSERT INTO public.recipe_ingredients (
  recipe_id,      -- INTEGER, odniesienie do recipes.id
  ingredient_id,  -- INTEGER, odniesienie do ingredients.id
  base_amount,    -- NUMERIC, ilość dla base_servings
  unit,           -- TEXT, jednostka ('g', 'ml', 'szt')
  is_scalable,    -- BOOLEAN, czy ilość skaluje się z porcjami (default true)
  step_number     -- INTEGER, numer kroku w którym używany (1-indexed)
) VALUES (...);
```

### Tabela `recipe_components` (dla przepisów-składników)
```sql
-- UŻYWAJ GDY: przepis zawiera inny przepis jako składnik
-- PRZYKŁADY:
--   - Kanapka z chlebem keto → chleb-keto jest komponentem
--   - Makaron z sosem bolognese → sos-bolognese jest komponentem
--   - Tosty z pesto → pesto-bazyliowe jest komponentem

INSERT INTO public.recipe_components (
  parent_recipe_id,      -- INTEGER, przepis główny (np. kanapka)
  component_recipe_id,   -- INTEGER, przepis-składnik (np. chleb keto)
  required_amount,       -- NUMERIC, ilość komponentu potrzebna
  unit,                  -- TEXT, jednostka ('g', 'ml', 'szt', 'kromka')
  fallback_ingredient_id -- INTEGER, alternatywny składnik jeśli brak komponentu (opcjonalne)
)
SELECT
  (SELECT id FROM public.recipes WHERE slug = 'przepis-glowny'),
  (SELECT id FROM public.recipes WHERE slug = 'komponent'),
  100, 'g', NULL;
```

### Tabela `recipe_equipment` (OBOWIĄZKOWA)
```sql
-- KAŻDY przepis MUSI mieć przypisany sprzęt!

INSERT INTO public.recipe_equipment (
  recipe_id,      -- INTEGER
  equipment_id,   -- INTEGER (z dostarczonej listy)
  quantity,       -- INTEGER (default 1)
  notes           -- TEXT, notatki np. '180°C', 'średnia wielkość'
)
SELECT
  (SELECT id FROM public.recipes WHERE slug = 'nazwa-slug'),
  (SELECT id FROM public.equipment WHERE name = 'Nazwa sprzętu'),
  1, 'notatka';
```

### Tabela `recipe_instructions`
```sql
-- =====================================================================
-- KRYTYCZNE: ZASADY TWORZENIA KROKÓW INSTRUKCJI
-- =====================================================================
--
-- 1. JEDEN KROK = JEDNA CZYNNOŚĆ
--    ❌ ŹLE: "Pokrój warzywa i gotuj 15 minut"
--    ✅ DOBRZE: Krok 1: "Pokrój warzywa" (prep, 3 min aktywnie)
--              Krok 2: "Gotuj warzywa" (passive, 15 min pasywnie)
--
-- 2. NIGDY NIE MIESZAJ AKTYWNEGO Z PASYWNYM W JEDNYM KROKU
--    - Każdy krok ma TYLKO active_minutes LUB passive_minutes (drugi = 0)
--    - Wyjątek: assembly (składanie) może mieć oba gdy np. montujesz i zapiekasz
--
-- 3. GRANULARNOŚĆ POZWALA NA OPTYMALIZACJĘ
--    - Timeline optimizer wykorzystuje kroki pasywne do równoległości
--    - Im mniejsze kroki, tym lepsza optymalizacja
--
-- 4. SMAŻENIE/PIECZENIE = WIELE KROKÓW
--    - Rozgrzewanie patelni/piekarnika = osobny krok (passive, 2-5 min)
--    - Smażenie z jednej strony = osobny krok (passive, X min)
--    - Odwrócenie = osobny krok (active, 1 min)
--    - Smażenie z drugiej strony = osobny krok (passive, X min)
--
-- =====================================================================
-- TYPY AKCJI (ENUM instruction_action_type)
-- =====================================================================
--
-- prep     → Mise en place: krojenie, obieranie, odmierzanie
--            TYLKO active_minutes > 0, passive_minutes = 0
--            is_parallelizable = true (można robić równolegle z innymi prep)
--
-- active   → Czynne działanie: mieszanie, wyrabianie, formowanie
--            TYLKO active_minutes > 0, passive_minutes = 0
--            is_parallelizable = false (wymaga uwagi)
--
-- passive  → Oczekiwanie: gotowanie, pieczenie, smażenie, studzenie
--            TYLKO passive_minutes > 0, active_minutes = 0
--            is_parallelizable = true (podczas tego można robić inne rzeczy)
--
-- assembly → Składanie końcowe: nakładanie, dekorowanie
--            Głównie active_minutes, może mieć passive (np. zapiekanie)
--            is_parallelizable = false
--
-- checkpoint → Punkt kontrolny: sprawdzenie temperatury, konsystencji
--              active_minutes = 1 (na sprawdzenie)
--              is_parallelizable = false
--
-- =====================================================================
-- TYPY SKALOWANIA CZASU (ENUM time_scaling_type)
-- =====================================================================
--
-- linear      → Czas rośnie proporcjonalnie z porcjami
--               Użyj dla: krojenie, formowanie, mieszanie
--
-- constant    → Czas stały niezależnie od porcji
--               Użyj dla: pieczenie, gotowanie, smażenie, rozgrzewanie
--
-- logarithmic → Czas rośnie wolniej niż proporcjonalnie
--               Użyj dla: gotowanie wody (2x wody ≠ 2x czasu)
--
-- =====================================================================

INSERT INTO public.recipe_instructions (
  recipe_id,           -- INTEGER
  step_number,         -- INTEGER, kolejność kroków (1, 2, 3...)
  description,         -- TEXT, opis kroku - KRÓTKO, jedna czynność!
  active_minutes,      -- INTEGER, czas aktywnej pracy (0 dla passive)
  passive_minutes,     -- INTEGER, czas pasywnego oczekiwania (0 dla active/prep)
  action_type,         -- instruction_action_type (prep/active/passive/assembly/checkpoint)
  is_parallelizable,   -- BOOLEAN, czy można wykonać równolegle
  time_scaling_type,   -- time_scaling_type (linear/constant/logarithmic)
  sensory_cues,        -- JSONB, wskazówki sensoryczne (opcjonalne)
  is_critical_timing   -- BOOLEAN, czy timing jest krytyczny (opcjonalne)
)
SELECT
  (SELECT id FROM public.recipes WHERE slug = 'nazwa-slug'),
  1, 'Opis kroku...', 5, 0, 'prep', true, 'linear';
```

### PRZYKŁADY POPRAWNYCH INSTRUKCJI

**❌ ŹLE - Jeden duży krok:**
```sql
-- Mieszanie aktywnego z pasywnym, zbyt ogólne
(1, 'Kalafior umyj, podziel na różyczki. Gotuj w osolonej wodzie do miękkości.', 2, 15, 'passive', ...)
```

**✅ DOBRZE - Granularne kroki:**
```sql
-- Krok 1: Przygotowanie kalafiora (prep)
(1, 'Umyj kalafior i podziel na różyczki.', 2, 0, 'prep', true, 'linear', NULL)

-- Krok 2: Zagotowanie wody (passive) - tu optymalizator może wstawić inne prep
(2, 'Zagotuj wodę w garnku i posól.', 0, 3, 'passive', true, 'constant', NULL)

-- Krok 3: Gotowanie kalafiora (passive) - długi czas pasywny = okazja do równoległości
(3, 'Wrzuć kalafior do wrzątku i gotuj do miękkości.', 0, 12, 'passive', true, 'constant', '{"texture": "miękki, łatwo przebić widelcem"}')
```

**❌ ŹLE - Smażenie jako jeden krok:**
```sql
(5, 'Rozgrzej olej na patelni. Smaż kotlety po 4-5 minut z każdej strony.', 0, 10, 'passive', ...)
```

**✅ DOBRZE - Smażenie rozbite na etapy:**
```sql
-- Krok 5: Rozgrzanie patelni (passive) - można w tym czasie formować kotlety
(5, 'Rozgrzej olej na patelni na średnim ogniu.', 0, 2, 'passive', true, 'constant', '{"visual": "olej lśni, lekko faluje"}')

-- Krok 6: Smażenie pierwszej strony (passive)
(6, 'Ułóż kotlety na patelni. Smaż bez ruszania.', 0, 4, 'passive', true, 'constant', '{"visual": "spód złocisty", "sound": "równomierne skwierczenie"}')

-- Krok 7: Odwrócenie (active) - szybka czynność aktywna
(7, 'Odwróć kotlety na drugą stronę.', 1, 0, 'active', false, 'constant', NULL)

-- Krok 8: Smażenie drugiej strony (passive)
(8, 'Smaż do złotego koloru.', 0, 4, 'passive', true, 'constant', '{"visual": "złocisty z obu stron", "texture": "sprężyste przy nacisku"}')
```

---

## Format wyjściowy migracji

```sql
-- =====================================================================
-- Migration: Add recipe "[NAZWA PRZEPISU]"
-- Description: [KRÓTKI OPIS]
-- Components: [LISTA KOMPONENTÓW jeśli są]
-- Date: [DATA w formacie YYYYMMDDHHMMSS]
-- =====================================================================

-- =====================================================================
-- KROK 1: Dodaj brakujące składniki (jeśli potrzebne)
-- =====================================================================
-- Sprawdź każdy składnik w załączonej liście CSV
-- Jeśli brak - dodaj z realistycznymi wartościami (źródło: USDA/Cronometer)

INSERT INTO public.ingredients (name, category, unit, calories_per_100_units, carbs_per_100_units, protein_per_100_units, fats_per_100_units, fiber_per_100_units, polyols_per_100_units, saturated_fat_per_100_units, is_divisible, description, is_low_carb_friendly)
VALUES
  ('Nazwa składnika', 'category', 'g', 100.00, 5.00, 10.00, 8.00, 2.00, 0.00, 3.00, true, 'opis', true)
ON CONFLICT (name) DO NOTHING;

-- =====================================================================
-- KROK 2A: Dodaj komponenty (jeśli potrzebne)
-- =====================================================================
-- Komponenty to przepisy z is_component = true
-- NAJPIERW dodaj komponent, POTEM przepis główny

-- Przykład: Sos bolognese jako komponent
INSERT INTO public.recipes (name, slug, image_url, meal_types, tags, prep_time_min, cook_time_min, difficulty_level, base_servings, serving_unit, is_batch_friendly, suggested_batch_size, min_servings, is_component, prep_timing)
VALUES (
  'Sos bolognese keto',
  'sos-bolognese-keto',
  NULL,
  array['lunch', 'dinner']::public.meal_type_enum[],
  array['sos', 'mięsny', 'włoski', 'komponent']::text[],
  15, 45, 'medium',
  4, 'porcja',          -- 4 porcje sosu
  true, 8, 2,           -- batch friendly
  true,                 -- TO JEST KOMPONENT
  'prep_ahead'          -- można przygotować wcześniej
);

-- Składniki komponentu
INSERT INTO public.recipe_ingredients (...) VALUES (...);

-- Sprzęt komponentu
INSERT INTO public.recipe_equipment (...) SELECT ...;

-- Instrukcje komponentu
INSERT INTO public.recipe_instructions (...) SELECT ...;

-- =====================================================================
-- KROK 2B: Dodaj przepis główny
-- =====================================================================
INSERT INTO public.recipes (name, slug, image_url, meal_types, tags, prep_time_min, cook_time_min, difficulty_level, base_servings, serving_unit, is_batch_friendly, suggested_batch_size, min_servings, is_component, prep_timing)
VALUES (
  'Makaron keto z sosem bolognese',
  'makaron-keto-z-sosem-bolognese',
  NULL,
  array['lunch', 'dinner']::public.meal_type_enum[],
  array['makaron', 'włoski', 'obiad']::text[],
  10, 15, 'easy',
  1, 'porcja',
  false, NULL, 1,
  false,                -- TO NIE JEST KOMPONENT
  'cook_fresh'
);

-- =====================================================================
-- KROK 3: Dodaj składniki przepisu głównego
-- =====================================================================
-- UWAGA: NIE dodawaj tu komponentów - one idą do recipe_components!

INSERT INTO public.recipe_ingredients (recipe_id, ingredient_id, base_amount, unit, is_scalable, step_number)
VALUES
  ((SELECT id FROM public.recipes WHERE slug = 'makaron-keto-z-sosem-bolognese'),
   (SELECT id FROM public.ingredients WHERE name = 'Ser parmezan'), 30, 'g', true, 3);

-- =====================================================================
-- KROK 4: Dodaj powiązanie z komponentem
-- =====================================================================
INSERT INTO public.recipe_components (parent_recipe_id, component_recipe_id, required_amount, unit)
SELECT
  (SELECT id FROM public.recipes WHERE slug = 'makaron-keto-z-sosem-bolognese'),
  (SELECT id FROM public.recipes WHERE slug = 'sos-bolognese-keto'),
  150, 'g';  -- 1 porcja sosu

-- =====================================================================
-- KROK 5: Dodaj sprzęt kuchenny (OBOWIĄZKOWE!)
-- =====================================================================
INSERT INTO public.recipe_equipment (recipe_id, equipment_id, quantity, notes)
SELECT (SELECT id FROM public.recipes WHERE slug = '...'),
       (SELECT id FROM public.equipment WHERE name = '...'), 1, '...';

-- =====================================================================
-- KROK 6: Dodaj instrukcje
-- =====================================================================
INSERT INTO public.recipe_instructions (recipe_id, step_number, description, active_minutes, passive_minutes, action_type, is_parallelizable, time_scaling_type)
SELECT (SELECT id FROM public.recipes WHERE slug = '...'), 1, '...', 5, 0, 'prep', false, 'linear';
```

---

## Zasady tworzenia przepisów

### Kiedy wydzielić komponent?
Wydziel jako osobny przepis z `is_component = true` gdy element:
- ✅ Może być użyty w wielu przepisach (chleb, sos, pesto, makaron)
- ✅ Można go przygotować wcześniej i przechować (batch cooking)
- ✅ Ma sens jako samodzielny produkt
- ❌ NIE wydzielaj prostych dodatków (pokrojone warzywa, przyprawy)

### Przykłady komponentów:
| Przepis główny | Komponent |
|----------------|-----------|
| Kanapka z szynką | Chleb keto |
| Makaron z sosem | Sos bolognese keto |
| Sałatka z kurczakiem | Dressing cezar keto |
| Naleśniki z owocami | Naleśniki keto |
| Pizza keto | Spód do pizzy keto |
| Burger keto | Bułka keto |

### Slug:
- Lowercase, tylko litery, cyfry i myślniki
- Bez polskich znaków (ą→a, ę→e, ó→o, ł→l, ś→s, ć→c, ż/ź→z, ń→n)
- Przykład: "Sos śmietanowo-czosnkowy" → "sos-smietanowo-czosnkowy"

### Czasy:
- `prep_time_min` = suma `active_minutes` z instrukcji
- `cook_time_min` = suma `passive_minutes` z instrukcji
- Dla przepisu z komponentem: NIE wliczaj czasu komponentu (zakładamy że jest gotowy)

### Sensory cues (wskazówki sensoryczne):
```json
{"visual": "złoty kolor", "sound": "syczy", "smell": "aromat czosnku", "texture": "al dente"}
```

---

## ⚠️ CHECKLISTA WALIDACJI INSTRUKCJI

Przed wygenerowaniem migracji sprawdź KAŻDY krok instrukcji:

### ✅ Walidacja pojedynczego kroku

| Pytanie | Oczekiwana odpowiedź |
|---------|---------------------|
| Czy krok opisuje JEDNĄ czynność? | TAK - jedna akcja, jedno polecenie |
| Czy `active_minutes > 0` i `passive_minutes > 0` jednocześnie? | NIE - jeden z nich musi być 0 |
| Czy typ `action_type` odpowiada czasom? | `prep/active/checkpoint` → tylko active, `passive` → tylko passive |
| Czy `is_parallelizable` jest poprawne? | `prep` i `passive` → zazwyczaj true, `active` i `checkpoint` → false |
| Czy opis nie zawiera "i gotuj/smaż/piecz"? | TAK - gotowanie to osobny krok passive |

### ✅ Walidacja sekwencji kroków

| Wzorzec | Wymagane kroki |
|---------|---------------|
| **Gotowanie w wodzie** | 1) prep: pokrój/przygotuj 2) passive: zagotuj wodę 3) passive: gotuj składniki |
| **Smażenie na patelni** | 1) passive: rozgrzej olej 2) passive: smaż strona A 3) active: odwróć 4) passive: smaż strona B |
| **Pieczenie w piekarniku** | 1) passive: nagrzej piekarnik 2) active: włóż do piekarnika 3) passive: piecz 4) active: wyjmij |
| **Blendowanie** | 1) active: zblenduj (lub passive jeśli długo - np. robot kuchenny) |
| **Wyrabianie ciasta** | 1) active: wymieszaj składniki 2) active: wyrób ciasto (lub passive dla robota) |

### ✅ Wzorce czasów dla typowych czynności

| Czynność | Typ | Typowy czas | Uwagi |
|----------|-----|-------------|-------|
| Krojenie warzyw | prep | 2-5 min | linear scaling |
| Obieranie | prep | 1-3 min | linear scaling |
| Zagotowanie wody | passive | 2-5 min | logarithmic scaling |
| Gotowanie warzyw | passive | 5-15 min | constant |
| Rozgrzanie patelni | passive | 2-3 min | constant |
| Smażenie na patelni | passive | 3-6 min/strona | constant |
| Odwrócenie | active | 1 min | constant |
| Nagrzanie piekarnika | passive | 10-15 min | constant |
| Pieczenie | passive | 15-60 min | constant |
| Mieszanie składników | active | 1-3 min | linear |
| Formowanie kotletów | active | 2-5 min | linear |
| Blendowanie | active | 1-2 min | constant |

### Fallback ingredient:
Jeśli komponent ma prosty odpowiednik sklepowy, dodaj `fallback_ingredient_id`:
```sql
-- Jeśli użytkownik nie ma domowego pesto, może użyć kupnego
INSERT INTO public.recipe_components (parent_recipe_id, component_recipe_id, required_amount, unit, fallback_ingredient_id)
SELECT
  (SELECT id FROM public.recipes WHERE slug = 'kurczak-z-pesto'),
  (SELECT id FROM public.recipes WHERE slug = 'pesto-bazyliowe'),
  50, 'g',
  (SELECT id FROM public.ingredients WHERE name = 'Pesto bazyliowe (słoik)');
```

---

## WYMAGANE ZAŁĄCZNIKI

### 1. Lista istniejących składników (CSV) - OBOWIĄZKOWE
```csv
id,name,category
866,Jajko kurze (całe),eggs
869,Ser feta,dairy
...
```

### 2. Lista sprzętu (CSV) - OBOWIĄZKOWE
```csv
id,name,category
1,Piekarnik,heating
2,Kuchenka,heating
3,Patelnia,cookware
...
```

### 3. Lista istniejących komponentów (jeśli są) - OPCJONALNE
```csv
slug,name,serving_unit
chleb-keto,Chleb keto,kromka
pesto-bazyliowe,Pesto bazyliowe,ml
sos-bolognese-keto,Sos bolognese keto,porcja
```

---

## PEŁNY PRZYKŁAD: Kotlety z indyka z puree z kalafiora

Poniżej poprawna migracja z granularnymi krokami:

```sql
-- =====================================================================
-- Migration: Add recipe "Kotlety z indyka z puree z kalafiora"
-- Description: Kotlety z indyka podane z puree z kalafiora jako komponentem.
-- Components: Puree z kalafiora
-- Date: 20240730120000
-- =====================================================================

-- KROK 0: Naprawa sekwencji
SELECT setval(pg_get_serial_sequence('public.ingredients', 'id'), COALESCE((SELECT MAX(id) FROM public.ingredients), 0) + 1, false);
SELECT setval(pg_get_serial_sequence('public.recipes', 'id'), COALESCE((SELECT MAX(id) FROM public.recipes), 0) + 1, false);

-- KROK 1: Składniki (pominięte - zakładamy że istnieją)

-- KROK 2A: Komponent "Puree z kalafiora"
INSERT INTO public.recipes (name, slug, image_url, meal_types, tags, prep_time_min, cook_time_min, difficulty_level, base_servings, serving_unit, is_batch_friendly, suggested_batch_size, min_servings, is_component, prep_timing)
VALUES (
  'Puree z kalafiora',
  'puree-z-kalafiora',
  NULL,
  array[]::public.meal_type_enum[],
  array['dodatek', 'puree', 'warzywne', 'keto', 'komponent']::text[],
  4, 15, 'easy',  -- prep_time = 2+2 min active, cook_time = 3+12 min passive
  2, 'porcja',
  true, 4, 1,
  true,
  'cook_fresh'
) ON CONFLICT (slug) DO NOTHING;

-- Instrukcje komponentu - GRANULARNE!
INSERT INTO public.recipe_instructions (recipe_id, step_number, description, active_minutes, passive_minutes, action_type, is_parallelizable, time_scaling_type, sensory_cues)
SELECT (SELECT id FROM public.recipes WHERE slug = 'puree-z-kalafiora'), step_number, description, active_minutes, passive_minutes, action_type::public.instruction_action_type, is_parallelizable, time_scaling_type::public.time_scaling_type, sensory_cues::jsonb
FROM (VALUES
  -- Krok 1: Przygotowanie kalafiora (prep)
  (1, 'Umyj kalafior i podziel na różyczki.', 2, 0, 'prep', true, 'linear', NULL),

  -- Krok 2: Zagotowanie wody (passive) - w tym czasie można przygotowywać inne składniki
  (2, 'Zagotuj wodę w garnku i posól.', 0, 3, 'passive', true, 'logarithmic', NULL),

  -- Krok 3: Gotowanie kalafiora (passive) - długi czas = optymalizator wstawi tu inne kroki
  (3, 'Wrzuć różyczki kalafiora do wrzątku i gotuj do miękkości.', 0, 12, 'passive', true, 'constant', '{"texture": "miękki, łatwo przebić widelcem"}'),

  -- Krok 4: Odcedzenie (active)
  (4, 'Odcedź kalafior przez sitko.', 1, 0, 'active', false, 'constant', NULL),

  -- Krok 5: Dodanie dodatków (active)
  (5, 'Dodaj masło, śmietanę, sól i biały pieprz.', 1, 0, 'active', false, 'constant', NULL),

  -- Krok 6: Blendowanie (active)
  (6, 'Zblenduj na gładkie puree.', 2, 0, 'active', false, 'constant', '{"texture": "gładkie, bez grudek"}')
) AS t(step_number, description, active_minutes, passive_minutes, action_type, is_parallelizable, time_scaling_type, sensory_cues)
ON CONFLICT (recipe_id, step_number) DO NOTHING;

-- KROK 2B: Przepis główny "Kotlety z indyka z puree z kalafiora"
INSERT INTO public.recipes (name, slug, image_url, meal_types, tags, prep_time_min, cook_time_min, difficulty_level, base_servings, serving_unit, is_batch_friendly, suggested_batch_size, min_servings, is_component, prep_timing)
VALUES (
  'Kotlety z indyka z puree z kalafiora',
  'kotlety-z-indyka-z-puree-z-kalafiora',
  NULL,
  array['lunch', 'dinner']::public.meal_type_enum[],
  array['mięsne', 'drób', 'obiad', 'kolacja', 'keto']::text[],
  12, 12, 'medium',  -- prep = 5+3+2+2 min, cook = 2+4+4+2 min
  2, 'porcja',
  false, NULL, 1,
  false,
  'cook_fresh'
) ON CONFLICT (slug) DO NOTHING;

-- Instrukcje przepisu głównego - GRANULARNE!
INSERT INTO public.recipe_instructions (recipe_id, step_number, description, active_minutes, passive_minutes, action_type, is_parallelizable, time_scaling_type, sensory_cues)
SELECT (SELECT id FROM public.recipes WHERE slug = 'kotlety-z-indyka-z-puree-z-kalafiora'), step_number, description, active_minutes, passive_minutes, action_type::public.instruction_action_type, is_parallelizable, time_scaling_type::public.time_scaling_type, sensory_cues::jsonb
FROM (VALUES
  -- PREP: Przygotowanie składników
  (1, 'Pokrój pierś z indyka na mniejsze kawałki.', 2, 0, 'prep', true, 'linear', NULL),
  (2, 'Obierz i posiekaj cebulę, czosnek i pietruszkę.', 3, 0, 'prep', true, 'linear', NULL),

  -- ACTIVE: Mielenie i formowanie
  (3, 'Zmiel mięso z warzywami w maszynce do mięsa.', 3, 0, 'active', false, 'linear', NULL),
  (4, 'Dodaj jajko, sól i pieprz. Wyrób masę.', 2, 0, 'active', false, 'linear', '{"texture": "spoista masa"}'),
  (5, 'Zwilżonymi dłońmi uformuj kotlety.', 2, 0, 'active', false, 'linear', NULL),

  -- PASSIVE: Rozgrzanie patelni (w tym czasie optymalizator może dokończyć formowanie)
  (6, 'Rozgrzej olej na patelni na średnim ogniu.', 0, 2, 'passive', true, 'constant', '{"visual": "olej lśni i lekko faluje"}'),

  -- PASSIVE: Smażenie strona A
  (7, 'Ułóż kotlety na patelni. Smaż bez ruszania.', 0, 4, 'passive', true, 'constant', '{"visual": "spód złocisty", "sound": "równomierne skwierczenie"}'),

  -- ACTIVE: Odwrócenie (krótka akcja między smażeniem)
  (8, 'Odwróć kotlety na drugą stronę.', 1, 0, 'active', false, 'constant', NULL),

  -- PASSIVE: Smażenie strona B
  (9, 'Smaż do złotego koloru.', 0, 4, 'passive', true, 'constant', '{"visual": "złocisty z obu stron"}'),

  -- CHECKPOINT: Sprawdzenie gotowości
  (10, 'Sprawdź czy kotlety są dobrze upieczone w środku.', 1, 0, 'checkpoint', false, 'constant', '{"texture": "sprężyste przy nacisku, sok klarowny"}'),

  -- ASSEMBLY: Podanie (passive jeśli np. trzymamy w cieple)
  (11, 'Podaj kotlety z puree z kalafiora.', 1, 0, 'assembly', false, 'constant', NULL)
) AS t(step_number, description, active_minutes, passive_minutes, action_type, is_parallelizable, time_scaling_type, sensory_cues)
ON CONFLICT (recipe_id, step_number) DO NOTHING;
```

**Dlaczego to jest lepsze?**

1. **Optymalizator może wykorzystać czasy pasywne**:
   - Podczas gotowania kalafiora (12 min) → można przygotować mięso na kotlety
   - Podczas rozgrzewania oleju (2 min) → można formować ostatnie kotlety
   - Podczas smażenia (4+4 min) → można przygotować talerze, dodatki

2. **Użytkownik widzi postęp**:
   - Zamiast jednego długiego kroku "smaż 10 minut" → jasne etapy z sensory cues

3. **Timer działa poprawnie**:
   - Każdy krok pasywny ma swój timer
   - Użytkownik może "uruchomić w tle" i przejść do następnego

---

## PRZEPIS DO DODANIA:

[WKLEJ TUTAJ SWÓJ PRZEPIS]

Podaj:
- Nazwa przepisu
- Typ posiłku (śniadanie/obiad/kolacja/przekąska)
- Składniki z dokładnymi ilościami
- Instrukcje krok po kroku
- Przybliżony czas przygotowania i gotowania
- Liczba porcji

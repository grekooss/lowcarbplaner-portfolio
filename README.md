# LowCarbPlaner - Full-Stack Meal Planning Application

<div align="center">

![LowCarbPlaner](screenshots/Screenshot_0a.jpg)

![Next.js](https://img.shields.io/badge/Next.js-16-black?style=for-the-badge&logo=next.js)
![TypeScript](https://img.shields.io/badge/TypeScript-5-blue?style=for-the-badge&logo=typescript)
![Supabase](https://img.shields.io/badge/Supabase-BaaS-3ECF8E?style=for-the-badge&logo=supabase)
![Vercel](https://img.shields.io/badge/Vercel-Deployed-000?style=for-the-badge&logo=vercel)

**Zaawansowana aplikacja do planowania posiłków niskowęglowodanowych**

[Live Demo](https://lowcarbplaner.vercel.app) • [Kontakt](https://github.com/grekooss)

</div>

---

## PL - Polski

### O projekcie

**LowCarbPlaner** rozwiązuje typowe wyzwania diety niskowęglowodanowej: **zmęczenie decyzyjne** przy codziennym planowaniu posiłków oraz **złożoność śledzenia makroskładników**. Aplikacja automatyzuje te kluczowe procesy, pozwalając użytkownikom skupić się na celach zamiast na żmudnych obliczeniach.

Po krótkim procesie onboardingu, algorytm aplikacji generuje 7-dniowy plan posiłków dostosowany do indywidualnych potrzeb kalorycznych i makro użytkownika. Kluczową innowacją jest **inteligentne skalowanie ilości składników** w przepisach, aby precyzyjnie trafić w założone cele - bez ręcznego wysiłku.

> **Kod źródłowy jest prywatny**, ponieważ jest to komercyjny projekt. Chętnie udostępnię go do wglądu podczas rozmowy rekrutacyjnej.

### Metodologia - AI-Driven Development

Projekt został zbudowany według uporządkowanej metodologii **AI-Driven Development** z pełną dokumentacją każdego etapu (~500KB dokumentacji technicznej):

```
📁 .ai/
├── 00 next-starting-package.md      # Konfiguracja startowa
├── 01 project-description.md        # Opis projektu
├── 02-03 planning-session.md        # Sesja planowania + podsumowanie
├── 04 PRD.md                        # Product Requirements Document
├── 05-06 TECH-STACK.md              # Wybór i analiza technologii
├── 07-09 DB-PLAN.md                 # Planowanie bazy danych
├── 10 API-PLAN.md                   # Architektura API
│   ├── 10a recipes-implementation   # Plan implementacji przepisów
│   ├── 10b planned-meals            # Plan implementacji posiłków
│   ├── 10c shopping-list            # Plan listy zakupów
│   ├── 10d profile                  # Plan profilu użytkownika
│   └── 10e feedback                 # Plan systemu feedbacku
├── 11-13 UI-PLAN.md                 # Planowanie interfejsu
│   ├── 13a recipes-browser          # Widok przeglądarki przepisów
│   ├── 13b dashboard                # Widok dashboardu
│   ├── 13c meal-plan                # Widok planu posiłków
│   ├── 13d shopping-list            # Widok listy zakupów
│   ├── 13e onboarding               # Widok onboardingu
│   ├── 13f auth                     # Widok autentykacji
│   └── 13g profile-settings         # Widok ustawień profilu
├── 14 KONTEKST-PROJEKTU.md          # Kontekst biznesowy
├── 15 STRATEGIA-TESTOWANIA.md       # Strategia testów
├── 16 ARCHITEKTURA.md               # Dokumentacja architektury
├── 17 WORKFLOW-DEWELOPERSKI.md      # Workflow developerski
└── 18 ANALIZA-PROJEKTU-MVP.md       # Analiza MVP + komponenty
```

**Każda funkcjonalność** przechodziła przez cykl:
1. **Planning Session** - burza mózgów i analiza wymagań
2. **Implementation Plan** - szczegółowy plan techniczny
3. **Implementation** - kodowanie według planu
4. **Summary** - dokumentacja i wnioski

### Główne funkcjonalności

#### Funkcjonalność podstawowa

- **Automatyczny 7-dniowy plan posiłków** - pełny tydzień śniadań, obiadów i kolacji generowany automatycznie na podstawie celów
- **Inteligentne skalowanie składników** - algorytm dopasowuje ilości składników, aby idealnie trafić w cele kaloryczne i makro
- **Wizualne śledzenie postępów** - intuicyjne paski postępu dla kalorii, białka, węglowodanów i tłuszczów z aktualizacją w czasie rzeczywistym
- **Zagregowana lista zakupów** - skonsolidowana lista zakupów na nadchodzące dni, pogrupowana według kategorii
- **Zarządzanie przepisami** - wymiana posiłków, szczegółowe instrukcje gotowania z trybem krok po kroku na mobile

#### User Experience

- **Responsywny design** - UI w stylu glassmorphism zoptymalizowany dla mobile i desktop
- **Modal podglądu przepisu** - szybki podgląd przepisów zamiennych przed wymianą
- **Interaktywny pasek kalendarza** - nawigacja między dniami z wizualnymi wskaźnikami
- **Tryb gotowania krok po kroku** - przyjazne dla mobile instrukcje gotowania z timerami

#### Autentykacja i profil

- **Wiele metod logowania** - Email/Hasło oraz Google OAuth
- **Personalizowany onboarding** - kreator krok po kroku do obliczenia celów kalorycznych/makro
- **Zarządzanie profilem** - aktualizacja wagi, poziomu aktywności i przeliczanie celów
- **System feedbacku** - formularz w aplikacji do zgłaszania problemów lub sugestii

### Tech Stack

| Kategoria | Technologia | Cel |
|:----------|:------------|:----|
| **Full-stack Framework** | **Next.js 16 (App Router)** | Fundament dla UI, routingu i logiki server-side (RSC) |
| **Backend & Baza danych** | **Supabase (BaaS)** | PostgreSQL, Autentykacja, Row Level Security |
| **UI Framework** | **Tailwind CSS 4 + shadcn/ui + Radix UI** | Nowoczesny design system glassmorphism |
| **Pobieranie danych** | **TanStack Query (React Query)** | Efektywna synchronizacja i cache stanu serwera |
| **Stan klienta** | **Zustand** | Minimalistyczne zarządzanie stanem globalnym |
| **Formularze & Walidacja** | **React Hook Form + Zod** | Wydajne formularze z walidacją type-safe |
| **Wykresy** | **Recharts** | Wizualizacja danych dla śledzenia makro |
| **Testowanie** | **Vitest + RTL + Playwright** | Kompleksowe testy unit, integration i E2E |
| **Deployment** | **Vercel** | Hosting produkcyjny z automatycznym deploy |
| **CI/CD** | **GitHub Actions** | Zautomatyzowany pipeline testów i deploy |

### Architektura

```
┌─────────────────────────────────────┐
│  Client/Server Components (React)   │
└────────────────┬────────────────────┘
                 │
┌────────────────▼────────────────────┐
│     Server Actions (Business Logic) │
│   - Walidacja Zod                   │
│   - Obliczenia żywieniowe           │
│   - Operacje CRUD                   │
│   Return: { data: T } | { error }   │
└────────────────┬────────────────────┘
                 │
┌────────────────▼────────────────────┐
│   Supabase (PostgreSQL + RLS)       │
│   Schemat content: przepisy, skł.   │
│   Schemat public: dane użytkownika  │
└─────────────────────────────────────┘
```

### Struktura projektu

```
lowcarbplaner/
├── app/                    # Next.js App Router pages
│   ├── (public)/           # Publiczne route (auth, onboarding)
│   ├── api/                # API routes
│   ├── dashboard/          # Główny dashboard
│   ├── meal-plan/          # Widok tygodniowego planu
│   ├── profile/            # Profil użytkownika
│   ├── recipes/            # Przeglądarka przepisów & szczegóły
│   └── shopping-list/      # Lista zakupów
├── src/
│   ├── components/         # Komponenty React
│   │   ├── auth/           # Formularze autentykacji
│   │   ├── dashboard/      # Komponenty dashboardu
│   │   ├── meal-plan/      # Komponenty planowania posiłków
│   │   ├── onboarding/     # Kroki kreatora onboardingu
│   │   ├── profile/        # Zarządzanie profilem
│   │   ├── recipes/        # Komponenty przepisów
│   │   ├── shared/         # Współdzielone komponenty
│   │   ├── shopping-list/  # Komponenty listy zakupów
│   │   └── ui/             # shadcn/ui primitives
│   ├── hooks/              # Custom React hooks
│   ├── lib/                # Utilities, configs, queries
│   ├── services/           # Serwisy logiki biznesowej
│   └── types/              # TypeScript types & DTOs
├── tests/                  # Pliki testów
├── scripts/                # Skrypty bazy danych & utility
└── supabase/               # Migracje Supabase & config
```

### Screenshoty

<details>
<summary><b>Strona główna i Autentykacja</b></summary>

![Landing Page](screenshots/Screenshot_0a.jpg)
![Landing Page 2](screenshots/Screenshot_0b.jpg)
![Auth](screenshots/Screenshot_0c.jpg)
![Auth 2](screenshots/Screenshot_0d.jpg)
</details>

<details>
<summary><b>Dashboard - widok dzienny</b></summary>

![Dashboard](screenshots/Screenshot_1a.jpg)
![Dashboard 2](screenshots/Screenshot_1b.jpg)
![Dashboard 3](screenshots/Screenshot_1c.jpg)
</details>

<details>
<summary><b>Plan posiłków - widok tygodniowy</b></summary>

![Meal Plan](screenshots/Screenshot_2a.jpg)
![Meal Plan 2](screenshots/Screenshot_2b.jpg)
</details>

<details>
<summary><b>Szczegóły przepisu</b></summary>

![Recipe Detail](screenshots/Screenshot_3a.jpg)
![Recipe Detail 2](screenshots/Screenshot_3b.jpg)
![Recipe Detail 3](screenshots/Screenshot_3c.jpg)
![Recipe Detail 4](screenshots/Screenshot_3d.jpg)
</details>

<details>
<summary><b>Lista zakupów</b></summary>

![Shopping List](screenshots/Screenshot_4a.jpg)
![Shopping List 2](screenshots/Screenshot_4b.jpg)
![Shopping List 3](screenshots/Screenshot_4c.jpg)
</details>

<details>
<summary><b>Spiżarnia (Pantry)</b></summary>

![Pantry](screenshots/Screenshot_5a.jpg)
![Pantry 2](screenshots/Screenshot_5b.jpg)
</details>

<details>
<summary><b>Meal Prep - sesja gotowania</b></summary>

![Meal Prep](screenshots/Screenshot_6a.jpg)
![Meal Prep 2](screenshots/Screenshot_6b.jpg)
</details>

<details>
<summary><b>Profil użytkownika</b></summary>

![Profile](screenshots/Screenshot_7a.jpg)
</details>

<details>
<summary><b>Onboarding</b></summary>

![Onboarding](screenshots/Screenshot_8a.jpg)
![Onboarding 2](screenshots/Screenshot_8b.jpg)
![Onboarding 3](screenshots/Screenshot_8c.jpg)
</details>

### Wybrane fragmenty kodu

#### 1. Kalkulator BMR/TDEE (Mifflin-St Jeor)

```typescript
// src/services/nutrition-calculator.ts

const ACTIVITY_MULTIPLIERS: Record<ActivityLevel, number> = {
  very_low: 1.2,    // Praca siedząca
  low: 1.375,       // Lekka aktywność (1-3 dni/tyg)
  moderate: 1.55,   // Umiarkowana (3-5 dni/tyg)
  high: 1.725,      // Wysoka (6-7 dni/tyg)
  very_high: 1.9,   // Bardzo wysoka (sport + praca fizyczna)
}

/**
 * Oblicza BMR używając wzoru Mifflin-St Jeor (1990)
 * Mężczyźni: 10×waga + 6.25×wzrost - 5×wiek + 5
 * Kobiety:   10×waga + 6.25×wzrost - 5×wiek - 161
 */
export function calculateBMR(
  gender: 'male' | 'female',
  age: number,
  weightKg: number,
  heightCm: number
): number {
  const base = 10 * weightKg + 6.25 * heightCm - 5 * age
  return gender === 'male' ? base + 5 : base - 161
}

export function calculateTDEE(bmr: number, activityLevel: ActivityLevel): number {
  return bmr * ACTIVITY_MULTIPLIERS[activityLevel]
}

// 7 proporcji makro: 70/25/5, 60/35/5, 60/30/10, 60/25/15, 50/30/20, 45/30/25, 40/40/20
// Minimum kaloryczne: 1400 kcal (K) / 1600 kcal (M)
```

#### 2. Generator planu posiłków (Binary Search + Batch Cooking)

```typescript
// src/services/meal-plan-generator.ts

const CALORIE_TOLERANCE = 0.15  // ±15% od celu
const DAYS_TO_GENERATE = 7

const MEAL_PLAN_CONFIGS: Record<MealPlanType, MealPlanConfig> = {
  '3_main_2_snacks': {
    mealTypes: ['breakfast', 'snack_morning', 'lunch', 'snack_afternoon', 'dinner'],
    calorieDistribution: {
      breakfast: 0.25, snack_morning: 0.1, lunch: 0.3,
      snack_afternoon: 0.1, dinner: 0.25
    },
  },
  '3_main_1_snack': { /* ... */ },
  '3_main': { /* ... */ },
  '2_main': { /* custom selection */ },
}

// Algorytm:
// 1. Prefetch wszystkich przepisów (eliminacja N+1)
// 2. Binary search po kaloriach - O(log n)
// 3. Batch cooking allocation - reuse przepisów
// 4. Iteracyjna optymalizacja makro (max 10 iteracji)
// 5. Ingredient scaling ±20% z zaokrągleniem do 5g
```

#### 3. Server Action z Discriminated Union

```typescript
// src/lib/actions/profile.ts
'use server'

type ActionResult<T> =
  | { data: T; error?: never }
  | { data?: never; error: string; code?: string }

export async function createProfile(
  input: CreateProfileInput
): Promise<ActionResult<CreateProfileResponseDTO>> {
  // 1. Weryfikacja autentykacji
  const supabase = await createServerClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return { error: 'Użytkownik nie jest zalogowany', code: 'UNAUTHORIZED' }
  }

  // 2. Walidacja Zod
  const validated = createProfileSchema.safeParse(input)
  if (!validated.success) {
    return { error: 'Nieprawidłowe dane', code: 'VALIDATION_ERROR' }
  }

  // 3. Obliczenia żywieniowe
  const nutritionTargets = calculateNutritionTargets(validated.data)

  // 4. Zapis do bazy z RLS
  const { data, error } = await supabase
    .from('profiles')
    .insert({ id: user.id, ...validated.data, ...nutritionTargets })
    .select()
    .single()

  if (error) return { error: error.message, code: 'DB_ERROR' }
  return { data }
}
```

#### 4. TanStack Query Hook z cache

```typescript
// src/hooks/usePantryQuery.ts

export const pantryKeys = {
  all: ['pantry'] as const,
  inventory: () => [...pantryKeys.all, 'inventory'] as const,
  item: (id: number) => [...pantryKeys.all, 'item', id] as const,
}

export function usePantryInventoryQuery() {
  return useQuery({
    queryKey: pantryKeys.inventory(),
    queryFn: async () => {
      const result = await getPantryInventory()
      if (result.error) throw new Error(result.error)
      return result.data
    },
    staleTime: 2 * 60 * 1000, // 2 minuty
  })
}

export function useAddIngredientMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: addIngredientToPantry,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: pantryKeys.inventory() })
    },
  })
}
```

### Kluczowe cechy projektu

| Cecha | Opis |
|-------|------|
| **Type Safety** | 100% TypeScript strict mode |
| **Security** | Row Level Security (RLS), server-side validation |
| **Performance** | Binary search O(log n), prefetching, query caching |
| **Accessibility** | WCAG 2.1 AA compliance |
| **Design** | Glassmorphism design system |
| **Testing** | Unit (Vitest), E2E (Playwright) |
| **DevOps** | GitHub Actions, Vercel |

### Statystyki

- **2000+** linii algorytmów planowania posiłków
- **15+** migracji SQL z optymalizacjami
- **22** custom React hooks
- **30+** komponentów UI (shadcn/ui)
- **~500KB** dokumentacji technicznej w `.ai/`

---

## EN - English

### About

**LowCarbPlaner** addresses the common challenges of a low-carb diet: **decision fatigue** from daily meal planning and the **complexity of tracking macros**. The application automates these key processes, allowing users to focus on their goals rather than on tedious calculations.

After a quick onboarding process, the app's core algorithm generates a 7-day meal plan tailored to the user's individual caloric and macro needs. A key innovation is the ability to **intelligently scale ingredient quantities** in existing recipes to hit precise targets - without manual effort.

> **Source code is private** as this is a commercial project. I'm happy to share it during a job interview.

### Methodology - AI-Driven Development

The project was built using a structured **AI-Driven Development** methodology with full documentation at each stage (~500KB of technical docs):

```
📁 .ai/
├── 00-01 Project Setup & Description
├── 02-03 Planning Sessions & Summaries
├── 04 PRD (Product Requirements Document)
├── 05-06 Tech Stack Selection & Analysis
├── 07-09 Database Planning & Schema Design
├── 10 API Architecture
│   └── 10a-e Implementation plans for each endpoint
├── 11-13 UI Planning
│   └── 13a-g Implementation plans for each view
├── 14-18 Context, Testing Strategy, Architecture, Workflow
```

**Each feature** went through a development cycle:
1. **Planning Session** - brainstorming & requirements analysis
2. **Implementation Plan** - detailed technical specification
3. **Implementation** - coding according to plan
4. **Summary** - documentation & lessons learned

### Key Features

#### Core Functionality

- **Automated 7-Day Meal Plan** - Full week of breakfasts, lunches, and dinners generated automatically based on your goals
- **Intelligent Ingredient Scaling** - Algorithm adjusts ingredient amounts to perfectly match your caloric and macro targets
- **Visual Progress Tracking** - Intuitive progress bars for calories, protein, carbs, and fats with real-time updates
- **Aggregated Shopping List** - Consolidated shopping list for the upcoming days, grouped by category
- **Recipe Management** - Swap meals, view detailed cooking instructions with step-by-step mode on mobile

#### User Experience

- **Responsive Design** - Glassmorphism UI optimized for mobile and desktop
- **Recipe Preview Modal** - Quick preview of replacement recipes before swapping
- **Interactive Calendar Strip** - Navigate between days with visual indicators
- **Step-by-Step Cooking Mode** - Mobile-friendly guided cooking instructions with timers

#### Authentication & Profile

- **Multiple Auth Methods** - Email/Password and Google OAuth
- **Personalized Onboarding** - Step-by-step wizard to calculate caloric/macro goals
- **Profile Management** - Update weight, activity level, and recalculate targets
- **Feedback System** - In-app form for reporting issues or suggestions

### Tech Stack

| Category | Technology | Purpose |
|:---------|:-----------|:--------|
| **Full-stack Framework** | **Next.js 16 (App Router)** | Foundation for UI, routing, and server-side logic (RSC) |
| **Backend & Database** | **Supabase (BaaS)** | PostgreSQL, Authentication, Row Level Security |
| **UI Framework** | **Tailwind CSS 4 + shadcn/ui + Radix UI** | Modern glassmorphism design system |
| **Data Fetching** | **TanStack Query (React Query)** | Efficient server-state synchronization and caching |
| **Client State** | **Zustand** | Minimalist global state management |
| **Forms & Validation** | **React Hook Form + Zod** | Performant forms with type-safe validation |
| **Charts** | **Recharts** | Data visualization for macro tracking |
| **Testing** | **Vitest + RTL + Playwright** | Comprehensive unit, integration, and E2E testing |
| **Deployment** | **Vercel** | Production hosting with automatic deployments |
| **CI/CD** | **GitHub Actions** | Automated testing and deployment pipeline |

### Architecture Highlights

- **Two-Layer API**: Server Components → Server Actions → Supabase
- **Discriminated Union** pattern for error handling
- **Row Level Security** on all user data
- **Binary Search** for O(log n) recipe matching
- **Batch Cooking** algorithm for meal prep optimization

### Project Structure

```
lowcarbplaner/
├── app/                    # Next.js App Router pages
│   ├── (public)/           # Public routes (auth, onboarding)
│   ├── api/                # API routes
│   ├── dashboard/          # Main dashboard
│   ├── meal-plan/          # Weekly meal plan view
│   ├── profile/            # User profile
│   ├── recipes/            # Recipe browser & details
│   └── shopping-list/      # Shopping list
├── src/
│   ├── components/         # React components
│   ├── hooks/              # Custom React hooks
│   ├── lib/                # Utilities, configs, queries
│   ├── services/           # Business logic services
│   └── types/              # TypeScript types & DTOs
├── tests/                  # Test files
├── scripts/                # Database & utility scripts
└── supabase/               # Supabase migrations & config
```

### Code Quality

| Aspect | Implementation |
|--------|----------------|
| **Type Safety** | 100% TypeScript strict mode |
| **Security** | RLS, server-side validation, HTTPS only |
| **Performance** | Binary search, prefetching, caching |
| **Accessibility** | WCAG 2.1 AA compliant |
| **Testing** | Unit (Vitest), E2E (Playwright) |

### Statistics

- **2000+** lines of meal planning algorithms
- **15+** SQL migrations with optimizations
- **22** custom React hooks
- **30+** UI components (shadcn/ui)
- **~500KB** technical documentation in `.ai/`

---

## Contact

**GitHub**: [@grekooss](https://github.com/grekooss)

**Live Demo**: [lowcarbplaner.vercel.app](https://lowcarbplaner.vercel.app)

---

<div align="center">

*Built with Next.js 16, React 19, TypeScript, Tailwind CSS, Supabase*

</div>

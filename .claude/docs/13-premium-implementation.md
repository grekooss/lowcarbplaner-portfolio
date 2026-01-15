# Plan implementacji użytkownika Premium

> **Status**: 📋 Do zrobienia
> **Priorytet**: Średni
> **Szacowany zakres**: 2-3 dni robocze

## Spis treści

1. [Przegląd](#1-przegląd)
2. [Baza danych](#2-baza-danych)
3. [Typy TypeScript](#3-typy-typescript)
4. [Architektura kodu](#4-architektura-kodu)
5. [Integracja płatności](#5-integracja-płatności)
6. [Ochrona funkcji Premium](#6-ochrona-funkcji-premium)
7. [Checklist implementacji](#7-checklist-implementacji)

---

## 1. Przegląd

### Cel

Implementacja systemu subskrypcji Premium umożliwiającego:

- Rozróżnienie użytkowników free/premium
- Integrację z systemem płatności (Stripe/Paddle)
- Ochronę funkcji premium w aplikacji
- Zarządzanie cyklem życia subskrypcji

### Planowane funkcje Premium

| Funkcja                       | Free | Premium    |
| ----------------------------- | ---- | ---------- |
| Przepisy na tydzień           | 7    | Bez limitu |
| Własne plany posiłków         | ❌   | ✅         |
| Zaawansowana analiza odżywcza | ❌   | ✅         |
| Eksport listy zakupów (PDF)   | ❌   | ✅         |
| Priorytetowe wsparcie         | ❌   | ✅         |
| Bez reklam                    | ❌   | ✅         |

### Diagram przepływu

```
┌─────────────────────────────────────────────────────────────┐
│                    PRZEPŁYW PREMIUM                          │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  [User] ──→ [Pricing Page] ──→ [Stripe Checkout]            │
│                                        │                     │
│                                        ▼                     │
│                              [Webhook: checkout.completed]   │
│                                        │                     │
│                                        ▼                     │
│                              [API Route: /api/webhooks/stripe]
│                                        │                     │
│                                        ▼                     │
│                              [Upsert subscriptions table]    │
│                                        │                     │
│                                        ▼                     │
│                              [Invalidate React Query cache]  │
│                                        │                     │
│                                        ▼                     │
│  [App] ←── useSubscription() ←── [Fresh subscription data]  │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

---

## 2. Baza danych

### 2.1 Typy ENUM

```sql
-- Migracja: YYYYMMDDHHMMSS_add_subscription_types.sql

CREATE TYPE subscription_status AS ENUM (
  'active',      -- Aktywna subskrypcja
  'canceled',    -- Anulowana (aktywna do końca okresu)
  'expired',     -- Wygasła
  'trial'        -- Okres próbny
);

CREATE TYPE subscription_plan AS ENUM (
  'free',          -- Darmowy plan
  'premium',       -- Premium miesięczny
  'premium_yearly' -- Premium roczny
);
```

### 2.2 Tabela `subscriptions`

```sql
-- Migracja: YYYYMMDDHHMMSS_create_subscriptions_table.sql

CREATE TABLE public.subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  plan subscription_plan NOT NULL DEFAULT 'free',
  status subscription_status NOT NULL DEFAULT 'active',

  -- Daty
  current_period_start TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  current_period_end TIMESTAMPTZ,
  trial_end TIMESTAMPTZ,
  canceled_at TIMESTAMPTZ,

  -- Integracja z płatnościami (Stripe/Paddle)
  external_customer_id TEXT,        -- stripe_customer_id
  external_subscription_id TEXT,    -- stripe_subscription_id

  -- Metadata
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT unique_user_subscription UNIQUE (user_id)
);

-- Indeksy
CREATE INDEX idx_subscriptions_user_id ON public.subscriptions(user_id);
CREATE INDEX idx_subscriptions_status ON public.subscriptions(status);
CREATE INDEX idx_subscriptions_period_end ON public.subscriptions(current_period_end);

-- Trigger dla updated_at
CREATE TRIGGER update_subscriptions_updated_at
  BEFORE UPDATE ON public.subscriptions
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
```

### 2.3 Polityki RLS

```sql
-- Migracja: YYYYMMDDHHMMSS_subscriptions_rls.sql

ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

-- Użytkownicy mogą tylko odczytywać swoją subskrypcję
CREATE POLICY "Users can view own subscription"
  ON public.subscriptions
  FOR SELECT
  USING (auth.uid() = user_id);

-- Tylko service_role może modyfikować (webhooks)
CREATE POLICY "Service role can manage subscriptions"
  ON public.subscriptions
  FOR ALL
  USING (auth.jwt()->>'role' = 'service_role');
```

### 2.4 Tabela `subscription_history` (audyt)

```sql
-- Migracja: YYYYMMDDHHMMSS_create_subscription_history.sql

CREATE TABLE public.subscription_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id UUID NOT NULL REFERENCES public.subscriptions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  event_type TEXT NOT NULL, -- 'created', 'upgraded', 'downgraded', 'renewed', 'canceled', 'expired'
  from_plan subscription_plan,
  to_plan subscription_plan,

  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_subscription_history_user ON public.subscription_history(user_id);
CREATE INDEX idx_subscription_history_subscription ON public.subscription_history(subscription_id);

-- RLS
ALTER TABLE public.subscription_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own subscription history"
  ON public.subscription_history
  FOR SELECT
  USING (auth.uid() = user_id);
```

### 2.5 Funkcja pomocnicza

```sql
-- Migracja: YYYYMMDDHHMMSS_add_is_premium_function.sql

CREATE OR REPLACE FUNCTION public.is_user_premium(user_uuid UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.subscriptions
    WHERE user_id = user_uuid
    AND status IN ('active', 'trial')
    AND plan != 'free'
    AND (current_period_end IS NULL OR current_period_end > NOW())
  );
$$ LANGUAGE SQL SECURITY DEFINER STABLE;

-- Użycie: SELECT public.is_user_premium('uuid-here');
```

---

## 3. Typy TypeScript

### 3.1 Plik `src/types/subscription.ts`

```typescript
// src/types/subscription.ts

export type SubscriptionPlan = 'free' | 'premium' | 'premium_yearly'
export type SubscriptionStatus = 'active' | 'canceled' | 'expired' | 'trial'

export interface Subscription {
  id: string
  user_id: string
  plan: SubscriptionPlan
  status: SubscriptionStatus
  current_period_start: string
  current_period_end: string | null
  trial_end: string | null
  canceled_at: string | null
  external_customer_id: string | null
  external_subscription_id: string | null
  created_at: string
  updated_at: string
}

export interface SubscriptionHistory {
  id: string
  subscription_id: string
  user_id: string
  event_type: SubscriptionEventType
  from_plan: SubscriptionPlan | null
  to_plan: SubscriptionPlan | null
  metadata: Record<string, unknown>
  created_at: string
}

export type SubscriptionEventType =
  | 'created'
  | 'upgraded'
  | 'downgraded'
  | 'renewed'
  | 'canceled'
  | 'expired'

export interface PremiumFeatures {
  maxRecipesPerWeek: number
  customMealPlans: boolean
  advancedNutrition: boolean
  exportShoppingList: boolean
  prioritySupport: boolean
  noAds: boolean
}

export const PLAN_FEATURES: Record<SubscriptionPlan, PremiumFeatures> = {
  free: {
    maxRecipesPerWeek: 7,
    customMealPlans: false,
    advancedNutrition: false,
    exportShoppingList: false,
    prioritySupport: false,
    noAds: false,
  },
  premium: {
    maxRecipesPerWeek: Infinity,
    customMealPlans: true,
    advancedNutrition: true,
    exportShoppingList: true,
    prioritySupport: true,
    noAds: true,
  },
  premium_yearly: {
    maxRecipesPerWeek: Infinity,
    customMealPlans: true,
    advancedNutrition: true,
    exportShoppingList: true,
    prioritySupport: true,
    noAds: true,
  },
}

export const PLAN_PRICES = {
  premium: {
    monthly: 29.99, // PLN
    currency: 'PLN',
  },
  premium_yearly: {
    yearly: 299.99, // PLN (2 miesiące gratis)
    monthly_equivalent: 24.99,
    currency: 'PLN',
  },
} as const
```

---

## 4. Architektura kodu

### 4.1 Server Action - `src/lib/actions/subscription.ts`

```typescript
'use server'

import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import type {
  Subscription,
  SubscriptionPlan,
  SubscriptionHistory,
  PremiumFeatures,
  PLAN_FEATURES,
} from '@/types/subscription'

/**
 * Pobiera subskrypcję aktualnego użytkownika
 */
export async function getSubscription(): Promise<
  { data: Subscription | null } | { error: string }
> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: 'Nie jesteś zalogowany' }
  }

  const { data, error } = await supabase
    .from('subscriptions')
    .select('*')
    .eq('user_id', user.id)
    .single()

  if (error && error.code !== 'PGRST116') {
    return { error: error.message }
  }

  return { data }
}

/**
 * Sprawdza czy użytkownik ma dostęp do funkcji premium
 */
export async function checkFeatureAccess(
  feature: keyof PremiumFeatures
): Promise<boolean> {
  const result = await getSubscription()
  if ('error' in result || !result.data) {
    return PLAN_FEATURES.free[feature] as boolean
  }

  const plan = result.data.plan
  const isActive =
    result.data.status === 'active' || result.data.status === 'trial'

  if (!isActive) {
    return PLAN_FEATURES.free[feature] as boolean
  }

  return PLAN_FEATURES[plan][feature] as boolean
}

/**
 * Pobiera historię subskrypcji użytkownika
 */
export async function getSubscriptionHistory(): Promise<
  { data: SubscriptionHistory[] } | { error: string }
> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: 'Nie jesteś zalogowany' }
  }

  const { data, error } = await supabase
    .from('subscription_history')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })

  if (error) {
    return { error: error.message }
  }

  return { data: data ?? [] }
}

/**
 * Tworzy lub aktualizuje subskrypcję (tylko dla webhooków - service_role)
 */
export async function upsertSubscription(
  userId: string,
  subscriptionData: Partial<Subscription>
): Promise<{ data: Subscription } | { error: string }> {
  const supabase = createServiceClient()

  const { data, error } = await supabase
    .from('subscriptions')
    .upsert({
      user_id: userId,
      ...subscriptionData,
      updated_at: new Date().toISOString(),
    })
    .select()
    .single()

  if (error) {
    return { error: error.message }
  }

  return { data }
}

/**
 * Zapisuje wydarzenie w historii subskrypcji
 */
export async function logSubscriptionEvent(
  subscriptionId: string,
  userId: string,
  eventType: SubscriptionHistory['event_type'],
  fromPlan?: SubscriptionPlan,
  toPlan?: SubscriptionPlan,
  metadata?: Record<string, unknown>
): Promise<{ success: boolean } | { error: string }> {
  const supabase = createServiceClient()

  const { error } = await supabase.from('subscription_history').insert({
    subscription_id: subscriptionId,
    user_id: userId,
    event_type: eventType,
    from_plan: fromPlan,
    to_plan: toPlan,
    metadata: metadata ?? {},
  })

  if (error) {
    return { error: error.message }
  }

  return { success: true }
}
```

### 4.2 Hook - `src/hooks/useSubscription.ts`

```typescript
'use client'

import { useQuery } from '@tanstack/react-query'
import { getSubscription } from '@/lib/actions/subscription'
import {
  PLAN_FEATURES,
  type PremiumFeatures,
  type Subscription,
  type SubscriptionPlan,
} from '@/types/subscription'

export interface UseSubscriptionReturn {
  subscription: Subscription | null | undefined
  plan: SubscriptionPlan
  isPremium: boolean
  isTrialing: boolean
  isCanceled: boolean
  isExpired: boolean
  features: PremiumFeatures
  daysUntilExpiry: number | null
  isLoading: boolean
  error: Error | null
  refetch: () => void
}

export function useSubscription(): UseSubscriptionReturn {
  const query = useQuery({
    queryKey: ['subscription'],
    queryFn: async () => {
      const result = await getSubscription()
      if ('error' in result) {
        throw new Error(result.error)
      }
      return result.data
    },
    staleTime: 5 * 60 * 1000, // 5 minut cache
    gcTime: 10 * 60 * 1000, // 10 minut w garbage collection
  })

  const subscription = query.data
  const plan: SubscriptionPlan = subscription?.plan ?? 'free'
  const status = subscription?.status

  const isPremium = plan !== 'free' && status === 'active'
  const isTrialing = status === 'trial'
  const isCanceled = status === 'canceled'
  const isExpired = status === 'expired'

  const features: PremiumFeatures = PLAN_FEATURES[plan]

  // Oblicz dni do wygaśnięcia
  let daysUntilExpiry: number | null = null
  if (subscription?.current_period_end) {
    const endDate = new Date(subscription.current_period_end)
    const now = new Date()
    const diffTime = endDate.getTime() - now.getTime()
    daysUntilExpiry = Math.ceil(diffTime / (1000 * 60 * 60 * 24))
  }

  return {
    subscription,
    plan,
    isPremium,
    isTrialing,
    isCanceled,
    isExpired,
    features,
    daysUntilExpiry,
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
  }
}

/**
 * Hook do sprawdzania pojedynczej funkcji premium
 */
export function usePremiumFeature(feature: keyof PremiumFeatures): boolean {
  const { features } = useSubscription()
  return Boolean(features[feature])
}
```

### 4.3 Query Keys - dodać do `src/lib/react-query/keys.ts`

```typescript
export const subscriptionKeys = {
  all: ['subscription'] as const,
  history: () => [...subscriptionKeys.all, 'history'] as const,
}
```

---

## 5. Integracja płatności

### 5.1 Porównanie providerów

| Provider         | Zalety                                            | Wady                              | Rekomendacja     |
| ---------------- | ------------------------------------------------- | --------------------------------- | ---------------- |
| **Stripe**       | Najpopularniejszy, świetna dokumentacja, webhooks | Wymaga własnego backendu          | ✅ Rekomendowany |
| **Paddle**       | Obsługuje VAT automatycznie, MoR                  | Mniej elastyczny, wyższe prowizje | Dla EU           |
| **LemonSqueezy** | Prosty, dobry dla indie                           | Mniejszy ekosystem                | Dla MVP          |

### 5.2 Zmienne środowiskowe

```bash
# .env.local - dodać
STRIPE_SECRET_KEY=sk_test_xxx
STRIPE_PUBLISHABLE_KEY=pk_test_xxx
STRIPE_WEBHOOK_SECRET=whsec_xxx
STRIPE_PREMIUM_MONTHLY_PRICE_ID=price_xxx
STRIPE_PREMIUM_YEARLY_PRICE_ID=price_xxx
```

### 5.3 Webhook handler - `app/api/webhooks/stripe/route.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import {
  upsertSubscription,
  logSubscriptionEvent,
} from '@/lib/actions/subscription'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2024-12-18.acacia',
})

export async function POST(req: NextRequest) {
  const body = await req.text()
  const signature = req.headers.get('stripe-signature')

  if (!signature) {
    return NextResponse.json(
      { error: 'Missing stripe-signature header' },
      { status: 400 }
    )
  }

  let event: Stripe.Event

  try {
    event = stripe.webhooks.constructEvent(
      body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET!
    )
  } catch (err) {
    console.error('Webhook signature verification failed:', err)
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        await handleCheckoutCompleted(
          event.data.object as Stripe.Checkout.Session
        )
        break
      }

      case 'customer.subscription.updated': {
        await handleSubscriptionUpdated(
          event.data.object as Stripe.Subscription
        )
        break
      }

      case 'customer.subscription.deleted': {
        await handleSubscriptionDeleted(
          event.data.object as Stripe.Subscription
        )
        break
      }

      case 'invoice.payment_failed': {
        await handlePaymentFailed(event.data.object as Stripe.Invoice)
        break
      }
    }

    return NextResponse.json({ received: true })
  } catch (error) {
    console.error('Webhook handler error:', error)
    return NextResponse.json(
      { error: 'Webhook handler failed' },
      { status: 500 }
    )
  }
}

async function handleCheckoutCompleted(session: Stripe.Checkout.Session) {
  const userId = session.metadata?.user_id
  if (!userId) {
    throw new Error('Missing user_id in session metadata')
  }

  const subscription = await stripe.subscriptions.retrieve(
    session.subscription as string
  )

  const plan =
    (session.metadata?.plan as 'premium' | 'premium_yearly') ?? 'premium'

  const result = await upsertSubscription(userId, {
    plan,
    status: 'active',
    external_customer_id: session.customer as string,
    external_subscription_id: subscription.id,
    current_period_start: new Date(
      subscription.current_period_start * 1000
    ).toISOString(),
    current_period_end: new Date(
      subscription.current_period_end * 1000
    ).toISOString(),
  })

  if ('data' in result) {
    await logSubscriptionEvent(
      result.data.id,
      userId,
      'created',
      'free',
      plan,
      { stripe_session_id: session.id }
    )
  }
}

async function handleSubscriptionUpdated(subscription: Stripe.Subscription) {
  // TODO: Implementacja aktualizacji subskrypcji
}

async function handleSubscriptionDeleted(subscription: Stripe.Subscription) {
  // TODO: Implementacja usunięcia subskrypcji
}

async function handlePaymentFailed(invoice: Stripe.Invoice) {
  // TODO: Implementacja obsługi nieudanej płatności
}
```

### 5.4 Checkout API - `app/api/checkout/route.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { createClient } from '@/lib/supabase/server'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2024-12-18.acacia',
})

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json(
      { error: 'Nie jesteś zalogowany' },
      { status: 401 }
    )
  }

  const { plan } = await req.json()

  const priceId =
    plan === 'premium_yearly'
      ? process.env.STRIPE_PREMIUM_YEARLY_PRICE_ID
      : process.env.STRIPE_PREMIUM_MONTHLY_PRICE_ID

  try {
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      payment_method_types: ['card', 'blik', 'p24'],
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard?subscription=success`,
      cancel_url: `${process.env.NEXT_PUBLIC_APP_URL}/pricing?subscription=canceled`,
      customer_email: user.email,
      metadata: {
        user_id: user.id,
        plan,
      },
      locale: 'pl',
    })

    return NextResponse.json({ url: session.url })
  } catch (error) {
    console.error('Stripe checkout error:', error)
    return NextResponse.json(
      { error: 'Nie udało się utworzyć sesji płatności' },
      { status: 500 }
    )
  }
}
```

---

## 6. Ochrona funkcji Premium

### 6.1 Komponent `PremiumGate`

```tsx
// src/components/shared/PremiumGate.tsx
'use client'

import { useSubscription } from '@/hooks/useSubscription'
import type { PremiumFeatures } from '@/types/subscription'
import { Button } from '@/components/ui/button'
import { Crown, Lock } from 'lucide-react'
import Link from 'next/link'

interface PremiumGateProps {
  feature: keyof PremiumFeatures
  children: React.ReactNode
  fallback?: React.ReactNode
  showUpgradePrompt?: boolean
}

export function PremiumGate({
  feature,
  children,
  fallback,
  showUpgradePrompt = true,
}: PremiumGateProps) {
  const { features, isLoading } = useSubscription()

  if (isLoading) {
    return <div className='h-20 animate-pulse rounded-lg bg-white/20' />
  }

  const hasAccess = features[feature]

  if (hasAccess) {
    return <>{children}</>
  }

  if (fallback) {
    return <>{fallback}</>
  }

  if (!showUpgradePrompt) {
    return null
  }

  return <UpgradePrompt feature={feature} />
}

interface UpgradePromptProps {
  feature: keyof PremiumFeatures
}

const FEATURE_NAMES: Record<keyof PremiumFeatures, string> = {
  maxRecipesPerWeek: 'Nieograniczone przepisy',
  customMealPlans: 'Własne plany posiłków',
  advancedNutrition: 'Zaawansowana analiza',
  exportShoppingList: 'Eksport listy zakupów',
  prioritySupport: 'Priorytetowe wsparcie',
  noAds: 'Brak reklam',
}

function UpgradePrompt({ feature }: UpgradePromptProps) {
  return (
    <div className='flex flex-col items-center justify-center rounded-xl border border-white/20 bg-white/10 p-6 backdrop-blur-md'>
      <div className='mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-amber-500/20'>
        <Lock className='h-6 w-6 text-amber-500' />
      </div>
      <h3 className='mb-2 text-lg font-semibold'>{FEATURE_NAMES[feature]}</h3>
      <p className='mb-4 text-center text-sm text-white/70'>
        Ta funkcja jest dostępna tylko dla użytkowników Premium
      </p>
      <Button asChild className='bg-amber-500 hover:bg-amber-600'>
        <Link href='/pricing'>
          <Crown className='mr-2 h-4 w-4' />
          Przejdź na Premium
        </Link>
      </Button>
    </div>
  )
}
```

### 6.2 Komponent `PremiumBadge`

```tsx
// src/components/shared/PremiumBadge.tsx
'use client'

import { useSubscription } from '@/hooks/useSubscription'
import { Crown } from 'lucide-react'
import { cn } from '@/lib/utils'

interface PremiumBadgeProps {
  className?: string
  showIfFree?: boolean
}

export function PremiumBadge({
  className,
  showIfFree = false,
}: PremiumBadgeProps) {
  const { isPremium, isTrialing, plan } = useSubscription()

  if (!isPremium && !isTrialing && !showIfFree) {
    return null
  }

  if (!isPremium && !isTrialing) {
    return (
      <span
        className={cn(
          'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs',
          'bg-gray-500/20 text-gray-400',
          className
        )}
      >
        Free
      </span>
    )
  }

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium',
        'bg-gradient-to-r from-amber-500 to-orange-500 text-white',
        className
      )}
    >
      <Crown className='h-3 w-3' />
      {isTrialing
        ? 'Trial'
        : plan === 'premium_yearly'
          ? 'Premium Roczny'
          : 'Premium'}
    </span>
  )
}
```

### 6.3 Server-side sprawdzanie (middleware)

```typescript
// src/lib/utils/check-premium.ts
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export async function requirePremium() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/auth/login')
  }

  const { data: isPremium } = await supabase.rpc('is_user_premium', {
    user_uuid: user.id,
  })

  if (!isPremium) {
    redirect('/pricing?required=premium')
  }

  return user
}

// Użycie w Server Component:
// export default async function PremiumPage() {
//   await requirePremium();
//   return <div>Premium content</div>;
// }
```

---

## 7. Checklist implementacji

### Faza 1: Baza danych

- [ ] Utworzenie migracji dla typów ENUM
- [ ] Utworzenie tabeli `subscriptions`
- [ ] Utworzenie tabeli `subscription_history`
- [ ] Konfiguracja polityk RLS
- [ ] Utworzenie funkcji `is_user_premium()`
- [ ] Aktualizacja `database.types.ts`

### Faza 2: Backend

- [ ] Utworzenie typu `Subscription` w TypeScript
- [ ] Implementacja Server Actions (subscription.ts)
- [ ] Konfiguracja konta Stripe
- [ ] Utworzenie produktów i cen w Stripe
- [ ] Implementacja webhook handler
- [ ] Implementacja checkout API

### Faza 3: Frontend

- [ ] Utworzenie hooka `useSubscription`
- [ ] Utworzenie komponentu `PremiumGate`
- [ ] Utworzenie komponentu `PremiumBadge`
- [ ] Utworzenie strony `/pricing`
- [ ] Integracja badge w headerze użytkownika
- [ ] Ochrona funkcji premium w aplikacji

### Faza 4: Testowanie

- [ ] Testy jednostkowe Server Actions
- [ ] Testy integracyjne webhooków (Stripe CLI)
- [ ] Testy E2E procesu zakupu
- [ ] Testowanie edge cases (wygaśnięcie, anulowanie)

### Faza 5: Wdrożenie

- [ ] Konfiguracja zmiennych środowiskowych produkcyjnych
- [ ] Konfiguracja webhooków Stripe dla produkcji
- [ ] Monitoring i alerty
- [ ] Dokumentacja dla użytkowników

---

## Uwagi implementacyjne

1. **Stripe Test Mode**: Podczas developmentu używaj kluczy testowych i Stripe CLI do testowania webhooków lokalnie.

2. **Cache invalidation**: Po każdej zmianie subskrypcji (webhook) należy zinwalidować cache TanStack Query.

3. **Graceful degradation**: Jeśli nie uda się pobrać statusu subskrypcji, traktuj użytkownika jako free.

4. **BLIK/P24**: Stripe obsługuje polskie metody płatności - włącz je w dashboardzie.

5. **Podatki VAT**: Rozważ użycie Stripe Tax lub Paddle (MoR) dla automatycznej obsługi VAT w EU.

import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import { createServerClient } from '@/lib/supabase/server'
import { PantryPageClient } from '@/components/pantry'

export const metadata = {
  title: 'Moje produkty | LowCarb Planer',
  description:
    'Zarządzaj dostępnymi składnikami w lodówce, zamrażarce i spiżarni',
}

function PantrySkeleton() {
  return (
    <div className='space-y-6'>
      {/* Nagłówek skeleton */}
      <div className='flex items-center justify-between'>
        <div className='space-y-2'>
          <div className='h-7 w-48 animate-pulse rounded-lg bg-white/40' />
          <div className='h-4 w-64 animate-pulse rounded-lg bg-white/30' />
        </div>
        <div className='h-10 w-32 animate-pulse rounded-lg bg-white/40' />
      </div>

      {/* Lista skeleton */}
      <div className='rounded-2xl border-2 border-white bg-white/40 p-6 backdrop-blur-xl'>
        <div className='mb-4 flex gap-3'>
          <div className='h-10 flex-1 animate-pulse rounded-lg bg-white/40' />
          <div className='h-10 w-44 animate-pulse rounded-lg bg-white/40' />
        </div>
        <div className='grid gap-3 sm:grid-cols-2 lg:grid-cols-3'>
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div
              key={i}
              className='h-24 animate-pulse rounded-xl border-2 border-white bg-white/40'
            />
          ))}
        </div>
      </div>
    </div>
  )
}

export default async function PantryPage() {
  const supabase = await createServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/auth/login?redirect=/pantry')
  }

  return (
    <Suspense fallback={<PantrySkeleton />}>
      <PantryPageClient />
    </Suspense>
  )
}

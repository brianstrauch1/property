'use client'

import { useEffect, useState } from 'react'
import { createBrowserClient } from '@supabase/auth-helpers-nextjs'
import { useRouter } from 'next/navigation'

export default function Dashboard() {
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  const [user, setUser] = useState<any>(null)
  const router = useRouter()

  useEffect(() => {
    const checkUser = async () => {
      const { data } = await supabase.auth.getUser()
      if (!data.user) {
        router.push('/')
      } else {
        setUser(data.user)
      }
    }

    checkUser()
  }, [])

  const signOut = async () => {
    await supabase.auth.signOut()
    router.push('/')
  }

  if (!user) return <div className="p-8">Loading...</div>

  return (
    <main className="min-h-screen bg-slate-100 p-8">
      <div className="bg-white p-6 rounded-xl shadow-md">
        <h1 className="text-2xl font-bold mb-4">
          Welcome to Property Dashboard
        </h1>

        <p className="mb-4">Logged in as: {user.email}</p>

        <button
          onClick={signOut}
          className="bg-indigo-600 text-white px-4 py-2 rounded"
        >
          Sign Out
        </button>
      </div>
    </main>
  )
}
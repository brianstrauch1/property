'use client'

import { useState } from 'react'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export default function Home() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [message, setMessage] = useState('')

  const signUp = async () => {
    const { error } = await supabase.auth.signUp({
      email,
      password
    })
    if (error) setMessage(error.message)
    else setMessage('Check your email to confirm.')
  }

  const signIn = async () => {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password
    })
    if (error) setMessage(error.message)
    else setMessage('Logged in!')
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-100">
      <div className="bg-white p-8 rounded-xl shadow-md w-96">
        <h1 className="text-2xl font-bold text-slate-800 mb-4">
          Property Login
        </h1>

        <input
          type="email"
          placeholder="Email"
          className="w-full p-2 mb-3 border rounded"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />

        <input
          type="password"
          placeholder="Password"
          className="w-full p-2 mb-3 border rounded"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />

        <button
          onClick={signIn}
          className="w-full bg-indigo-600 text-white p-2 rounded mb-2"
        >
          Sign In
        </button>

        <button
          onClick={signUp}
          className="w-full bg-slate-700 text-white p-2 rounded"
        >
          Sign Up
        </button>

        {message && (
          <p className="text-sm text-slate-600 mt-3">{message}</p>
        )}
      </div>
    </main>
  )
}
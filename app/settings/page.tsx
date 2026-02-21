'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabaseBrowser } from '@/lib/supabase-browser'

export default function SettingsPage() {
  const supabase = supabaseBrowser()
  const router = useRouter()

  const [property, setProperty] = useState<any>(null)
  const [name, setName] = useState('')
  const [address, setAddress] = useState('')
  const [status, setStatus] = useState('')

  useEffect(() => {
    const init = async () => {
      const { data: userData } = await supabase.auth.getUser()
      if (!userData.user) {
        router.push('/')
        return
      }

      const { data: prop } = await supabase
        .from('properties')
        .select('*')
        .limit(1)
        .single()

      if (!prop) return

      setProperty(prop)
      setName(prop.name)
      setAddress(prop.address)
    }

    init()
  }, [])

  const save = async () => {
    if (!property) return

    setStatus('Saving...')

    const { error } = await supabase
      .from('properties')
      .update({
        name: name.trim(),
        address: address.trim()
      })
      .eq('id', property.id)

    if (error) {
      setStatus(error.message)
      return
    }

    setStatus('Saved ✓')
    setTimeout(() => setStatus(''), 1500)
  }

  if (!property) return <div className="p-8">Loading...</div>

  return (
    <main className="min-h-screen bg-slate-100 p-8">
      <TopNav />

      <div className="bg-white p-6 rounded-xl shadow-md">
        <h1 className="text-2xl font-bold mb-4">Property Settings</h1>

        <div className="space-y-3">
          <input
            className="border p-2 rounded w-full"
            value={name}
            onChange={e => setName(e.target.value)}
          />

          <input
            className="border p-2 rounded w-full"
            value={address}
            onChange={e => setAddress(e.target.value)}
          />

          <button
            onClick={save}
            className="bg-indigo-600 text-white px-4 py-2 rounded"
          >
            Save
          </button>

          {status && (
            <div className="text-sm text-slate-600">{status}</div>
          )}
        </div>
      </div>
    </main>
  )
}

function TopNav() {
  return (
    <div className="flex gap-4 mb-6">
      <Link href="/dashboard">Locations</Link>
      <Link href="/inventory">Inventory</Link>
      <Link href="/settings" className="font-semibold">Settings</Link>
    </div>
  )
}
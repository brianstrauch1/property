'use client'

import { useEffect, useState } from 'react'
import { supabaseBrowser } from '@/lib/supabase-browser'

type PropertyMember = {
  property_id: string
}

type PropertyRow = {
  id: string
  name: string | null
  address: string | null
}

export default function SettingsPage() {
  const supabase = supabaseBrowser()

  const [loading, setLoading] = useState(true)
  const [property, setProperty] = useState<PropertyRow | null>(null)
  const [propName, setPropName] = useState('')
  const [propAddress, setPropAddress] = useState('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    load()
  }, [])

  async function load() {
    setLoading(true)
    setError(null)

    try {
      const sessionResult = await supabase.auth.getSession()
      if (sessionResult.error) throw sessionResult.error

      const session = sessionResult.data.session
      if (!session?.user) return

      const userId = session.user.id

      // 🔹 Get membership safely typed
      const membershipResult = await supabase
        .from('property_members')
        .select('property_id')
        .eq('user_id', userId)
        .limit(1)

      if (membershipResult.error) throw membershipResult.error

      const membership =
        membershipResult.data as PropertyMember[] | null

      const propertyId =
        membership && membership.length > 0
          ? membership[0].property_id
          : null

      if (!propertyId) return

      // 🔹 Get property WITHOUT using .single()
      const propertyResult = await supabase
        .from('properties')
        .select('id, name, address')
        .eq('id', propertyId)
        .limit(1)

      if (propertyResult.error) throw propertyResult.error

      const prop =
        propertyResult.data && propertyResult.data.length > 0
          ? (propertyResult.data[0] as PropertyRow)
          : null

      if (!prop?.id) return

      setProperty(prop)
      setPropName(prop.name ?? '')
      setPropAddress(prop.address ?? '')
    } catch (err: any) {
      console.error('SETTINGS LOAD ERROR:', err)
      setError(err.message || 'Failed to load settings')
    } finally {
      setLoading(false)
    }
  }

  async function save() {
    if (!property) return

    const { error } = await supabase
      .from('properties')
      .update({
        name: propName,
        address: propAddress
      })
      .eq('id', property.id)

    if (error) {
      alert(error.message)
      return
    }

    alert('Saved successfully')
  }

  if (loading) return <div className="p-8">Loading...</div>
  if (error) return <div className="p-8 text-red-600">{error}</div>

  return (
    <div className="p-8 space-y-6">
      <h1 className="text-2xl font-bold">Settings</h1>

      <div className="space-y-4 max-w-xl">
        <div>
          <label className="block text-sm font-medium mb-1">
            Property Name
          </label>
          <input
            className="w-full border rounded p-2"
            value={propName}
            onChange={e => setPropName(e.target.value)}
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">
            Address
          </label>
          <input
            className="w-full border rounded p-2"
            value={propAddress}
            onChange={e => setPropAddress(e.target.value)}
          />
        </div>

        <button
          onClick={save}
          className="bg-indigo-600 text-white px-4 py-2 rounded"
        >
          Save Changes
        </button>
      </div>
    </div>
  )
}
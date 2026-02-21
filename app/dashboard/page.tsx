'use client'

import { useEffect, useState } from 'react'
import { createBrowserClient } from '@supabase/auth-helpers-nextjs'
import { useRouter } from 'next/navigation'

export default function Dashboard() {
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  const router = useRouter()

  const [user, setUser] = useState<any>(null)
  const [property, setProperty] = useState<any>(null)
  const [locations, setLocations] = useState<any[]>([])
  const [newLocation, setNewLocation] = useState('')
  const [parentId, setParentId] = useState<string | null>(null)

  useEffect(() => {
    const init = async () => {
      const { data: userData } = await supabase.auth.getUser()

      if (!userData.user) {
        router.push('/')
        return
      }

      setUser(userData.user)

      const { data: propertyData } = await supabase
        .from('properties')
        .select('*')
        .limit(1)
        .single()

      setProperty(propertyData)

      if (propertyData) {
        const { data: locationData } = await supabase
          .from('locations')
          .select('*')
          .eq('property_id', propertyData.id)

        setLocations(locationData || [])
      }
    }

    init()
  }, [])

  const createLocation = async () => {
    if (!newLocation || !property) return

    const { data } = await supabase
      .from('locations')
      .insert([
        {
          name: newLocation,
          type: 'location',
          property_id: property.id,
          parent_id: parentId
        }
      ])
      .select()
      .single()

    if (data) {
      setLocations([...locations, data])
      setNewLocation('')
      setParentId(null)
    }
  }

  const renderTree = (parent: string | null, level = 0) => {
    return locations
      .filter((loc) => loc.parent_id === parent)
      .map((loc) => (
        <div key={loc.id} style={{ marginLeft: level * 20 }}>
          <div className="py-1">
            {loc.name}
          </div>
          {renderTree(loc.id, level + 1)}
        </div>
      ))
  }

  const signOut = async () => {
    await supabase.auth.signOut()
    router.push('/')
  }

  if (!user || !property) return <div className="p-8">Loading...</div>

  return (
    <main className="min-h-screen bg-slate-100 p-8">
      <div className="bg-white p-6 rounded-xl shadow-md mb-6">
        <h1 className="text-2xl font-bold">
          {property.name}
        </h1>
        <p className="text-slate-600 mb-4">
          {property.address}
        </p>

        <button
          onClick={signOut}
          className="bg-indigo-600 text-white px-4 py-2 rounded"
        >
          Sign Out
        </button>
      </div>

      <div className="bg-white p-6 rounded-xl shadow-md">
        <h2 className="text-xl font-semibold mb-4">
          Location Hierarchy
        </h2>

        <div className="flex gap-2 mb-4">
          <input
            type="text"
            placeholder="New location"
            value={newLocation}
            onChange={(e) => setNewLocation(e.target.value)}
            className="border p-2 rounded w-full"
          />

          <select
            value={parentId || ''}
            onChange={(e) => setParentId(e.target.value || null)}
            className="border p-2 rounded"
          >
            <option value="">Root Level</option>
            {locations.map((loc) => (
              <option key={loc.id} value={loc.id}>
                {loc.name}
              </option>
            ))}
          </select>

          <button
            onClick={createLocation}
            className="bg-slate-700 text-white px-4 rounded"
          >
            Add
          </button>
        </div>

        <div>
          {renderTree(null)}
        </div>
      </div>
    </main>
  )
}
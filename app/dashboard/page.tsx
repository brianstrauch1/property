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

  useEffect(() => {
    const init = async () => {
      const { data: userData } = await supabase.auth.getUser()

      if (!userData.user) {
        router.push('/')
        return
      }

      setUser(userData.user)

      // Get property
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
          type: 'room',
          property_id: property.id
        }
      ])
      .select()
      .single()

    if (data) {
      setLocations([...locations, data])
      setNewLocation('')
    }
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
          Locations
        </h2>

        <div className="flex gap-2 mb-4">
          <input
            type="text"
            placeholder="Add room (e.g., Kitchen)"
            value={newLocation}
            onChange={(e) => setNewLocation(e.target.value)}
            className="border p-2 rounded w-full"
          />
          <button
            onClick={createLocation}
            className="bg-slate-700 text-white px-4 rounded"
          >
            Add
          </button>
        </div>

        <ul>
          {locations.map((loc) => (
            <li key={loc.id} className="border-b py-2">
              {loc.name}
            </li>
          ))}
        </ul>
      </div>
    </main>
  )
}
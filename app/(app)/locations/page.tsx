'use client'

import { useEffect, useState } from 'react'
import { supabaseBrowser } from '@/lib/supabase-browser'

type PropertyMember = {
  property_id: string
}

type Location = {
  id: string
  name: string
  parent_id: string | null
}

export default function LocationsPage() {
  const supabase = supabaseBrowser()

  const [loading, setLoading] = useState(true)
  const [locations, setLocations] = useState<Location[]>([])
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

      if (!session?.user) {
        setLocations([])
        return
      }

      const userId = session.user.id

      const membershipResult = await supabase
        .from('property_members')
        .select('property_id')
        .eq('user_id', userId)
        .limit(1)

      if (membershipResult.error) throw membershipResult.error

      const membership = membershipResult.data as PropertyMember[] | null

      const propertyId =
        membership && membership.length > 0
          ? membership[0].property_id
          : null

      if (!propertyId) {
        setLocations([])
        return
      }

      const locationsResult = await supabase
        .from('locations')
        .select('id, name, parent_id')
        .eq('property_id', propertyId)
        .order('created_at', { ascending: true })

      if (locationsResult.error) throw locationsResult.error

      setLocations((locationsResult.data as Location[]) ?? [])
    } catch (err: any) {
      console.error('LOCATIONS LOAD ERROR:', err)
      setError(err.message || 'Failed to load locations')
    } finally {
      setLoading(false)
    }
  }

  if (loading) return <div className="p-8">Loading...</div>
  if (error) return <div className="p-8 text-red-600">{error}</div>

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold mb-4">Locations</h1>

      {locations.length === 0 ? (
        <div>No locations found.</div>
      ) : (
        <ul className="space-y-2">
          {locations.map(l => (
            <li key={l.id} className="border p-2 rounded">
              {l.name}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
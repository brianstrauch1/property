'use client'
export const dynamic = 'force-dynamic'

import { useEffect, useState } from 'react'
import { supabaseBrowser } from '@/lib/supabase-browser'

type PropertyMember = {
  property_id: string
}

type Item = {
  id: string
  name: string
  location_id: string
}

export default function InventoryPage() {
  const supabase = supabaseBrowser()

  const [loading, setLoading] = useState(true)
  const [items, setItems] = useState<Item[]>([])
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
        setItems([])
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
        setItems([])
        return
      }

      const itemsResult = await supabase
        .from('items')
        .select('id, name, location_id')
        .eq('property_id', propertyId)
        .order('created_at', { ascending: false })

      if (itemsResult.error) throw itemsResult.error

      setItems((itemsResult.data as Item[]) ?? [])
    } catch (err: any) {
      console.error('INVENTORY LOAD ERROR:', err)
      setError(err.message || 'Failed to load inventory')
    } finally {
      setLoading(false)
    }
  }

  if (loading) return <div className="p-8">Loading...</div>
  if (error) return <div className="p-8 text-red-600">{error}</div>

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold mb-4">Inventory</h1>

      {items.length === 0 ? (
        <div>No items found.</div>
      ) : (
        <ul className="space-y-2">
          {items.map(i => (
            <li key={i.id} className="border p-2 rounded">
              {i.name}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
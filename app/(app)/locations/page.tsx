'use client'

import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { supabase } from '@/lib/supabase/client'

interface Location {
  id: string
  name: string
  parent_id: string | null
  property_id: string
  sort_order: number | null
}

export default function LocationsPage() {
  const [locations, setLocations] = useState<Location[]>([])
  const [propertyId, setPropertyId] = useState<string | null>(null)
  const [newName, setNewName] = useState('')
  const [parentId, setParentId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    load()
  }, [])

  async function load() {
    setLoading(true)

    const { data: property } = await supabase
      .from('properties')
      .select('id')
      .limit(1)
      .single()

    if (!property) {
      setLoading(false)
      return
    }

    setPropertyId(property.id)

    const { data } = await supabase
      .from('locations')
      .select('*')
      .eq('property_id', property.id)
      .order('sort_order', { ascending: true })

    setLocations(data || [])
    setLoading(false)
  }

  async function addLocation() {
    if (!newName || !propertyId) return

    const nextOrder =
      locations.filter(l => l.parent_id === parentId).length

    await supabase.from('locations').insert({
      name: newName,
      parent_id: parentId,
      property_id: propertyId,
      sort_order: nextOrder
    })

    setNewName('')
    load()
  }

  async function deleteLocation(id: string) {
    const hasChildren = locations.some(l => l.parent_id === id)
    if (hasChildren) {
      alert('Cannot delete. Location has children.')
      return
    }

    await supabase.from('locations').delete().eq('id', id)
    load()
  }

function renderTree(parent: string | null, depth = 0): ReactNode[] {
  const children = locations.filter(l => l.parent_id === parent)

  return children.flatMap(child => [
    <div
      key={child.id}
      className="flex items-center justify-between py-2 hover:bg-slate-100 rounded px-2"
      style={{ marginLeft: depth * 20 }}
    >
      <span>{child.name}</span>
    </div>,
    ...renderTree(child.id, depth + 1)
  ])
}

  if (loading) return <div className="p-8">Loading...</div>

  return (
    <div className="p-8 space-y-6">
      <h1 className="text-2xl font-bold">Locations</h1>

      <div className="flex gap-3">
        <input
          className="border px-3 py-2 rounded w-64"
          placeholder="New Location"
          value={newName}
          onChange={e => setNewName(e.target.value)}
        />

        <select
          className="border px-3 py-2 rounded"
          value={parentId ?? ''}
          onChange={e => setParentId(e.target.value || null)}
        >
          <option value="">Root</option>
          {locations.map(l => (
            <option key={l.id} value={l.id}>
              {l.name}
            </option>
          ))}
        </select>

        <button
          onClick={addLocation}
          className="bg-indigo-600 text-white px-4 py-2 rounded"
        >
          Add
        </button>
      </div>

      <div className="border rounded p-4">
        {renderTree(null)}
      </div>
    </div>
  )
}
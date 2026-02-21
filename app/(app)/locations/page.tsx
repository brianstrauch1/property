'use client'

import { useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { supabase } from '@/lib/supabase/client'

interface Location {
  id: string
  name: string
  parent_id: string | null
  property_id: string
  sort_order: number | null
}

interface Item {
  id: string
  location_id: string
}

export default function LocationsPage() {
  const [locations, setLocations] = useState<Location[]>([])
  const [items, setItems] = useState<Item[]>([])
  const [propertyId, setPropertyId] = useState<string | null>(null)
  const [newName, setNewName] = useState('')
  const [parentId, setParentId] = useState<string | null>(null)

  useEffect(() => {
    load()
  }, [])

  async function load() {
    const { data: property } = await supabase
      .from('properties')
      .select('id')
      .limit(1)
      .single()

    if (!property) return

    setPropertyId(property.id)

    const { data: locs } = await supabase
      .from('locations')
      .select('*')
      .eq('property_id', property.id)
      .order('sort_order', { ascending: true })

    const { data: inv } = await supabase
      .from('items')
      .select('id, location_id')
      .eq('property_id', property.id)

    setLocations(locs || [])
    setItems(inv || [])
  }

  // Build hierarchy map safely (non-recursive)
  const locationMap = useMemo(() => {
    const map: Record<string, Location[]> = {}
    locations.forEach(loc => {
      const key = loc.parent_id ?? 'root'
      if (!map[key]) map[key] = []
      map[key].push(loc)
    })
    return map
  }, [locations])

  function getItemCount(locationId: string): number {
    const direct = items.filter(i => i.location_id === locationId).length
    const children = locationMap[locationId] || []
    return (
      direct +
      children.reduce(
        (sum, child) => sum + getItemCount(child.id),
        0
      )
    )
  }

  function renderBranch(parent: string | null, depth = 0): ReactNode[] {
    const branch = locationMap[parent ?? 'root'] || []

    return branch.flatMap(loc => [
      <div
        key={loc.id}
        className="flex justify-between items-center py-2 px-3 rounded hover:bg-slate-100"
        style={{
          marginLeft: depth * 20,
          backgroundColor:
            depth === 0
              ? '#f8fafc'
              : depth === 1
              ? '#eef2ff'
              : '#f1f5f9'
        }}
      >
        <div>
          {loc.name}{' '}
          <span className="text-sm text-slate-500">
            ({getItemCount(loc.id)})
          </span>
        </div>

        <button
          className="text-red-500 text-sm"
          onClick={() => deleteLocation(loc.id)}
        >
          Delete
        </button>
      </div>,

      ...renderBranch(loc.id, depth + 1)
    ])
  }

  async function addLocation() {
    if (!newName || !propertyId) return

    const siblingCount =
      (locationMap[parentId ?? 'root'] || []).length

    await supabase.from('locations').insert({
      name: newName,
      parent_id: parentId,
      property_id: propertyId,
      sort_order: siblingCount
    })

    setNewName('')
    load()
  }

  async function deleteLocation(id: string) {
    const count = getItemCount(id)
    if (count > 0) {
      alert('Cannot delete location with inventory.')
      return
    }

    await supabase.from('locations').delete().eq('id', id)
    load()
  }

  return (
    <div className="p-8 space-y-6">
      <h1 className="text-2xl font-bold">Locations</h1>

      <div className="flex gap-3">
        <input
          className="border px-3 py-2 rounded w-64"
          placeholder="Location Name"
          value={newName}
          onChange={e => setNewName(e.target.value)}
        />

        <select
          className="border px-3 py-2 rounded"
          value={parentId ?? ''}
          onChange={e =>
            setParentId(e.target.value || null)
          }
        >
          <option value="">Root</option>
          {locations.map(loc => (
            <option key={loc.id} value={loc.id}>
              {loc.name}
            </option>
          ))}
        </select>

        <button
          onClick={addLocation}
          className="bg-indigo-600 text-white px-4 py-2 rounded"
        >
          Add New Location
        </button>
      </div>

      <div className="border rounded p-4">
        {renderBranch(null)}
      </div>
    </div>
  )
}
'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase/client'

interface Location {
  id: string
  name: string
  parent_id: string | null
}

interface Item {
  id: string
  name: string
  location_id: string
  thumbnail_url: string | null
}

export default function InventoryPage() {
  const [locations, setLocations] = useState<Location[]>([])
  const [items, setItems] = useState<Item[]>([])
  const [selected, setSelected] = useState<string | null>(null)

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

    const { data: locs } = await supabase
      .from('locations')
      .select('*')
      .eq('property_id', property.id)

    const { data: inv } = await supabase
      .from('items')
      .select('*')
      .eq('property_id', property.id)

    setLocations(locs || [])
    setItems(inv || [])
  }

  function renderTree(parent: string | null, depth = 0): JSX.Element[] {
    const children = locations.filter(l => l.parent_id === parent)

    return children.flatMap(child => [
      <div
        key={child.id}
        className="cursor-pointer py-2"
        style={{ marginLeft: depth * 20 }}
        onClick={() => setSelected(child.id)}
      >
        {child.name}
      </div>,

      ...renderTree(child.id, depth + 1)
    ])
  }

  const visibleItems = items.filter(
    i => i.location_id === selected
  )

  return (
    <div className="p-8 space-y-6">
      <h1 className="text-2xl font-bold">Inventory</h1>

      <div className="grid grid-cols-2 gap-8">
        <div className="border rounded p-4">
          {renderTree(null)}
        </div>

        <div className="border rounded p-4 space-y-4">
          {visibleItems.map(item => (
            <div
              key={item.id}
              className="border rounded p-3 flex gap-3 items-center"
            >
              {item.thumbnail_url && (
                <img
                  src={item.thumbnail_url}
                  className="w-16 h-16 object-cover rounded"
                />
              )}

              <div>{item.name}</div>
            </div>
          ))}

          {!selected && (
            <div className="text-gray-500">
              Select a location
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
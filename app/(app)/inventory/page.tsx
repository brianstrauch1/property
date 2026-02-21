'use client'

import { useEffect, useMemo, useState } from 'react'
import { supabaseBrowser } from '@/lib/supabase-browser'
import EditItemModal, { InventoryItem } from '@/components/inventory/EditItemModal'

type LocationRow = {
  id: string
  name: string
  parent_id: string | null
  property_id: string
}

export default function InventoryPage() {
  const supabase = supabaseBrowser()

  const [propertyId, setPropertyId] = useState<string | null>(null)
  const [locations, setLocations] = useState<LocationRow[]>([])
  const [selectedLocations, setSelectedLocations] = useState<string[]>([])
  const [items, setItems] = useState<InventoryItem[]>([])
  const [editingItem, setEditingItem] = useState<InventoryItem | null>(null)

  /* ---------------- LOAD ---------------- */

  useEffect(() => {
    const init = async () => {
      const { data: prop } = await supabase
        .from('properties')
        .select('id')
        .limit(1)
        .single()

      if (!prop?.id) return
      setPropertyId(prop.id)

      const { data: locs } = await supabase
        .from('locations')
        .select('*')
        .eq('property_id', prop.id)

      setLocations(locs ?? [])
    }

    init()
  }, [])

  useEffect(() => {
    if (!propertyId || selectedLocations.length === 0) {
      setItems([])
      return
    }

    const loadItems = async () => {
      const { data } = await supabase
        .from('inventory_items')
        .select('*')
        .in('location_id', selectedLocations)

      setItems(data ?? [])
    }

    loadItems()
  }, [selectedLocations])

  /* ---------------- TREE ---------------- */

  const childrenMap = useMemo(() => {
    const map: Record<string, LocationRow[]> = {}
    for (const loc of locations) {
      if (!loc.parent_id) continue
      if (!map[loc.parent_id]) map[loc.parent_id] = []
      map[loc.parent_id].push(loc)
    }
    return map
  }, [locations])

  const roots = useMemo(() => {
    return locations.filter(l => !l.parent_id)
  }, [locations])

  const toggleLocation = (id: string) => {
    setSelectedLocations(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    )
  }

  function TreeNode({ node, depth }: { node: LocationRow; depth: number }) {
    const children = childrenMap[node.id] || []

    return (
      <div style={{ marginLeft: depth * 16 }}>
        <div className="flex items-center gap-2 py-1">
          <input
            type="checkbox"
            checked={selectedLocations.includes(node.id)}
            onChange={() => toggleLocation(node.id)}
          />
          <span>{node.name}</span>
        </div>
        {children.map(child => (
          <TreeNode key={child.id} node={child} depth={depth + 1} />
        ))}
      </div>
    )
  }

  /* ---------------- UI ---------------- */

  return (
    <main className="grid grid-cols-3 gap-6">
      <div className="bg-white p-6 rounded-xl shadow-md">
        <h2 className="font-bold mb-4">Locations</h2>
        {roots.map(root => (
          <TreeNode key={root.id} node={root} depth={0} />
        ))}
      </div>

      <div className="col-span-2 bg-white p-6 rounded-xl shadow-md">
        <h2 className="font-bold mb-4">Inventory</h2>

        {items.length === 0 && (
          <div className="text-slate-500">Select a location to view inventory.</div>
        )}

        <div className="grid grid-cols-3 gap-4">
          {items.map(item => (
            <div
              key={item.id}
              onClick={() => setEditingItem(item)}
              className="border rounded-lg p-3 hover:bg-slate-50 cursor-pointer"
            >
              <div className="font-semibold">{item.name}</div>
              <div className="text-sm text-slate-500">{item.vendor ?? '—'}</div>
              <div className="text-sm">
                {typeof item.price === 'number'
                  ? `$${item.price.toFixed(2)}`
                  : '—'}
              </div>
            </div>
          ))}
        </div>
      </div>

      {editingItem && (
        <EditItemModal
          item={editingItem}
          onClose={() => setEditingItem(null)}
          onUpdated={(updated) => {
            setItems(prev =>
              prev.map(i => (i.id === updated.id ? updated : i))
            )
            setEditingItem(null)
          }}
        />
      )}
    </main>
  )
}
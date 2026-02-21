'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabaseBrowser } from '@/lib/supabase-browser'

type LocationRow = {
  id: string
  name: string
  parent_id: string | null
  sort_order?: number | null
  property_id: string
}

export default function LocationsPage() {
  const supabase = supabaseBrowser()
  const router = useRouter()

  const [property, setProperty] = useState<{ id: string } | null>(null)
  const [locations, setLocations] = useState<LocationRow[]>([])
  const [expanded, setExpanded] = useState<string[]>([])

  const [showAddModal, setShowAddModal] = useState(false)
  const [newName, setNewName] = useState('')
  const [selectedParent, setSelectedParent] = useState<string | null>(null)

  useEffect(() => {
    const init = async () => {
      const { data: prop } = await supabase
        .from('properties')
        .select('id')
        .limit(1)
        .single()

      if (!prop?.id) return
      setProperty(prop)

      const { data: locs } = await supabase
        .from('locations')
        .select('*')
        .eq('property_id', prop.id)
        .order('sort_order')

      setLocations(locs ?? [])
    }

    init()
  }, [])

  const childrenMap = useMemo(() => {
    const map: Record<string, LocationRow[]> = {}
    locations.forEach(l => {
      if (!l.parent_id) return
      if (!map[l.parent_id]) map[l.parent_id] = []
      map[l.parent_id].push(l)
    })
    return map
  }, [locations])

  const roots = locations.filter(l => !l.parent_id)

  const depthColor = (depth: number) => {
    if (depth === 0) return 'border-l-4 border-indigo-600'
    if (depth === 1) return 'border-l-4 border-indigo-400 bg-indigo-50'
    if (depth === 2) return 'border-l-4 border-sky-400 bg-sky-50'
    return 'border-l-4 border-slate-400 bg-slate-50'
  }

  const createLocation = async () => {
    if (!property?.id) return
    if (!newName.trim()) return

    const { data } = await supabase
      .from('locations')
      .insert({
        name: newName.trim(),
        property_id: property.id,
        parent_id: selectedParent
      })
      .select('*')
      .single()

    if (data) {
      setLocations(prev => [...prev, data])
      setShowAddModal(false)
      setNewName('')
      setSelectedParent(null)
    }
  }

  const renderTree = (node: LocationRow, depth: number) => {
    const children = childrenMap[node.id] ?? []
    const isOpen = expanded.includes(node.id)

    return (
      <div key={node.id}>
        <div className={`p-3 rounded ${depthColor(depth)}`}>
          <div className="flex justify-between items-center">
            <div className="font-medium">{node.name}</div>
            <button
              onClick={() =>
                setExpanded(prev =>
                  prev.includes(node.id)
                    ? prev.filter(x => x !== node.id)
                    : [...prev, node.id]
                )
              }
            >
              {children.length > 0 ? (isOpen ? '−' : '+') : ''}
            </button>
          </div>
        </div>
        {isOpen &&
          children.map(child => renderTree(child, depth + 1))}
      </div>
    )
  }

  if (!property) return null

  return (
    <main className="space-y-6">
      <div className="bg-white p-6 rounded-xl shadow-md">
        <div className="flex justify-between items-center mb-4">
          <h1 className="text-2xl font-bold">Locations</h1>
          <button
            className="bg-indigo-600 text-white px-3 py-2 rounded-lg"
            onClick={() => setShowAddModal(true)}
          >
            + New Location
          </button>
        </div>

        {roots.map(root => renderTree(root, 0))}
      </div>

      {showAddModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center">
          <div className="bg-white rounded-xl p-6 w-[500px] space-y-4">
            <h2 className="text-lg font-bold">Add New Location</h2>

            <input
              placeholder="Location Name"
              value={newName}
              onChange={e => setNewName(e.target.value)}
              className="w-full border px-3 py-2 rounded"
            />

            <select
              value={selectedParent ?? ''}
              onChange={e =>
                setSelectedParent(e.target.value || null)
              }
              className="w-full border px-3 py-2 rounded"
            >
              <option value="">Root Level</option>
              {locations.map(l => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>

            <div className="flex justify-end gap-2">
              <button onClick={() => setShowAddModal(false)}>
                Cancel
              </button>
              <button
                className="bg-indigo-600 text-white px-3 py-2 rounded"
                onClick={createLocation}
              >
                Create
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  )
}
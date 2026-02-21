'use client'

import { useEffect, useState } from 'react'
import { supabaseBrowser } from '@/lib/supabase-browser'
import {
  DndContext,
  closestCenter,
  useDraggable,
  useDroppable,
  DragEndEvent
} from '@dnd-kit/core'
import { CSS } from '@dnd-kit/utilities'

type Location = {
  id: string
  name: string
  parent_id: string | null
  property_id: string
}

type Item = {
  id: string
  location_id: string
}

export default function LocationsPage() {
  const supabase = supabaseBrowser()

  const [locations, setLocations] = useState<Location[]>([])
  const [items, setItems] = useState<Item[]>([])
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const [propertyId, setPropertyId] = useState<string | null>(null)
  const [newLocationName, setNewLocationName] = useState('')
  const [newParentId, setNewParentId] = useState<string | null>(null)

  useEffect(() => {
    load()
  }, [])

  async function load() {
    const { data: property } = await supabase
      .from('properties')
      .select('id')
      .single()

    if (!property) return

    setPropertyId(property.id)

    const { data: locs } = await supabase
      .from('locations')
      .select('*')
      .eq('property_id', property.id)
      .order('name')

    const { data: inv } = await supabase
      .from('items')
      .select('id, location_id')
      .eq('property_id', property.id)

    setLocations(locs || [])
    setItems(inv || [])
  }

  function childrenOf(parentId: string | null) {
    return locations.filter(l => l.parent_id === parentId)
  }

  function itemCount(locationId: string) {
    const allChildren = getAllChildren(locationId)
    return items.filter(i => i.location_id === locationId || allChildren.includes(i.location_id)).length
  }

  function getAllChildren(parentId: string): string[] {
    const direct = locations.filter(l => l.parent_id === parentId)
    let ids: string[] = []
    direct.forEach(child => {
      ids.push(child.id)
      ids = [...ids, ...getAllChildren(child.id)]
    })
    return ids
  }

  async function createLocation() {
    if (!newLocationName || !propertyId) return

    await supabase.from('locations').insert({
      name: newLocationName,
      parent_id: newParentId,
      property_id: propertyId
    })

    setNewLocationName('')
    setNewParentId(null)
    load()
  }

  async function deleteLocation(id: string) {
    const count = itemCount(id)
    if (count > 0) {
      alert('Cannot delete location with inventory items.')
      return
    }

    await supabase.from('locations').delete().eq('id', id)
    load()
  }

  function toggle(id: string) {
    setExpanded(prev => ({ ...prev, [id]: !prev[id] }))
  }

  function renderTree(parentId: string | null, depth = 0) {
    return childrenOf(parentId).map(node => (
      <TreeRow
        key={node.id}
        node={node}
        depth={depth}
        expanded={expanded[node.id]}
        toggle={() => toggle(node.id)}
        itemCount={itemCount(node.id)}
        onDelete={() => deleteLocation(node.id)}
      >
        {expanded[node.id] && renderTree(node.id, depth + 1)}
      </TreeRow>
    ))
  }

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <div className="bg-white shadow rounded-xl p-6">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-semibold">Locations</h1>
          <button
            onClick={() => setNewParentId(null)}
            className="bg-indigo-600 text-white px-4 py-2 rounded-lg"
          >
            + New Location
          </button>
        </div>

        {/* Add Location Inline Panel */}
        {newParentId !== undefined && (
          <div className="mb-6 bg-slate-50 p-4 rounded-lg border">
            <div className="flex gap-3">
              <input
                value={newLocationName}
                onChange={e => setNewLocationName(e.target.value)}
                placeholder="Location Name"
                className="border rounded px-3 py-2 flex-1"
              />
              <select
                value={newParentId || ''}
                onChange={e => setNewParentId(e.target.value || null)}
                className="border rounded px-3 py-2"
              >
                <option value="">Root Level</option>
                {locations.map(l => (
                  <option key={l.id} value={l.id}>{l.name}</option>
                ))}
              </select>
              <button
                onClick={createLocation}
                className="bg-green-600 text-white px-4 rounded-lg"
              >
                Save
              </button>
            </div>
          </div>
        )}

        <div className="space-y-2">
          {renderTree(null)}
        </div>
      </div>
    </div>
  )
}

function TreeRow({
  node,
  depth,
  expanded,
  toggle,
  itemCount,
  onDelete,
  children
}: any) {

  const colors = [
    'border-indigo-500',
    'border-blue-500',
    'border-emerald-500',
    'border-amber-500'
  ]

  return (
    <div>
      <div
        className={`flex items-center justify-between pl-3 pr-3 py-2 rounded-lg border-l-4 ${colors[depth % colors.length]} hover:bg-slate-50 transition`}
        style={{ marginLeft: depth * 20 }}
      >
        <div className="flex items-center gap-3">
          <button onClick={toggle}>
            {expanded ? '▾' : '▸'}
          </button>
          <span className="font-medium">
            {node.name} <span className="text-sm text-slate-500">({itemCount})</span>
          </span>
        </div>

        <button
          onClick={onDelete}
          className="text-red-500 text-sm hover:underline"
        >
          Delete
        </button>
      </div>
      {children}
    </div>
  )
}
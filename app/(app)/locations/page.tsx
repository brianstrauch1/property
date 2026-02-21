'use client'

import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  DndContext,
  closestCenter,
  DragEndEvent,
  useDroppable,
  useDraggable
} from '@dnd-kit/core'
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  arrayMove
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Plus, Trash2, GripVertical } from 'lucide-react'

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
  const supabase = createClient()

  const [locations, setLocations] = useState<Location[]>([])
  const [items, setItems] = useState<Item[]>([])
  const [propertyId, setPropertyId] = useState<string | null>(null)
  const [showModal, setShowModal] = useState(false)
  const [newLocationName, setNewLocationName] = useState('')
  const [newParentId, setNewParentId] = useState<string | null>(null)

  useEffect(() => {
    loadData()
  }, [])

  async function loadData() {
    const {
      data: { user }
    } = await supabase.auth.getUser()

    if (!user) return

    const { data: properties } = await supabase
      .from('properties')
      .select('id')
      .eq('user_id', user.id)
      .limit(1)

    if (!properties?.length) return

    const pid = properties[0].id
    setPropertyId(pid)

    const { data: locs } = await supabase
      .from('locations')
      .select('*')
      .eq('property_id', pid)
      .order('sort_order', { ascending: true })

    const { data: itemRows } = await supabase
      .from('items')
      .select('id, location_id')
      .eq('property_id', pid)

    setLocations(locs || [])
    setItems(itemRows || [])
  }

  function getChildren(parentId: string | null) {
    return locations.filter(l => l.parent_id === parentId)
  }

  function getItemCount(locationId: string) {
    return items.filter(i => i.location_id === locationId).length
  }

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over) return

    const activeId = active.id as string
    const overId = over.id as string

    if (activeId === overId) return

    const activeLoc = locations.find(l => l.id === activeId)
    const overLoc = locations.find(l => l.id === overId)
    if (!activeLoc || !overLoc) return

    // Re-parent
    if (overId !== activeId) {
      await supabase
        .from('locations')
        .update({ parent_id: overLoc.id })
        .eq('id', activeId)
    }

    // Reorder within siblings
    const siblings = locations.filter(
      l => l.parent_id === overLoc.parent_id
    )

    const oldIndex = siblings.findIndex(l => l.id === activeId)
    const newIndex = siblings.findIndex(l => l.id === overId)

    if (oldIndex >= 0 && newIndex >= 0) {
      const reordered = arrayMove(siblings, oldIndex, newIndex)

      for (let i = 0; i < reordered.length; i++) {
        await supabase
          .from('locations')
          .update({ sort_order: i })
          .eq('id', reordered[i].id)
      }
    }

    await loadData()
  }

  async function createLocation() {
    if (!propertyId || !newLocationName) return

    await supabase.from('locations').insert({
      name: newLocationName,
      property_id: propertyId,
      parent_id: newParentId,
      sort_order: locations.length
    })

    setNewLocationName('')
    setNewParentId(null)
    setShowModal(false)
    loadData()
  }

  async function deleteLocation(id: string) {
    const children = locations.filter(l => l.parent_id === id)
    if (children.length > 0) {
      alert('Cannot delete location with children.')
      return
    }

    const itemCount = getItemCount(id)
    if (itemCount > 0) {
      alert('Cannot delete location with inventory items.')
      return
    }

    await supabase.from('locations').delete().eq('id', id)
    loadData()
  }

  function renderTree(parentId: string | null, depth = 0) {
    const children = getChildren(parentId)
    if (!children.length) return null

    return (
      <SortableContext
        items={children.map(c => c.id)}
        strategy={verticalListSortingStrategy}
      >
        {children.map(child => (
          <SortableRow
            key={child.id}
            location={child}
            depth={depth}
            itemCount={getItemCount(child.id)}
            onDelete={deleteLocation}
          >
            {renderTree(child.id, depth + 1)}
          </SortableRow>
        ))}
      </SortableContext>
    )
  }

  return (
    <div className="max-w-5xl mx-auto mt-8">
      <div className="flex justify-between mb-4">
        <h1 className="text-2xl font-bold">Locations</h1>
        <button
          onClick={() => setShowModal(true)}
          className="bg-indigo-600 text-white px-4 py-2 rounded-md flex items-center gap-2"
        >
          <Plus size={16} /> New Location
        </button>
      </div>

      <DndContext collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        {renderTree(null)}
      </DndContext>

      {showModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center">
          <div className="bg-white p-6 rounded-md w-96">
            <h2 className="text-lg font-semibold mb-4">Add New Location</h2>
            <input
              value={newLocationName}
              onChange={e => setNewLocationName(e.target.value)}
              placeholder="Location Name"
              className="w-full border p-2 rounded mb-3"
            />
            <select
              value={newParentId || ''}
              onChange={e =>
                setNewParentId(e.target.value || null)
              }
              className="w-full border p-2 rounded mb-4"
            >
              <option value="">Root</option>
              {locations.map(l => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>

            <div className="flex justify-end gap-2">
              <button onClick={() => setShowModal(false)}>Cancel</button>
              <button
                onClick={createLocation}
                className="bg-indigo-600 text-white px-4 py-2 rounded"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function SortableRow({
  location,
  depth,
  itemCount,
  onDelete,
  children
}: any) {
  const { attributes, listeners, setNodeRef, transform, transition } =
    useSortable({ id: location.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition
  }

  const colorLevels = [
    'border-indigo-500',
    'border-purple-500',
    'border-blue-500',
    'border-emerald-500'
  ]

  return (
    <div ref={setNodeRef} style={style}>
      <div
        className={`flex items-center justify-between pl-${depth * 4} border-l-4 ${
          colorLevels[depth % colorLevels.length]
        } py-2 bg-white hover:bg-slate-50 transition-all`}
      >
        <div className="flex items-center gap-2">
          <span {...attributes} {...listeners}>
            <GripVertical size={16} />
          </span>
          <span className="font-medium">
            {location.name} ({itemCount})
          </span>
        </div>
        <button
          onClick={() => onDelete(location.id)}
          className="text-red-500 hover:text-red-700"
        >
          <Trash2 size={16} />
        </button>
      </div>
      {children}
    </div>
  )
}
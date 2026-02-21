'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { DndContext, DragEndEvent, useDraggable, useDroppable } from '@dnd-kit/core'
import { supabaseBrowser } from '@/lib/supabase-browser'

type LocationRow = {
  id: string
  property_id: string
  parent_id: string | null
  name: string
}

export default function DashboardPage() {
  const supabase = supabaseBrowser()
  const router = useRouter()

  const [property, setProperty] = useState<any>(null)
  const [locations, setLocations] = useState<LocationRow[]>([])
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})

  const [newName, setNewName] = useState('')
  const [newParentId, setNewParentId] = useState<string | null>(null)

  useEffect(() => {
    const init = async () => {
      const { data: userData } = await supabase.auth.getUser()
      if (!userData.user) {
        router.push('/')
        return
      }

      const { data: prop } = await supabase
        .from('properties')
        .select('*')
        .limit(1)
        .single()

      if (!prop) return
      setProperty(prop)

      const { data: locs } = await supabase
        .from('locations')
        .select('*')
        .eq('property_id', prop.id)

      setLocations(locs ?? [])
    }

    init()
  }, [])

  const childrenByParent = useMemo(() => {
    const map = new Map<string | null, LocationRow[]>()
    for (const loc of locations) {
      const key = loc.parent_id ?? null
      const arr = map.get(key) ?? []
      arr.push(loc)
      map.set(key, arr)
    }
    return map
  }, [locations])

  const toggleExpanded = (id: string) => {
    setExpanded(prev => ({ ...prev, [id]: !prev[id] }))
  }

  const createLocation = async () => {
    if (!property || !newName.trim()) return

    const { data } = await supabase
      .from('locations')
      .insert([
        {
          name: newName.trim(),
          property_id: property.id,
          parent_id: newParentId
        }
      ])
      .select()
      .single()

    if (data) {
      setLocations(prev => [...prev, data])
      setNewName('')
      setNewParentId(null)
    }
  }

  const deleteLocation = async (id: string) => {
    const hasChildren = locations.some(l => l.parent_id === id)
    if (hasChildren) {
      alert('Cannot delete location with children.')
      return
    }

    await supabase.from('locations').delete().eq('id', id)
    setLocations(prev => prev.filter(l => l.id !== id))
  }

  const renameLocation = async (id: string, current: string) => {
    const newLabel = prompt('Rename location:', current)
    if (!newLabel) return

    await supabase.from('locations').update({ name: newLabel }).eq('id', id)
    setLocations(prev =>
      prev.map(l => (l.id === id ? { ...l, name: newLabel } : l))
    )
  }

  const onDragEnd = async (event: DragEndEvent) => {
    const draggedId = String(event.active.id)
    const overId = event.over?.id ? String(event.over.id) : null
    if (!overId) return

    const newParentId = overId === 'root' ? null : overId
    if (draggedId === newParentId) return

    await supabase
      .from('locations')
      .update({ parent_id: newParentId })
      .eq('id', draggedId)

    setLocations(prev =>
      prev.map(l =>
        l.id === draggedId ? { ...l, parent_id: newParentId } : l
      )
    )
  }

  const renderTree = (parent: string | null, level = 0) => {
    const nodes = childrenByParent.get(parent) ?? []

    return nodes.map(loc => {
      const children = childrenByParent.get(loc.id) ?? []
      const hasChildren = children.length > 0

      return (
        <div key={loc.id} style={{ marginLeft: level * 18 }}>
          <DropZone id={loc.id}>
            <Draggable id={loc.id}>
              <div className="flex items-center justify-between border rounded p-2 bg-white">
                <div className="flex items-center gap-2">
                  {hasChildren ? (
                    <button onClick={() => toggleExpanded(loc.id)}>
                      {expanded[loc.id] ? '▾' : '▸'}
                    </button>
                  ) : (
                    <span>•</span>
                  )}
                  <span>{loc.name}</span>
                </div>

                <div className="flex gap-2 text-sm">
                  <button onClick={() => renameLocation(loc.id, loc.name)} className="text-blue-600">
                    Rename
                  </button>
                  <button onClick={() => deleteLocation(loc.id)} className="text-red-600">
                    Delete
                  </button>
                </div>
              </div>
            </Draggable>
          </DropZone>

          {hasChildren && expanded[loc.id] && renderTree(loc.id, level + 1)}
        </div>
      )
    })
  }

  if (!property) return <div className="p-8">Loading...</div>

  return (
    <main className="min-h-screen bg-slate-100 p-8">
      <TopNav />

      <div className="bg-white p-6 rounded-xl shadow-md mb-6">
        <h1 className="text-2xl font-bold">{property.name}</h1>
        <p className="text-slate-600">{property.address}</p>
      </div>

      <div className="bg-white p-6 rounded-xl shadow-md">
        <h2 className="text-xl font-semibold mb-4">Locations</h2>

        <div className="flex gap-2 mb-4">
          <input
            className="border p-2 rounded w-full"
            placeholder="New location"
            value={newName}
            onChange={e => setNewName(e.target.value)}
          />
          <select
            className="border p-2 rounded"
            value={newParentId || ''}
            onChange={e => setNewParentId(e.target.value || null)}
          >
            <option value="">Root</option>
            {locations.map(l => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
          <button onClick={createLocation} className="bg-indigo-600 text-white px-4 rounded">
            Add
          </button>
        </div>

        <DndContext onDragEnd={onDragEnd}>
          <DropZone id="root">
            <div className="border rounded p-3 bg-slate-50">
              <div className="text-xs text-slate-500 mb-2">
                ROOT (drop here to make top-level)
              </div>
              {renderTree(null)}
            </div>
          </DropZone>
        </DndContext>
      </div>
    </main>
  )
}

function TopNav() {
  return (
    <div className="flex gap-4 mb-6">
      <Link href="/dashboard" className="font-semibold">
        Locations
      </Link>
      <Link href="/inventory">Inventory</Link>
      <Link href="/settings">Settings</Link>
    </div>
  )
}

function Draggable({ id, children }: any) {
  const { attributes, listeners, setNodeRef, transform } = useDraggable({ id })
  const style = {
    transform: transform
      ? `translate3d(${transform.x}px, ${transform.y}px, 0)`
      : undefined
  }

  return (
    <div ref={setNodeRef} style={style} {...listeners} {...attributes}>
      {children}
    </div>
  )
}

function DropZone({ id, children }: any) {
  const { setNodeRef, isOver } = useDroppable({ id })

  return (
    <div
      ref={setNodeRef}
      className={isOver ? 'bg-indigo-50 rounded' : ''}
    >
      {children}
    </div>
  )
}
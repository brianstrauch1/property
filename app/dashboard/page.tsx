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

      const locList = (locs ?? []) as LocationRow[]
      setLocations(locList)

      // auto-expand root nodes
      const rootExpanded: Record<string, boolean> = {}
      locList.forEach(l => {
        if (l.parent_id === null) rootExpanded[l.id] = true
      })
      setExpanded(rootExpanded)
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
    // sort for stable display
    for (const [k, arr] of map.entries()) {
      arr.sort((a, b) => a.name.localeCompare(b.name))
      map.set(k, arr)
    }
    return map
  }, [locations])

  const toggleExpanded = (id: string) => {
    setExpanded(prev => ({ ...prev, [id]: !prev[id] }))
  }

  const createLocation = async () => {
    if (!property || !newName.trim()) return

    const { data, error } = await supabase
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

    if (error) {
      alert(error.message)
      return
    }

    if (data) {
      const row = data as LocationRow
      setLocations(prev => [...prev, row])
      setNewName('')
      setNewParentId(null)

      // expand parent to show new child, or expand new root
      if (row.parent_id) setExpanded(prev => ({ ...prev, [row.parent_id!]: true }))
      else setExpanded(prev => ({ ...prev, [row.id]: true }))
    }
  }

  const deleteLocation = async (id: string) => {
    const hasChildren = locations.some(l => l.parent_id === id)
    if (hasChildren) {
      alert('Cannot delete a location that has children. Move/delete children first.')
      return
    }

    const ok = confirm('Delete this location?')
    if (!ok) return

    const { error } = await supabase.from('locations').delete().eq('id', id)
    if (error) {
      alert(error.message)
      return
    }

    setLocations(prev => prev.filter(l => l.id !== id))
    setExpanded(prev => {
      const next = { ...prev }
      delete next[id]
      return next
    })
  }

  const renameLocation = async (id: string, current: string) => {
    const newLabel = prompt('Rename location:', current)
    if (!newLabel || !newLabel.trim()) return

    const { error } = await supabase.from('locations').update({ name: newLabel.trim() }).eq('id', id)
    if (error) {
      alert(error.message)
      return
    }

    setLocations(prev => prev.map(l => (l.id === id ? { ...l, name: newLabel.trim() } : l)))
  }

  const onDragEnd = async (event: DragEndEvent) => {
    const draggedId = String(event.active.id)
    const overId = event.over?.id ? String(event.over.id) : null
    if (!overId) return

    const newParent = overId === 'root' ? null : overId
    if (draggedId === newParent) return

    const { error } = await supabase.from('locations').update({ parent_id: newParent }).eq('id', draggedId)
    if (error) {
      alert(error.message)
      return
    }

    setLocations(prev => prev.map(l => (l.id === draggedId ? { ...l, parent_id: newParent } : l)))

    // expand the new parent so user can see it
    if (newParent) setExpanded(prev => ({ ...prev, [newParent]: true }))
  }

  const renderTree = (parent: string | null, level = 0) => {
    const nodes = childrenByParent.get(parent) ?? []

    return nodes.map(loc => {
      const kids = childrenByParent.get(loc.id) ?? []
      const hasChildren = kids.length > 0

      return (
        <div key={loc.id} style={{ marginLeft: level * 18 }}>
          <DropZone id={loc.id}>
            <Row
              id={loc.id}
              name={loc.name}
              hasChildren={hasChildren}
              expanded={!!expanded[loc.id]}
              onToggle={() => toggleExpanded(loc.id)}
              onRename={() => renameLocation(loc.id, loc.name)}
              onDelete={() => deleteLocation(loc.id)}
            />
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
      <Link href="/analytics">Analytics</Link>
      <Link href="/settings">Settings</Link>
    </div>
  )
}

function DropZone({ id, children }: any) {
  const { setNodeRef, isOver } = useDroppable({ id })
  return (
    <div ref={setNodeRef} className={isOver ? 'bg-indigo-50 rounded' : ''}>
      {children}
    </div>
  )
}

function DragHandle({ id }: { id: string }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id })
  const style: React.CSSProperties = {
    transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
    opacity: isDragging ? 0.6 : 1
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      className="select-none cursor-grab px-2 text-slate-500"
      title="Drag to move"
      onClick={(e) => {
        // prevent accidental clicks doing anything
        e.preventDefault()
        e.stopPropagation()
      }}
    >
      ⠿
    </div>
  )
}

function Row(props: {
  id: string
  name: string
  hasChildren: boolean
  expanded: boolean
  onToggle: () => void
  onRename: () => void
  onDelete: () => void
}) {
  return (
    <div className="flex items-center justify-between border rounded p-2 bg-white">
      <div className="flex items-center gap-2">
        <DragHandle id={props.id} />

        {props.hasChildren ? (
          <button
            onClick={(e) => {
              e.preventDefault()
              e.stopPropagation()
              props.onToggle()
            }}
            className="w-6 text-slate-600"
            title={props.expanded ? 'Collapse' : 'Expand'}
          >
            {props.expanded ? '▾' : '▸'}
          </button>
        ) : (
          <span className="w-6 text-slate-400">•</span>
        )}

        <span>{props.name}</span>
      </div>

      <div className="flex gap-2 text-sm">
        <button
          onClick={(e) => {
            e.preventDefault()
            e.stopPropagation()
            props.onRename()
          }}
          className="text-blue-600"
        >
          Rename
        </button>

        <button
          onClick={(e) => {
            e.preventDefault()
            e.stopPropagation()
            props.onDelete()
          }}
          className="text-red-600"
        >
          Delete
        </button>
      </div>
    </div>
  )
}
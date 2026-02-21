'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { DndContext, closestCenter, useDraggable, useDroppable } from '@dnd-kit/core'
import { CSS } from '@dnd-kit/utilities'
import { supabaseBrowser } from '@/lib/supabase-browser'

type LocationRow = {
  id: string
  name: string
  parent_id: string | null
  sort_order?: number | null
  property_id: string
}

function depthClasses(depth: number) {
  if (depth === 0) return 'border-l-4 border-indigo-600'
  if (depth === 1) return 'border-l-4 border-indigo-400 bg-indigo-50'
  if (depth === 2) return 'border-l-4 border-sky-400 bg-sky-50'
  return 'border-l-4 border-slate-400 bg-slate-50'
}

export default function LocationsPage() {
  const supabase = supabaseBrowser()
  const router = useRouter()

  const [propertyId, setPropertyId] = useState<string | null>(null)
  const [locations, setLocations] = useState<LocationRow[]>([])
  const [expanded, setExpanded] = useState<string[]>([])

  /* ---------------- Load ---------------- */

  const loadAll = async (propId: string) => {
    const { data } = await supabase
      .from('locations')
      .select('*')
      .eq('property_id', propId)
      .order('sort_order', { ascending: true })

    setLocations((data ?? []) as LocationRow[])
  }

  useEffect(() => {
    const init = async () => {
      const { data: prop } = await supabase
        .from('properties')
        .select('id')
        .limit(1)
        .single()

      if (!prop?.id) return
      setPropertyId(prop.id)
      await loadAll(prop.id)
    }

    init()
  }, [])

  /* ---------------- Tree Helpers ---------------- */

  const byId = useMemo(() => {
    const map: Record<string, LocationRow> = {}
    locations.forEach(l => (map[l.id] = l))
    return map
  }, [locations])

  const childrenMap = useMemo(() => {
    const map: Record<string, LocationRow[]> = {}
    locations.forEach(l => {
      if (!l.parent_id) return
      if (!map[l.parent_id]) map[l.parent_id] = []
      map[l.parent_id].push(l)
    })
    Object.keys(map).forEach(k =>
      map[k].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
    )
    return map
  }, [locations])

  const roots = useMemo(() => {
    return locations
      .filter(l => !l.parent_id)
      .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
  }, [locations])

  const descendantsOf = (id: string): string[] => {
    const result = [id]
    const kids = childrenMap[id] ?? []
    for (const k of kids) result.push(...descendantsOf(k.id))
    return result
  }

  /* ---------------- Drag & Drop ---------------- */

  const handleDragEnd = async (event: any) => {
    if (!propertyId) return
    const { active, over } = event
    if (!over || active.id === over.id) return

    const activeLoc = byId[active.id]
    const overLoc = byId[over.id]
    if (!activeLoc || !overLoc) return

    // Prevent dragging into own subtree
    const subtree = descendantsOf(active.id)
    if (subtree.includes(over.id)) return

    const newParentId = overLoc.parent_id
    const siblings =
      newParentId === null
        ? roots.slice()
        : (childrenMap[newParentId] ?? []).slice()

    const filtered = siblings.filter(s => s.id !== active.id)
    const targetIndex = filtered.findIndex(s => s.id === over.id)

    filtered.splice(targetIndex >= 0 ? targetIndex : filtered.length, 0, {
      ...activeLoc,
      parent_id: newParentId
    })

    // Persist new ordering
    for (let i = 0; i < filtered.length; i++) {
      await supabase
        .from('locations')
        .update({
          parent_id: filtered[i].parent_id,
          sort_order: i + 1
        })
        .eq('id', filtered[i].id)
    }

    await loadAll(propertyId)
  }

  /* ---------------- Tree Node ---------------- */

  function TreeNode({ node, depth }: { node: LocationRow; depth: number }) {
    const children = childrenMap[node.id] ?? []
    const isOpen = expanded.includes(node.id)

    const { attributes, listeners, setNodeRef, transform } = useDraggable({
      id: node.id
    })

    const style = transform
      ? { transform: CSS.Translate.toString(transform) }
      : undefined

    const { setNodeRef: setDropRef } = useDroppable({
      id: node.id
    })

    return (
      <div ref={setNodeRef} style={style}>
        <div
          ref={setDropRef}
          className={`flex items-center justify-between px-3 py-2 rounded-lg mb-1 ${depthClasses(
            depth
          )}`}
          style={{ marginLeft: depth * 12 }}
        >
          <div className="flex items-center gap-2">
            <button
              onClick={() =>
                setExpanded(prev =>
                  prev.includes(node.id)
                    ? prev.filter(x => x !== node.id)
                    : [...prev, node.id]
                )
              }
              className="text-slate-500"
            >
              {children.length > 0 ? (isOpen ? '▾' : '▸') : '•'}
            </button>

            <span>{node.name}</span>
          </div>

          <div
            {...listeners}
            {...attributes}
            className="cursor-grab text-slate-400"
            title="Drag to reorder"
          >
            ☰
          </div>
        </div>

        {isOpen &&
          children.map(child => (
            <TreeNode key={child.id} node={child} depth={depth + 1} />
          ))}
      </div>
    )
  }

  if (!propertyId) return null

  return (
    <main className="bg-white p-6 rounded-xl shadow-md">
      <h1 className="text-2xl font-bold mb-4">Locations</h1>

      <DndContext collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        {roots.map(root => (
          <TreeNode key={root.id} node={root} depth={0} />
        ))}
      </DndContext>
    </main>
  )
}
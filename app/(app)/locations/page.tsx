'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabaseBrowser } from '@/lib/supabase-browser'
import { DndContext, closestCenter, useDraggable, useDroppable } from '@dnd-kit/core'
import { CSS } from '@dnd-kit/utilities'

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

  const focusMapRef = useRef<Record<string, HTMLDivElement | null>>({})
  const lastFocusedIdRef = useRef<string | null>(null)

  const [property, setProperty] = useState<{ id: string } | null>(null)
  const [locations, setLocations] = useState<LocationRow[]>([])
  const [expanded, setExpanded] = useState<string[]>([])
  const [inlineEditId, setInlineEditId] = useState<string | null>(null)
  const [inlineEditValue, setInlineEditValue] = useState('')
  const [ctxMenu, setCtxMenu] = useState<null | { x: number; y: number; id: string }>(null)

  /* ---------------- LOAD ---------------- */

  const loadLocations = async (propId: string) => {
    const { data } = await supabase
      .from('locations')
      .select('*')
      .eq('property_id', propId)
      .order('sort_order', { ascending: true })

    setLocations(data ?? [])
  }

  useEffect(() => {
    const init = async () => {
      const { data: sess } = await supabase.auth.getSession()
      if (!sess.session) {
        router.push('/')
        return
      }

      const { data: prop } = await supabase
        .from('properties')
        .select('id')
        .limit(1)
        .single()

      if (!prop?.id) return
      setProperty(prop)

      const saved = localStorage.getItem('expandedLocationsTree')
      if (saved) setExpanded(JSON.parse(saved))

      await loadLocations(prop.id)
    }

    init()

    const closeCtx = () => setCtxMenu(null)
    document.addEventListener('click', closeCtx)
    return () => document.removeEventListener('click', closeCtx)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    localStorage.setItem('expandedLocationsTree', JSON.stringify(expanded))
  }, [expanded])

  /* ---------------- TREE HELPERS ---------------- */

  const byId = useMemo(() => {
    const map: Record<string, LocationRow> = {}
    for (const l of locations) map[l.id] = l
    return map
  }, [locations])

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

  /* ---------------- INLINE RENAME ---------------- */

  const startRename = (loc: LocationRow) => {
    setInlineEditId(loc.id)
    setInlineEditValue(loc.name)
    setCtxMenu(null)
  }

  const commitRename = async () => {
    if (!inlineEditId) return

    const newName = inlineEditValue.trim()
    if (!newName) {
      setInlineEditId(null)
      return
    }

    await supabase.from('locations').update({ name: newName }).eq('id', inlineEditId)

    setLocations(prev =>
      prev.map(l => (l.id === inlineEditId ? { ...l, name: newName } : l))
    )

    setInlineEditId(null)
  }

  /* ---------------- CREATE / DELETE ---------------- */

  const addChild = async (parentId: string) => {
    if (!property?.id) return
    const name = prompt('Child location name:')
    if (!name) return

    const { data } = await supabase
      .from('locations')
      .insert({
        property_id: property.id,
        parent_id: parentId,
        name,
        sort_order: 0
      })
      .select('*')
      .single()

    if (!data) return
    setLocations(prev => [...prev, data])
    setExpanded(prev => [...new Set([...prev, parentId])])
  }

  const deleteLocation = async (id: string) => {
    if (!confirm('Delete this location?')) return

    await supabase.from('locations').delete().eq('id', id)
    setLocations(prev => prev.filter(l => l.id !== id))
    setExpanded(prev => prev.filter(x => x !== id))
    setCtxMenu(null)
  }

  /* ---------------- DRAG ---------------- */

  const reorder = async (activeId: string, overId: string) => {
    const active = byId[activeId]
    const over = byId[overId]
    if (!active || !over) return

    await supabase
      .from('locations')
      .update({ parent_id: over.parent_id })
      .eq('id', activeId)

    await loadLocations(property!.id)
  }

  /* ---------------- RENDER NODE ---------------- */

  function TreeNode({ node, depth }: { node: LocationRow; depth: number }) {
    const children = childrenMap[node.id] || []
    const isOpen = expanded.includes(node.id)
    const isEditing = inlineEditId === node.id

    const { attributes, listeners, setNodeRef, transform } = useDraggable({ id: node.id })
    const { setNodeRef: setDropRef } = useDroppable({ id: node.id })

    const style = transform ? { transform: CSS.Translate.toString(transform) } : undefined

    return (
      <div ref={setNodeRef} style={style}>
        <div
          ref={(el) => {
            setDropRef(el)
            focusMapRef.current[node.id] = el
          }}
          onContextMenu={(e) => {
            e.preventDefault()
            setCtxMenu({ x: e.clientX, y: e.clientY, id: node.id })
          }}
          className="flex items-center gap-2 py-2 px-2 rounded-lg hover:bg-slate-50"
          style={{ marginLeft: depth * 16 }}
        >
          <button
            onClick={() =>
              setExpanded(prev =>
                prev.includes(node.id)
                  ? prev.filter(x => x !== node.id)
                  : [...prev, node.id]
              )
            }
            className="w-6 text-slate-400"
          >
            {children.length > 0 ? (isOpen ? '▾' : '▸') : '•'}
          </button>

          {!isEditing ? (
            <span
              className="text-sm font-medium"
              onDoubleClick={() => startRename(node)}
            >
              {node.name}
            </span>
          ) : (
            <input
              autoFocus
              value={inlineEditValue}
              onChange={(e) => setInlineEditValue(e.target.value)}
              onBlur={commitRename}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitRename()
              }}
              className="border rounded px-2 py-1 text-sm"
            />
          )}

          <span
            {...listeners}
            {...attributes}
            className="ml-auto cursor-grab text-slate-400"
          >
            ☰
          </span>
        </div>

        {isOpen &&
          children.map(child => (
            <TreeNode key={child.id} node={child} depth={depth + 1} />
          ))}
      </div>
    )
  }

  if (!property) return <div className="p-6">Loading...</div>

  return (
    <main className="bg-white p-6 rounded-xl shadow-md">
      <h1 className="text-2xl font-bold mb-6">Locations</h1>

      <DndContext
        collisionDetection={closestCenter}
        onDragEnd={(event) => {
          if (event.over && event.active.id !== event.over.id) {
            reorder(String(event.active.id), String(event.over.id))
          }
        }}
      >
        {roots.map(root => (
          <TreeNode key={root.id} node={root} depth={0} />
        ))}
      </DndContext>

      {ctxMenu && (
        <div
          className="fixed bg-white border shadow rounded text-sm"
          style={{ left: ctxMenu.x, top: ctxMenu.y }}
        >
          <button
            onClick={() => addChild(ctxMenu.id)}
            className="block px-3 py-2 hover:bg-slate-50 w-full text-left"
          >
            Add Child
          </button>
          <button
            onClick={() => startRename(byId[ctxMenu.id])}
            className="block px-3 py-2 hover:bg-slate-50 w-full text-left"
          >
            Rename
          </button>
          <button
            onClick={() => deleteLocation(ctxMenu.id)}
            className="block px-3 py-2 hover:bg-slate-50 text-red-600 w-full text-left"
          >
            Delete
          </button>
        </div>
      )}
    </main>
  )
}
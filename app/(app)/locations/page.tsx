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

type CtxMenu =
  | null
  | {
      x: number
      y: number
      locationId: string
    }

function ChevronRight() {
  return (
    <svg width="14" height="14" viewBox="0 0 20 20" aria-hidden="true">
      <path d="M7 4l6 6-6 6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}

function ChevronDown() {
  return (
    <svg width="14" height="14" viewBox="0 0 20 20" aria-hidden="true">
      <path d="M4 7l6 6 6-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}

export default function LocationsPage() {
  const supabase = supabaseBrowser()
  const router = useRouter()

  const focusMapRef = useRef<Record<string, HTMLDivElement | null>>({})
  const lastFocusedIdRef = useRef<string | null>(null)

  const [property, setProperty] = useState<{ id: string } | null>(null)
  const [locations, setLocations] = useState<LocationRow[]>([])
  const [expanded, setExpanded] = useState<string[]>([])
  const [search, setSearch] = useState('')

  const [inlineEditId, setInlineEditId] = useState<string | null>(null)
  const [inlineEditValue, setInlineEditValue] = useState('')

  const [ctxMenu, setCtxMenu] = useState<CtxMenu>(null)

  const [creatingRoot, setCreatingRoot] = useState(false)
  const [newRootName, setNewRootName] = useState('')

  /* ------------------------------ load ------------------------------ */

  const loadLocations = async (propId: string) => {
    const { data: locs, error } = await supabase
      .from('locations')
      .select('*')
      .eq('property_id', propId)
      .order('sort_order', { ascending: true })

    if (error) throw error
    setLocations((locs ?? []) as LocationRow[])
  }

  useEffect(() => {
    const init = async () => {
      const { data: sess } = await supabase.auth.getSession()
      if (!sess.session?.access_token) {
        router.push('/')
        return
      }

      const { data: prop, error: propErr } = await supabase
        .from('properties')
        .select('id')
        .limit(1)
        .single()

      if (propErr || !prop?.id) return
      setProperty(prop)

      const savedExpanded = localStorage.getItem('expandedLocationsTree')
      if (savedExpanded) setExpanded(JSON.parse(savedExpanded))

      await loadLocations(prop.id)
    }

    init()

    const onDocClick = () => setCtxMenu(null)
    document.addEventListener('click', onDocClick)
    return () => document.removeEventListener('click', onDocClick)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    localStorage.setItem('expandedLocationsTree', JSON.stringify(expanded))
  }, [expanded])

  /* ------------------------------ tree helpers ------------------------------ */

  const byId = useMemo(() => {
    const m: Record<string, LocationRow> = {}
    for (const l of locations) m[l.id] = l
    return m
  }, [locations])

  const childrenMap = useMemo(() => {
    const map: Record<string, LocationRow[]> = {}
    for (const loc of locations) {
      if (!loc.parent_id) continue
      if (!map[loc.parent_id]) map[loc.parent_id] = []
      map[loc.parent_id].push(loc)
    }
    for (const k of Object.keys(map)) {
      map[k] = map[k].slice().sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
    }
    return map
  }, [locations])

  const roots = useMemo(() => {
    return locations
      .filter(l => !l.parent_id)
      .slice()
      .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
  }, [locations])

  const descendantsOf = (id: string): string[] => {
    const result = [id]
    const children = childrenMap[id] || []
    for (const c of children) result.push(...descendantsOf(c.id))
    return result
  }

  const ancestorsOf = (id: string): string[] => {
    const path: string[] = []
    let cur: LocationRow | undefined = byId[id]
    while (cur) {
      path.unshift(cur.id)
      cur = cur.parent_id ? byId[cur.parent_id] : undefined
    }
    return path
  }

  /* ------------------------------ search filter ------------------------------ */

  const searchLower = search.trim().toLowerCase()

  const searchVisibleSet = useMemo(() => {
    if (!searchLower) return null as Set<string> | null
    const visible = new Set<string>()
    for (const l of locations) {
      if (l.name.toLowerCase().includes(searchLower)) {
        ancestorsOf(l.id).forEach(id => visible.add(id))
      }
    }
    return visible
  }, [searchLower, locations])

  useEffect(() => {
    if (!searchLower) return
    const toExpand = new Set(expanded)
    for (const l of locations) {
      if (l.name.toLowerCase().includes(searchLower)) {
        ancestorsOf(l.id).forEach(id => toExpand.add(id))
      }
    }
    setExpanded(Array.from(toExpand))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchLower])

  /* ------------------------------ keyboard nav ------------------------------ */

  const flattenedVisibleIds = useMemo(() => {
    const out: string[] = []
    const visit = (node: LocationRow) => {
      if (searchVisibleSet && !searchVisibleSet.has(node.id)) return
      out.push(node.id)
      if (expanded.includes(node.id)) {
        const kids = childrenMap[node.id] || []
        for (const k of kids) visit(k)
      }
    }
    for (const r of roots) visit(r)
    return out
  }, [roots, childrenMap, expanded, searchVisibleSet])

  const focusRow = (id: string) => {
    lastFocusedIdRef.current = id
    focusMapRef.current[id]?.focus()
  }

  const moveFocus = (delta: number) => {
    const cur = lastFocusedIdRef.current
    if (!cur) return
    const idx = flattenedVisibleIds.indexOf(cur)
    if (idx < 0) return
    const nextIdx = Math.max(0, Math.min(flattenedVisibleIds.length - 1, idx + delta))
    focusRow(flattenedVisibleIds[nextIdx])
  }

  /* ------------------------------ inline rename ------------------------------ */

  const startInlineRename = (loc: LocationRow) => {
    setInlineEditId(loc.id)
    setInlineEditValue(loc.name)
    setCtxMenu(null)
  }

  const cancelInlineRename = () => {
    setInlineEditId(null)
    setInlineEditValue('')
  }

  const commitInlineRename = async () => {
    if (!inlineEditId || !property?.id) return
    const newName = inlineEditValue.trim()
    if (!newName) {
      cancelInlineRename()
      return
    }

    const { error } = await supabase.from('locations').update({ name: newName }).eq('id', inlineEditId)
    if (error) return alert(error.message)

    setLocations(prev => prev.map(l => (l.id === inlineEditId ? { ...l, name: newName } : l)))
    setInlineEditId(null)
  }

  /* ------------------------------ create / delete ------------------------------ */

  const createRoot = async () => {
    if (!property?.id) return
    const name = newRootName.trim()
    if (!name) return

    const maxSort = Math.max(0, ...locations.filter(l => !l.parent_id).map(l => l.sort_order ?? 0))

    const { data, error } = await supabase
      .from('locations')
      .insert({
        property_id: property.id,
        parent_id: null,
        name,
        sort_order: maxSort + 1
      })
      .select('*')
      .single()

    if (error) return alert(error.message)

    setLocations(prev => [...prev, data as LocationRow])
    setCreatingRoot(false)
    setNewRootName('')
  }

  const addChild = async (parentId: string) => {
    if (!property?.id) return

    const childName = prompt('New child location name:')
    if (!childName?.trim()) return

    const siblings = (childrenMap[parentId] || []).slice()
    const maxSort = Math.max(0, ...siblings.map(s => s.sort_order ?? 0))

    const { data, error } = await supabase
      .from('locations')
      .insert({
        property_id: property.id,
        parent_id: parentId,
        name: childName.trim(),
        sort_order: maxSort + 1
      })
      .select('*')
      .single()

    if (error) return alert(error.message)

    setLocations(prev => [...prev, data as LocationRow])
    setExpanded(prev => (prev.includes(parentId) ? prev : [...prev, parentId]))
  }

  const deleteLocation = async (id: string) => {
    const hasChildren = (childrenMap[id] || []).length > 0
    if (hasChildren) return alert('Cannot delete a location that has child locations. Move/delete children first.')

    if (!confirm('Delete this location?')) return

    const { error } = await supabase.from('locations').delete().eq('id', id)
    if (error) return alert(error.message)

    setLocations(prev => prev.filter(l => l.id !== id))
    setExpanded(prev => prev.filter(x => x !== id))
    setCtxMenu(null)
  }

  /* ------------------------------ drag & drop reorder + reparent ------------------------------ */

  const reorderOrReparent = async (activeId: string, targetId: string) => {
    if (!property?.id) return
    const active = byId[activeId]
    const target = byId[targetId]
    if (!active || !target) return

    // prevent cycles
    const activeDesc = new Set(descendantsOf(activeId))
    if (activeDesc.has(targetId)) return

    const targetHasChildren = (childrenMap[targetId] || []).length > 0
    const targetIsExpanded = expanded.includes(targetId)

    let newParentId: string | null
    let reorderParentId: string | null

    // If dropping onto an expanded node with children, treat as reparent into that node
    if (targetHasChildren && targetIsExpanded && targetId !== active.parent_id) {
      newParentId = targetId
      reorderParentId = targetId
    } else {
      // otherwise reorder within target's parent
      newParentId = target.parent_id
      reorderParentId = target.parent_id
    }

    const siblings =
      reorderParentId === null ? roots.slice() : (childrenMap[reorderParentId] || []).slice()

    const siblingsNoActive = siblings.filter(s => s.id !== activeId)

    const targetIndex = siblingsNoActive.findIndex(s => s.id === targetId)
    const insertIndex = targetIndex >= 0 ? targetIndex : siblingsNoActive.length

    const next = siblingsNoActive.slice()
    next.splice(insertIndex, 0, { ...active, parent_id: newParentId } as LocationRow)

    for (let i = 0; i < next.length; i++) {
      const loc = next[i]
      const { error } = await supabase
        .from('locations')
        .update({ parent_id: loc.parent_id, sort_order: i + 1 })
        .eq('id', loc.id)

      if (error) return alert(error.message)
    }

    await loadLocations(property.id)

    if (newParentId) setExpanded(prev => (prev.includes(newParentId) ? prev : [...prev, newParentId]))
  }

  /* ------------------------------ context menu ------------------------------ */

  const openCtxMenu = (e: React.MouseEvent, locId: string) => {
    e.preventDefault()
    e.stopPropagation()
    setCtxMenu({ x: e.clientX, y: e.clientY, locationId: locId })
  }

  /* ------------------------------ render ------------------------------ */

  function TreeNode({ node, depth }: { node: LocationRow; depth: number }) {
    const children = childrenMap[node.id] || []
    const hasChildren = children.length > 0
    const isOpen = expanded.includes(node.id)
    const isInline = inlineEditId === node.id

    const { attributes, listeners, setNodeRef, transform } = useDraggable({ id: node.id })
    const style = transform ? { transform: CSS.Translate.toString(transform) } : undefined

    const { setNodeRef: setDropRef, isOver } = useDroppable({ id: node.id })

    if (searchVisibleSet && !searchVisibleSet.has(node.id)) return null

    const railColor = depth === 0 ? 'bg-indigo-500' : depth === 1 ? 'bg-indigo-300' : 'bg-slate-300'

    return (
      <div ref={setNodeRef} style={style}>
        <div
          ref={setDropRef}
          tabIndex={0}
          onFocus={() => (lastFocusedIdRef.current = node.id)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              e.preventDefault()
              moveFocus(1)
            } else if (e.key === 'ArrowUp') {
              e.preventDefault()
              moveFocus(-1)
            } else if (e.key === 'ArrowLeft') {
              if (expanded.includes(node.id)) {
                e.preventDefault()
                setExpanded(prev => prev.filter(x => x !== node.id))
              }
            } else if (e.key === 'ArrowRight') {
              if (hasChildren && !expanded.includes(node.id)) {
                e.preventDefault()
                setExpanded(prev => [...prev, node.id])
              }
            } else if (e.key === 'Enter' && isInline) {
              e.preventDefault()
              commitInlineRename()
            } else if (e.key === 'Escape' && isInline) {
              e.preventDefault()
              cancelInlineRename()
            }
          }}
          onContextMenu={(e) => openCtxMenu(e, node.id)}
          className={[
            'relative flex items-center gap-2 py-2 px-2 rounded-lg group outline-none',
            'hover:bg-slate-50 focus:bg-indigo-50 focus:ring-2 focus:ring-indigo-200',
            isOver ? 'bg-indigo-50' : ''
          ].join(' ')}
          style={{ marginLeft: depth * 16 }}
          title="Right-click for actions. Double-click name to rename. Drag handle to reorder."
          ref={(el) => {
            focusMapRef.current[node.id] = el
          }}
        >
          {/* connector rail */}
          <div className={`w-1.5 h-7 ${railColor} rounded-full`} />

          {/* subtle connector line */}
          {depth > 0 && (
            <div
              className="absolute left-0 top-0 bottom-0"
              style={{ transform: `translateX(${depth * 16 - 10}px)` }}
            >
              <div className="h-full border-l border-slate-200" />
            </div>
          )}

          {/* expand/collapse */}
          <button
            className="w-7 h-7 flex items-center justify-center text-slate-500 hover:text-slate-700 rounded"
            onClick={() => {
              if (!hasChildren) return
              setExpanded(prev => (prev.includes(node.id) ? prev.filter(x => x !== node.id) : [...prev, node.id]))
            }}
            title={hasChildren ? (isOpen ? 'Collapse' : 'Expand') : 'No children'}
          >
            {hasChildren ? (isOpen ? <ChevronDown /> : <ChevronRight />) : <span className="text-slate-300">•</span>}
          </button>

          {/* name / inline rename */}
          {!isInline ? (
            <span
              className="text-sm font-medium text-slate-800 select-none"
              onDoubleClick={() => startInlineRename(node)}
              title="Double-click to rename"
            >
              {node.name}
            </span>
          ) : (
            <input
              autoFocus
              value={inlineEditValue}
              onChange={(e) => setInlineEditValue(e.target.value)}
              onBlur={() => commitInlineRename()}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitInlineRename()
                if (e.key === 'Escape') cancelInlineRename()
              }}
              className="text-sm px-2 py-1 border rounded w-64"
              title="Enter to save, Esc to cancel"
            />
          )}

          {/* drag handle */}
          <div
            {...listeners}
            {...attributes}
            className="ml-auto opacity-0 group-hover:opacity-100 cursor-grab text-slate-400 text-xs px-2"
            title="Drag to reorder / reparent"
          >
            ☰
          </div>
        </div>

        {/* animated expand/collapse */}
        <div
          className="overflow-hidden transition-[max-height,opacity] duration-300 ease-in-out"
          style={{
            maxHeight: isOpen ? 800 : 0,
            opacity: isOpen ? 1 : 0
          }}
        >
          {hasChildren && isOpen && (
            <div className="pl-2">
              {children.map(child => (
                <TreeNode key={child.id} node={child} depth={depth + 1} />
              ))}
            </div>
          )}
        </div>
      </div>
    )
  }

  if (!property) return <div className="p-8">Loading...</div>

  return (
    <main>
      <div className="bg-white p-6 rounded-xl shadow-md">
        <div className="flex items-center justify-between gap-3 mb-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Locations</h1>
            <div className="text-sm text-slate-500 mt-1">
              Right-click a location for actions. Double-click name to rename. Drag handle to reorder.
            </div>
          </div>

          <div className="flex items-center gap-2">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search locations..."
              className="border rounded-lg px-3 py-2 w-72"
              title="Filter locations"
            />

            <button
              className="bg-indigo-600 text-white px-3 py-2 rounded-lg text-sm"
              onClick={() => setCreatingRoot(prev => !prev)}
              title="Add a new root location"
            >
              + Add Root
            </button>
          </div>
        </div>

        {creatingRoot && (
          <div className="flex items-center gap-2 mb-4">
            <input
              value={newRootName}
              onChange={(e) => setNewRootName(e.target.value)}
              placeholder="Root location name (e.g., 1st Floor)"
              className="border rounded-lg px-3 py-2 w-96"
            />
            <button className="bg-slate-900 text-white px-3 py-2 rounded-lg text-sm" onClick={createRoot}>
              Create
            </button>
            <button
              className="bg-slate-200 text-slate-800 px-3 py-2 rounded-lg text-sm"
              onClick={() => {
                setCreatingRoot(false)
                setNewRootName('')
              }}
            >
              Cancel
            </button>
          </div>
        )}

        {roots.length === 0 ? (
          <div className="text-slate-500">No root locations to display.</div>
        ) : (
          roots.map(root => <TreeNode key={root.id} node={root} depth={0} />)
        )}
      </div>

      {/* Right-click context menu */}
      {ctxMenu && (
        <div
          className="fixed z-50 bg-white border rounded-lg shadow-lg overflow-hidden text-sm"
          style={{ left: ctxMenu.x, top: ctxMenu.y, width: 220 }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            className="w-full text-left px-3 py-2 hover:bg-slate-50"
            onClick={() => addChild(ctxMenu.locationId)}
          >
            + Add Child Location
          </button>
          <button
            className="w-full text-left px-3 py-2 hover:bg-slate-50"
            onClick={() => startInlineRename(byId[ctxMenu.locationId])}
          >
            Rename
          </button>
          <button
            className="w-full text-left px-3 py-2 hover:bg-slate-50 text-red-600"
            onClick={() => deleteLocation(ctxMenu.locationId)}
          >
            Delete
          </button>
        </div>
      )}
    </main>
  )
}
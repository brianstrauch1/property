'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabaseBrowser } from '@/lib/supabase-browser'
import EditItemModal, { InventoryItem } from '@/components/inventory/EditItemModal'
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

export default function InventoryPage() {
  const supabase = supabaseBrowser()
  const router = useRouter()

  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const focusMapRef = useRef<Record<string, HTMLDivElement | null>>({})
  const lastFocusedIdRef = useRef<string | null>(null)

  const [property, setProperty] = useState<{ id: string } | null>(null)
  const [locations, setLocations] = useState<LocationRow[]>([])
  const [items, setItems] = useState<InventoryItem[]>([])

  const [selected, setSelected] = useState<string[]>([])
  const selectedSet = useMemo(() => new Set(selected), [selected])

  const [expanded, setExpanded] = useState<string[]>([])
  const [search, setSearch] = useState('')

  const [editingItem, setEditingItem] = useState<InventoryItem | null>(null)
  const [photoTarget, setPhotoTarget] = useState<InventoryItem | null>(null)

  const [inlineEditId, setInlineEditId] = useState<string | null>(null)
  const [inlineEditValue, setInlineEditValue] = useState('')

  const [ctxMenu, setCtxMenu] = useState<CtxMenu>(null)

  const [creatingRoot, setCreatingRoot] = useState(false)
  const [newRootName, setNewRootName] = useState('')

  const [isInventoryCollapsed, setIsInventoryCollapsed] = useState(false)

  /* ------------------------------ load ------------------------------ */

  const loadAll = async (propId: string) => {
    const { data: locs, error: locErr } = await supabase
      .from('locations')
      .select('*')
      .eq('property_id', propId)
      .order('sort_order', { ascending: true })

    if (locErr) throw locErr
    setLocations((locs ?? []) as LocationRow[])

    const { data: its, error: itsErr } = await supabase
      .from('items')
      .select('*')
      .eq('property_id', propId)

    if (itsErr) throw itsErr
    setItems((its ?? []) as InventoryItem[])
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

      const savedExpanded = localStorage.getItem('expandedTree')
      if (savedExpanded) setExpanded(JSON.parse(savedExpanded))

      await loadAll(prop.id)
    }

    init()

    const onDocClick = () => setCtxMenu(null)
    document.addEventListener('click', onDocClick)
    return () => document.removeEventListener('click', onDocClick)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    localStorage.setItem('expandedTree', JSON.stringify(expanded))
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

  const isChecked = (id: string) => {
    const branch = descendantsOf(id)
    return branch.every(x => selectedSet.has(x))
  }

  const isIndeterminate = (id: string) => {
    const branch = descendantsOf(id)
    const selectedCount = branch.filter(x => selectedSet.has(x)).length
    return selectedCount > 0 && selectedCount < branch.length
  }

  const toggleSelectBranch = (id: string) => {
    const branch = descendantsOf(id)
    const fully = branch.every(x => selectedSet.has(x))
    if (fully) setSelected(prev => prev.filter(x => !branch.includes(x)))
    else setSelected(prev => Array.from(new Set([...prev, ...branch])))
  }

  const countMap = useMemo(() => {
    const direct: Record<string, number> = {}
    for (const item of items) {
      if (!item.location_id) continue
      direct[item.location_id] = (direct[item.location_id] || 0) + 1
    }

    const rollup: Record<string, number> = {}
    const compute = (id: string): number => {
      if (rollup[id] !== undefined) return rollup[id]
      let total = direct[id] || 0
      const kids = childrenMap[id] || []
      for (const k of kids) total += compute(k.id)
      rollup[id] = total
      return total
    }

    locations.forEach(l => compute(l.id))
    return rollup
  }, [items, locations, childrenMap])

  const filteredItems = useMemo(() => {
    if (selected.length === 0) return []
    return items.filter(i => i.location_id && selectedSet.has(i.location_id))
  }, [items, selected, selectedSet])

  /* ------------------------------ search filter (tree) ------------------------------ */

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

  /* ------------------------------ inline rename ------------------------------ */

  const startInlineRename = (loc: LocationRow) => {
    setInlineEditId(loc.id)
    setInlineEditValue(loc.name)
    setCtxMenu(null)
    setTimeout(() => {
      // focus the row; input auto focuses
      focusMapRef.current[loc.id]?.focus()
    }, 0)
  }

  const commitInlineRename = async () => {
    if (!inlineEditId || !property?.id) return
    const newName = inlineEditValue.trim()
    if (!newName) {
      setInlineEditId(null)
      return
    }

    const { error } = await supabase.from('locations').update({ name: newName }).eq('id', inlineEditId)
    if (error) return alert(error.message)

    setLocations(prev => prev.map(l => (l.id === inlineEditId ? { ...l, name: newName } : l)))
    setInlineEditId(null)
  }

  const cancelInlineRename = () => {
    setInlineEditId(null)
    setInlineEditValue('')
  }

  /* ------------------------------ create / delete locations ------------------------------ */

  const createRoot = async () => {
    if (!property?.id) return
    const name = newRootName.trim()
    if (!name) return

    const maxSort = Math.max(
      0,
      ...locations.filter(l => !l.parent_id).map(l => l.sort_order ?? 0)
    )

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
    setExpanded(prev => Array.from(new Set([...prev])))
  }

  const addChild = async (parentId: string) => {
    if (!property?.id) return
    const parent = byId[parentId]
    if (!parent) return

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
    const hasItems = (countMap[id] || 0) > 0
    if (hasChildren) return alert('Cannot delete a location that has child locations. Move/delete children first.')
    if (hasItems) return alert('Cannot delete a location that contains inventory items. Move/delete items first.')

    if (!confirm('Delete this location?')) return

    const { error } = await supabase.from('locations').delete().eq('id', id)
    if (error) return alert(error.message)

    setLocations(prev => prev.filter(l => l.id !== id))
    setSelected(prev => prev.filter(x => x !== id))
    setExpanded(prev => prev.filter(x => x !== id))
    setCtxMenu(null)
  }

  /* ------------------------------ drag & drop reorder ------------------------------ */
  /**
   * Behavior:
   * - Drag a node onto another node:
   *   - If dropped on a parent node (node with children OR you intend it): it becomes a child of that node (reparent)
   *   - Otherwise it reorders within the target's parent sibling list (sort_order update)
   */
  const reorderSiblings = async (activeId: string, targetId: string) => {
    const active = byId[activeId]
    const target = byId[targetId]
    if (!active || !target) return

    // if target has children and is expanded, treat as "move into target" (reparent)
    const targetHasChildren = (childrenMap[targetId] || []).length > 0
    const targetIsExpanded = expanded.includes(targetId)

    let newParentId: string | null
    let reorderParentId: string | null

    if (targetHasChildren && targetIsExpanded && targetId !== active.parent_id) {
      // move into target
      newParentId = targetId
      reorderParentId = targetId
    } else {
      // reorder into target's parent
      newParentId = target.parent_id
      reorderParentId = target.parent_id
    }

    // Build the sibling list for reorderParentId
    const siblings =
      reorderParentId === null
        ? roots.slice()
        : (childrenMap[reorderParentId] || []).slice()

    // Remove active from siblings if already there
    const siblingsNoActive = siblings.filter(s => s.id !== activeId)

    // Insert active before target (or at end if target not in list)
    const targetIndex = siblingsNoActive.findIndex(s => s.id === targetId)
    const insertIndex = targetIndex >= 0 ? targetIndex : siblingsNoActive.length

    const next = siblingsNoActive.slice()
    next.splice(insertIndex, 0, { ...active, parent_id: newParentId } as LocationRow)

    // Persist: update parent_id + sort_order for all siblings in this group
    // (single transaction would be nicer, but sequential updates are fine for now)
    for (let i = 0; i < next.length; i++) {
      const loc = next[i]
      const { error } = await supabase
        .from('locations')
        .update({ parent_id: loc.parent_id, sort_order: i + 1 })
        .eq('id', loc.id)

      if (error) return alert(error.message)
    }

    // Reload to keep state authoritative
    if (property?.id) await loadAll(property.id)

    // Ensure parent expanded if we moved into it
    if (newParentId) setExpanded(prev => (prev.includes(newParentId) ? prev : [...prev, newParentId]))
  }

  /* ------------------------------ photos ------------------------------ */

  const handlePhotoUpload = async (files: FileList) => {
    if (!photoTarget) return

    const uploadedUrls: string[] = []
    for (const file of Array.from(files)) {
      const filePath = `${photoTarget.id}/${Date.now()}-${file.name}`
      const { error } = await supabase.storage.from('item-photos').upload(filePath, file)
      if (error) return alert(error.message)
      const { data } = supabase.storage.from('item-photos').getPublicUrl(filePath)
      uploadedUrls.push(data.publicUrl)
    }

    const updatedPhotos = [...(photoTarget.photos || []), ...uploadedUrls]
    const { error: updateError } = await supabase.from('items').update({ photos: updatedPhotos }).eq('id', photoTarget.id)
    if (updateError) return alert(updateError.message)

    setItems(prev => prev.map(i => (i.id === photoTarget.id ? { ...i, photos: updatedPhotos } : i)))
    setPhotoTarget(null)
  }

  /* ------------------------------ keyboard nav ------------------------------ */

  const flattenedVisibleIds = useMemo(() => {
    const out: string[] = []
    const visit = (node: LocationRow, depth: number) => {
      if (searchVisibleSet && !searchVisibleSet.has(node.id)) return
      out.push(node.id)
      const kids = childrenMap[node.id] || []
      if (expanded.includes(node.id)) {
        for (const k of kids) visit(k, depth + 1)
      }
    }
    for (const r of roots) visit(r, 0)
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

    const { attributes, listeners, setNodeRef, transform } = useDraggable({ id: node.id })
    const style = transform ? { transform: CSS.Translate.toString(transform) } : undefined

    const { setNodeRef: setDropRef, isOver } = useDroppable({ id: node.id })

    const railColor =
      depth === 0 ? 'bg-indigo-500' : depth === 1 ? 'bg-indigo-300' : 'bg-slate-300'

    const isInline = inlineEditId === node.id

    if (searchVisibleSet && !searchVisibleSet.has(node.id)) return null

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
            } else if (e.key === ' ') {
              e.preventDefault()
              toggleSelectBranch(node.id)
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
          title="Right-click for actions. Drag handle to reorder."
        >
          {/* connector rail */}
          <div className={`w-1.5 h-7 ${railColor} rounded-full`} />

          {/* subtle connector line (indent guide) */}
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

          {/* checkbox with indeterminate */}
          <input
            type="checkbox"
            checked={isChecked(node.id)}
            ref={(el) => {
              if (el) el.indeterminate = isIndeterminate(node.id)
            }}
            onChange={() => toggleSelectBranch(node.id)}
            title="Select this location (includes children)"
          />

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

          {/* count badge */}
          <span className="text-xs bg-slate-200 px-2 py-0.5 rounded-full ml-2" title="Total items in this branch">
            {countMap[node.id] || 0}
          </span>

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
    <main className="min-h-screen bg-slate-100 p-8">
      {/* hidden file input for photo uploads */}
      <input
        type="file"
        multiple
        accept="image/*"
        ref={fileInputRef}
        className="hidden"
        onChange={e => {
          if (e.target.files) handlePhotoUpload(e.target.files)
        }}
      />

      {/* Locations */}
      <DndContext
        collisionDetection={closestCenter}
        onDragEnd={async (event) => {
          const { active, over } = event
          if (!over || active.id === over.id) return
          await reorderSiblings(String(active.id), String(over.id))
        }}
      >
        <div className="bg-white p-6 rounded-xl shadow-md mb-6">
          <div className="flex items-center justify-between gap-3 mb-4">
            <div>
              <h1 className="text-2xl font-bold text-slate-900">Inventory Locations</h1>
              <div className="text-sm text-slate-500 mt-1">
                Tip: Right-click a location for actions. Double-click name to rename. Drag handle to reorder.
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
            roots.map(root => (
              <div
                key={root.id}
                ref={(el) => {
                  focusMapRef.current[root.id] = el
                }}
              >
                <TreeNode node={root} depth={0} />
              </div>
            ))
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
      </DndContext>

      {/* Inventory */}
      <div className="mb-3">
        <button onClick={() => setIsInventoryCollapsed(prev => !prev)} className="text-sm text-indigo-600">
          {isInventoryCollapsed ? 'Show Inventory' : 'Hide Inventory'}
        </button>
      </div>

      {!isInventoryCollapsed && (
        <div className="space-y-4">
          {selected.length === 0 ? (
            <div className="text-slate-600">Select one or more locations to view inventory items.</div>
          ) : (
            filteredItems.map(item => (
              <div
                key={item.id}
                className="bg-white rounded-xl shadow-md p-4 flex gap-4 items-start"
              >
                {/* Thumbnail / add photo */}
                <div
                  className="w-24 h-24 border rounded bg-slate-100 cursor-pointer relative"
                  onClick={() => {
                    setPhotoTarget(item)
                    fileInputRef.current?.click()
                  }}
                  title="Click to add photo(s)"
                >
                  {item.photos?.length ? (
                    <img src={item.photos[0]} className="w-full h-full object-cover rounded" />
                  ) : (
                    <img src="/no-image.jpg" className="w-full h-full object-contain p-4 opacity-60" />
                  )}

                  <div className="absolute inset-0 opacity-0 hover:opacity-100 transition-opacity flex items-center justify-center text-xs text-white bg-black/40 rounded">
                    Click to Add Photo
                  </div>
                </div>

                {/* Details (click to edit) */}
                <div className="flex-1 cursor-pointer" onClick={() => setEditingItem(item)} title="Click to edit item">
                  <div className="font-semibold text-slate-900">{item.name}</div>
                  <div className="text-sm text-slate-600">
                    <div><span className="font-medium">Category:</span> {item.category ?? '—'}</div>
                    <div><span className="font-medium">Vendor:</span> {item.vendor ?? '—'}</div>
                    <div><span className="font-medium">Price:</span> {typeof item.price === 'number' ? `$${item.price.toFixed(2)}` : '—'}</div>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex flex-col gap-2">
                  <button
                    onClick={() => setEditingItem(item)}
                    className="text-indigo-700 font-semibold text-left"
                    title="Edit item"
                  >
                    Edit
                  </button>

                  <button
                    onClick={async () => {
                      if (!confirm('Delete this item?')) return
                      const { error } = await supabase.from('items').delete().eq('id', item.id)
                      if (error) return alert(error.message)
                      setItems(prev => prev.filter(i => i.id !== item.id))
                    }}
                    className="text-red-600 font-semibold text-left"
                    title="Delete item"
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Edit Modal */}
      {editingItem && (
        <EditItemModal
          item={editingItem}
          onClose={() => setEditingItem(null)}
          onUpdated={(updated) => setItems(prev => prev.map(i => (i.id === updated.id ? updated : i)))}
          onDeleted={(id) => setItems(prev => prev.filter(i => i.id !== id))}
        />
      )}
    </main>
  )
}
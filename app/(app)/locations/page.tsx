'use client'

import React, { useEffect, useMemo, useRef, useState } from 'react'
import { supabaseBrowser } from '@/lib/supabase-browser'
import {
  DndContext,
  DragEndEvent,
  DragOverEvent,
  PointerSensor,
  useSensor,
  useSensors,
  closestCenter,
  useDroppable
} from '@dnd-kit/core'

type LocationRow = {
  id: string
  name: string
  parent_id: string | null
  sort_order: number | null
  property_id: string
  created_at?: string
}

type ItemRow = {
  id: string
  location_id: string
  property_id: string
}

type MenuState =
  | {
      open: true
      x: number
      y: number
      locationId: string
    }
  | { open: false }

function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(' ')
}

function Chevron({ open }: { open: boolean }) {
  return (
    <span className="inline-flex items-center justify-center w-5 text-slate-500">
      <span
        className={cx(
          'transition-transform duration-200 ease-out inline-block',
          open && 'rotate-90'
        )}
      >
        ▸
      </span>
    </span>
  )
}

function depthAccent(depth: number) {
  // subtle differences per level
  if (depth === 0) return 'border-l-indigo-600'
  if (depth === 1) return 'border-l-indigo-400 bg-indigo-50/50'
  if (depth === 2) return 'border-l-sky-400 bg-sky-50/50'
  return 'border-l-slate-300 bg-slate-50/50'
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n))
}

export default function LocationsPage() {
  const supabase = supabaseBrowser()

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } })
  )

  const [propertyId, setPropertyId] = useState<string | null>(null)
  const [locations, setLocations] = useState<LocationRow[]>([])
  const [items, setItems] = useState<ItemRow[]>([])

  // expanded state (persisted)
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const expandedLoadedRef = useRef(false)

  // add / rename
  const [isAddOpen, setIsAddOpen] = useState(false)
  const [addName, setAddName] = useState('')
  const [addParent, setAddParent] = useState<string | null>(null)

  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')

  // context menu
  const [menu, setMenu] = useState<MenuState>({ open: false })

  // drag feedback / hover
  const [dragOverId, setDragOverId] = useState<string | null>(null)

  // ---------- Load ----------
  useEffect(() => {
    const init = async () => {
      const { data: prop, error: propErr } = await supabase
        .from('properties')
        .select('id')
        .limit(1)
        .single()

      if (propErr || !prop?.id) return
      setPropertyId(prop.id)

      await Promise.all([loadLocations(prop.id), loadItems(prop.id)])
    }
    init()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function loadLocations(pid: string) {
    const { data, error } = await supabase
      .from('locations')
      .select('id,name,parent_id,sort_order,property_id,created_at')
      .eq('property_id', pid)
      .order('parent_id', { ascending: true })
      .order('sort_order', { ascending: true, nullsFirst: false })
      .order('created_at', { ascending: true })
      .order('name', { ascending: true })

    if (error) {
      console.error('loadLocations error', error)
      setLocations([])
      return
    }
    setLocations((data ?? []) as LocationRow[])
  }

  async function loadItems(pid: string) {
    const { data, error } = await supabase
      .from('items')
      .select('id,location_id,property_id')
      .eq('property_id', pid)

    if (error) {
      console.error('loadItems error', error)
      setItems([])
      return
    }
    setItems((data ?? []) as ItemRow[])
  }

  // ---------- Expanded persistence ----------
  useEffect(() => {
    if (!propertyId || expandedLoadedRef.current) return
    expandedLoadedRef.current = true
    try {
      const raw = localStorage.getItem(`property.locations.expanded.${propertyId}`)
      if (raw) setExpanded(JSON.parse(raw))
    } catch {}
  }, [propertyId])

  useEffect(() => {
    if (!propertyId || !expandedLoadedRef.current) return
    try {
      localStorage.setItem(
        `property.locations.expanded.${propertyId}`,
        JSON.stringify(expanded)
      )
    } catch {}
  }, [expanded, propertyId])

  // ---------- Tree helpers ----------
  const byId = useMemo(() => {
    const m = new Map<string, LocationRow>()
    locations.forEach(l => m.set(l.id, l))
    return m
  }, [locations])

  const childrenMap = useMemo(() => {
    const m = new Map<string | null, LocationRow[]>()
    for (const l of locations) {
      const key = l.parent_id ?? null
      if (!m.has(key)) m.set(key, [])
      m.get(key)!.push(l)
    }
    // stable order: sort_order then name
    for (const [k, arr] of m.entries()) {
      arr.sort((a, b) => {
        const ao = a.sort_order ?? 999999
        const bo = b.sort_order ?? 999999
        if (ao !== bo) return ao - bo
        return a.name.localeCompare(b.name)
      })
      m.set(k, arr)
    }
    return m
  }, [locations])

  function getChildren(parentId: string | null) {
    return childrenMap.get(parentId ?? null) ?? []
  }

  function getAllDescendantIds(id: string): string[] {
    const out: string[] = []
    const stack = [id]
    while (stack.length) {
      const cur = stack.pop()!
      const kids = getChildren(cur)
      for (const k of kids) {
        out.push(k.id)
        stack.push(k.id)
      }
    }
    return out
  }

  // direct items tied to a location
  const directItemCount = useMemo(() => {
    const m = new Map<string, number>()
    for (const it of items) {
      m.set(it.location_id, (m.get(it.location_id) ?? 0) + 1)
    }
    return m
  }, [items])

  // aggregate count for a location (includes all descendants)
  const aggregateItemCount = useMemo(() => {
    const m = new Map<string, number>()
    for (const loc of locations) {
      const descendants = getAllDescendantIds(loc.id)
      let total = directItemCount.get(loc.id) ?? 0
      for (const d of descendants) total += directItemCount.get(d) ?? 0
      m.set(loc.id, total)
    }
    return m
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locations, directItemCount])

  // ---------- UI actions ----------
  function toggleExpand(id: string) {
    setExpanded(prev => ({ ...prev, [id]: !prev[id] }))
  }

  function openAdd(parentId: string | null) {
    setIsAddOpen(true)
    setAddName('')
    setAddParent(parentId)
  }

  async function addLocation() {
    if (!propertyId) return
    const name = addName.trim()
    if (!name) return

    // compute next sort_order at that parent
    const siblings = getChildren(addParent)
    const maxSort = siblings.reduce((m, s) => Math.max(m, s.sort_order ?? 0), 0)
    const nextSort = maxSort + 1

    const { error } = await supabase.from('locations').insert({
      name,
      parent_id: addParent,
      property_id: propertyId,
      sort_order: nextSort
    })

    if (error) {
      alert(error.message)
      return
    }

    // ensure parent expanded
    if (addParent) setExpanded(prev => ({ ...prev, [addParent]: true }))

    setIsAddOpen(false)
    setAddName('')
    setAddParent(null)
    await loadLocations(propertyId)
  }

  function beginRename(loc: LocationRow) {
    setRenamingId(loc.id)
    setRenameValue(loc.name)
  }

  async function commitRename() {
    if (!propertyId || !renamingId) return
    const val = renameValue.trim()
    if (!val) {
      setRenamingId(null)
      return
    }
    const { error } = await supabase
      .from('locations')
      .update({ name: val })
      .eq('id', renamingId)

    if (error) {
      alert(error.message)
      return
    }
    setRenamingId(null)
    await loadLocations(propertyId)
  }

  async function deleteLocation(locationId: string) {
    if (!propertyId) return

    const subtree = [locationId, ...getAllDescendantIds(locationId)]
    const hasItems = items.some(it => subtree.includes(it.location_id))
    if (hasItems) {
      alert('Cannot delete: this location (or a child location) has inventory items.')
      return
    }

    const hasChildren = getChildren(locationId).length > 0
    if (hasChildren) {
      // children exist but no items — we can allow delete only if user explicitly wants cascade.
      // Keeping conservative: disallow to avoid accidental structure loss.
      alert('Cannot delete: this location has child locations (even though they have no items). Move or delete children first.')
      return
    }

    const { error } = await supabase.from('locations').delete().eq('id', locationId)
    if (error) {
      alert(error.message)
      return
    }
    await loadLocations(propertyId)
  }

  async function moveToRoot(locationId: string) {
    if (!propertyId) return
    const loc = byId.get(locationId)
    if (!loc) return
    if (loc.parent_id === null) return

    // assign end of root list
    const roots = getChildren(null)
    const maxSort = roots.reduce((m, s) => Math.max(m, s.sort_order ?? 0), 0)

    await supabase
      .from('locations')
      .update({ parent_id: null, sort_order: maxSort + 1 })
      .eq('id', locationId)

    // renumber old siblings to close gaps
    await renumberSiblings(loc.parent_id)

    await loadLocations(propertyId)
  }

  // ---------- Sorting / reparent persistence ----------
  async function renumberSiblings(parentId: string | null) {
    if (!propertyId) return
    const siblings = getChildren(parentId).slice().sort((a, b) => {
      const ao = a.sort_order ?? 999999
      const bo = b.sort_order ?? 999999
      if (ao !== bo) return ao - bo
      return a.name.localeCompare(b.name)
    })

    for (let i = 0; i < siblings.length; i++) {
      const desired = i + 1
      if ((siblings[i].sort_order ?? null) !== desired) {
        await supabase.from('locations').update({ sort_order: desired }).eq('id', siblings[i].id)
      }
    }
  }

  async function reorderWithinParent(parentId: string | null, activeId: string, overId: string) {
    if (!propertyId) return
    const siblings = getChildren(parentId)
    const oldIndex = siblings.findIndex(s => s.id === activeId)
    const newIndex = siblings.findIndex(s => s.id === overId)
    if (oldIndex < 0 || newIndex < 0) return

    const moved = arrayMove(siblings, oldIndex, newIndex)

    // persist sequential sort_order
    for (let i = 0; i < moved.length; i++) {
      await supabase.from('locations').update({ sort_order: i + 1 }).eq('id', moved[i].id)
    }
  }

  async function reparentToTarget(activeId: string, targetId: string | null) {
    if (!propertyId) return
    const active = byId.get(activeId)
    if (!active) return

    // prevent nesting into own subtree
    if (targetId) {
      const subtree = getAllDescendantIds(activeId)
      if (subtree.includes(targetId)) return
    }

    const oldParent = active.parent_id ?? null
    const newParent = targetId

    // if unchanged, nothing to do
    if (oldParent === newParent) return

    // place at end of new parent's siblings
    const newSiblings = getChildren(newParent)
    const maxSort = newSiblings.reduce((m, s) => Math.max(m, s.sort_order ?? 0), 0)

    const { error } = await supabase
      .from('locations')
      .update({ parent_id: newParent, sort_order: maxSort + 1 })
      .eq('id', activeId)

    if (error) {
      alert(error.message)
      return
    }

    // keep target expanded
    if (newParent) setExpanded(prev => ({ ...prev, [newParent]: true }))

    // renumber old siblings to close gaps
    await renumberSiblings(oldParent)

    await loadLocations(propertyId)
  }

  // ---------- DnD events ----------
  function onDragOver(e: DragOverEvent) {
    const overId = (e.over?.id as string | undefined) ?? null
    setDragOverId(overId)
  }

  async function onDragEnd(e: DragEndEvent) {
    setDragOverId(null)
    const activeId = e.active.id as string
    const overId = (e.over?.id as string | undefined) ?? null

    if (!propertyId || !overId) return
    if (activeId === overId) return

    // We support two drop targets:
    // 1) Another location row id -> if you drop ON the row, it becomes a child of that row
    // 2) A "group container" id: parent::<parentId or root> -> reorder within that parent
    if (overId.startsWith('parent::')) {
      const parentKey = overId.replace('parent::', '')
      const parentId = parentKey === 'root' ? null : parentKey
      const active = byId.get(activeId)
      if (!active) return

      // only reorder if active is already in that parent
      if ((active.parent_id ?? null) !== parentId) {
        // if user drops into another parent area, reparent to that parent (end)
        await reparentToTarget(activeId, parentId)
        return
      }

      // In container drops we can’t know exact sibling target; keep it simple:
      // if dropped in same parent container, no-op.
      return
    }

    // Otherwise overId is a location id
    const overLoc = byId.get(overId)
    const activeLoc = byId.get(activeId)
    if (!overLoc || !activeLoc) return

    const activeParent = activeLoc.parent_id ?? null
    const overParent = overLoc.parent_id ?? null

    // If both in same parent, default behavior is reorder (drop near row)
    if (activeParent === overParent) {
      await reorderWithinParent(activeParent, activeId, overId)
      await loadLocations(propertyId)
      return
    }

    // If different parents, *most intuitive* is:
    // - dropping onto a row makes it a child of that row (reparent)
    await reparentToTarget(activeId, overId)
  }

  // ---------- Context menu ----------
  useEffect(() => {
    const close = () => setMenu({ open: false })
    window.addEventListener('click', close)
    window.addEventListener('keydown', (ev) => {
      if (ev.key === 'Escape') close()
    })
    return () => {
      window.removeEventListener('click', close)
    }
  }, [])

  function openMenu(e: React.MouseEvent, locationId: string) {
    e.preventDefault()
    setMenu({ open: true, x: e.clientX, y: e.clientY, locationId })
  }

  // ---------- Render ----------
  if (!propertyId) return null

  return (
    <main className="max-w-6xl mx-auto px-6 py-8">
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200">
        <div className="px-6 py-5 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">Locations</h1>
            <p className="text-sm text-slate-600 mt-1">
              Drag to reorder. Drop <span className="font-medium">onto</span> a location to nest.
              Right-click for actions. Double-click to rename.
            </p>
          </div>
          <button
            onClick={() => openAdd(null)}
            className="inline-flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-xl shadow-sm transition"
          >
            <span className="text-lg leading-none">+</span>
            New Location
          </button>
        </div>

        {/* Add Modal */}
        {isAddOpen && (
          <div className="fixed inset-0 z-50 bg-black/30 backdrop-blur-[2px] flex items-center justify-center p-4">
            <div className="bg-white w-full max-w-lg rounded-2xl shadow-xl border border-slate-200">
              <div className="p-5 border-b">
                <div className="text-lg font-semibold text-slate-900">Add Location</div>
                <div className="text-sm text-slate-600 mt-1">
                  Create at root, or choose a parent.
                </div>
              </div>

              <div className="p-5 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Location Name
                  </label>
                  <input
                    value={addName}
                    onChange={(e) => setAddName(e.target.value)}
                    placeholder="e.g., Living Room"
                    className="w-full border border-slate-300 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Parent (optional)
                  </label>
                  <select
                    value={addParent ?? ''}
                    onChange={(e) => setAddParent(e.target.value ? e.target.value : null)}
                    className="w-full border border-slate-300 rounded-xl px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-200"
                  >
                    <option value="">Root Level</option>
                    {locations
                      .slice()
                      .sort((a, b) => a.name.localeCompare(b.name))
                      .map((l) => (
                        <option key={l.id} value={l.id}>
                          {l.name}
                        </option>
                      ))}
                  </select>
                  {addParent && (
                    <div className="text-xs text-slate-500 mt-1">
                      Will be created under: <span className="font-medium">{byId.get(addParent)?.name}</span>
                    </div>
                  )}
                </div>
              </div>

              <div className="p-5 border-t flex justify-end gap-2">
                <button
                  onClick={() => {
                    setIsAddOpen(false)
                    setAddName('')
                    setAddParent(null)
                  }}
                  className="px-4 py-2 rounded-xl border border-slate-300 hover:bg-slate-50 transition"
                >
                  Cancel
                </button>
                <button
                  onClick={addLocation}
                  className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white transition"
                >
                  Save
                </button>
              </div>
            </div>
          </div>
        )}

        <div className="px-6 pb-6">
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragOver={onDragOver}
            onDragEnd={onDragEnd}
          >
            {/* ROOT container droppable (used for un-nesting by dropping to root area) */}
            <ParentDropZone parentId={null} />

            <TreeList
              parentId={null}
              depth={0}
              getChildren={getChildren}
              expanded={expanded}
              toggleExpand={toggleExpand}
              aggregateCount={aggregateItemCount}
              renamingId={renamingId}
              renameValue={renameValue}
              setRenameValue={setRenameValue}
              beginRename={(loc) => beginRename(loc)}
              commitRename={commitRename}
              cancelRename={() => setRenamingId(null)}
              openMenu={openMenu}
              openAdd={openAdd}
              dragOverId={dragOverId}
            />
          </DndContext>
        </div>
      </div>

      {/* Context menu */}
      {menu.open && (
        <div
          className="fixed z-[60] bg-white border border-slate-200 shadow-xl rounded-xl overflow-hidden min-w-[220px]"
          style={{ left: menu.x, top: menu.y }}
          onClick={(e) => e.stopPropagation()}
        >
          <MenuItem
            label="Add child location"
            onClick={() => {
              setMenu({ open: false })
              openAdd(menu.locationId)
            }}
          />
          <MenuItem
            label="Rename"
            onClick={() => {
              setMenu({ open: false })
              const loc = byId.get(menu.locationId)
              if (loc) beginRename(loc)
            }}
          />
          <MenuItem
            label="Move to root (un-nest)"
            onClick={async () => {
              setMenu({ open: false })
              await moveToRoot(menu.locationId)
            }}
          />
          <div className="h-px bg-slate-100" />
          <MenuItem
            label="Delete"
            danger
            onClick={async () => {
              setMenu({ open: false })
              await deleteLocation(menu.locationId)
            }}
          />
        </div>
      )}
    </main>
  )

  function MenuItem({
    label,
    onClick,
    danger
  }: {
    label: string
    onClick: () => void
    danger?: boolean
  }) {
    return (
      <button
        className={cx(
          'w-full text-left px-3 py-2 text-sm hover:bg-slate-50 transition',
          danger ? 'text-red-600' : 'text-slate-800'
        )}
        onClick={onClick}
      >
        {label}
      </button>
    )
  }

  function ParentDropZone({ parentId }: { parentId: string | null }) {
    const id = `parent::${parentId ?? 'root'}`
    const { isOver, setNodeRef } = useDroppable({ id })

    return (
      <div
        ref={setNodeRef}
        className={cx(
          'rounded-xl border border-dashed transition mb-3',
          isOver ? 'border-indigo-400 bg-indigo-50' : 'border-slate-200 bg-slate-50/40'
        )}
      >
        <div className="px-4 py-3 text-sm text-slate-600">
          Drop here to move to{' '}
          <span className="font-medium">{parentId ? 'this parent' : 'Root'}</span>
        </div>
      </div>
    )
  }
}

function TreeList(props: {
  parentId: string | null
  depth: number
  getChildren: (parentId: string | null) => LocationRow[]
  expanded: Record<string, boolean>
  toggleExpand: (id: string) => void
  aggregateCount: Map<string, number>
  renamingId: string | null
  renameValue: string
  setRenameValue: (v: string) => void
  beginRename: (loc: LocationRow) => void
  commitRename: () => void
  cancelRename: () => void
  openMenu: (e: React.MouseEvent, locationId: string) => void
  openAdd: (parentId: string | null) => void
  dragOverId: string | null
}) {
  const {
    parentId,
    depth,
    getChildren,
    expanded,
    toggleExpand,
    aggregateCount,
    renamingId,
    renameValue,
    setRenameValue,
    beginRename,
    commitRename,
    cancelRename,
    openMenu,
    openAdd,
    dragOverId
  } = props

  const siblings = getChildren(parentId)
  const ids = siblings.map(s => s.id)

  return (
    <div>
      {/* droppable zone for this parent (helps unnest to root and future enhancements) */}
      <div className="mb-2">
        <div className="flex items-center justify-between">
          {parentId === null ? (
            <div className="text-sm text-slate-500">Root</div>
          ) : (
            <div className="text-sm text-slate-500">Children</div>
          )}

          <button
            onClick={() => openAdd(parentId)}
            className="text-sm text-indigo-700 hover:text-indigo-800 hover:underline"
            title="Add a new child location"
          >
            + Add here
          </button>
        </div>
      </div>

      <SortableContext items={ids} strategy={verticalListSortingStrategy}>
        <div className="space-y-1">
          {siblings.map((node) => (
            <TreeRow
              key={node.id}
              node={node}
              depth={depth}
              hasChildren={getChildren(node.id).length > 0}
              isExpanded={!!expanded[node.id]}
              onToggle={() => toggleExpand(node.id)}
              count={aggregateCount.get(node.id) ?? 0}
              isRenaming={renamingId === node.id}
              renameValue={renameValue}
              setRenameValue={setRenameValue}
              onBeginRename={() => beginRename(node)}
              onCommitRename={commitRename}
              onCancelRename={cancelRename}
              onContextMenu={(e) => openMenu(e, node.id)}
              dragOverId={dragOverId}
            >
              {!!expanded[node.id] && (
                <div className="mt-1">
                  <TreeList {...props} parentId={node.id} depth={depth + 1} />
                </div>
              )}
            </TreeRow>
          ))}
        </div>
      </SortableContext>
    </div>
  )
}

function TreeRow(props: {
  node: LocationRow
  depth: number
  hasChildren: boolean
  isExpanded: boolean
  onToggle: () => void
  count: number
  isRenaming: boolean
  renameValue: string
  setRenameValue: (v: string) => void
  onBeginRename: () => void
  onCommitRename: () => void
  onCancelRename: () => void
  onContextMenu: (e: React.MouseEvent) => void
  dragOverId: string | null
  children?: React.ReactNode
}) {
  const {
    node,
    depth,
    hasChildren,
    isExpanded,
    onToggle,
    count,
    isRenaming,
    renameValue,
    setRenameValue,
    onBeginRename,
    onCommitRename,
    onCancelRename,
    onContextMenu,
    dragOverId,
    children
  } = props

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
    isOver
  } = useSortable({ id: node.id })

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition
  }

  // Visual drop target highlight when hovering a row
  const highlight = dragOverId === node.id

  return (
    <div ref={setNodeRef} style={style} className={cx(isDragging && 'opacity-70')}>
      <div
        onContextMenu={onContextMenu}
        className={cx(
          'group relative rounded-xl border border-slate-200 px-3 py-2 bg-white',
          'hover:bg-slate-50 transition',
          'border-l-4',
          depthAccent(depth),
          highlight && 'ring-2 ring-indigo-300 bg-indigo-50/60',
          isOver && 'ring-2 ring-indigo-200'
        )}
        style={{ marginLeft: depth * 18 }}
        title="Drag handle to reorder. Drop onto another location to nest. Right-click for actions. Double-click to rename."
      >
        {/* connector line */}
        {depth > 0 && (
          <div
            className="absolute left-[-10px] top-0 bottom-0 w-px bg-slate-200"
            aria-hidden
          />
        )}

        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <button
              onClick={onToggle}
              className={cx(
                'rounded-md hover:bg-white/60 transition',
                !hasChildren && 'opacity-40 cursor-default'
              )}
              disabled={!hasChildren}
              aria-label="Expand/collapse"
            >
              {hasChildren ? <Chevron open={isExpanded} /> : <span className="w-5 inline-block text-slate-400">•</span>}
            </button>

            {/* drag handle */}
            <button
              className="cursor-grab active:cursor-grabbing text-slate-400 hover:text-slate-600"
              {...attributes}
              {...listeners}
              aria-label="Drag to reorder"
              title="Drag to reorder / move"
            >
              ☰
            </button>

            {/* name */}
            <div className="min-w-0">
              {!isRenaming ? (
                <div
                  className="font-medium text-slate-900 truncate"
                  onDoubleClick={onBeginRename}
                >
                  {node.name}{' '}
                  <span className="text-slate-500 font-normal">({count})</span>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <input
                    value={renameValue}
                    onChange={(e) => setRenameValue(e.target.value)}
                    className="border border-slate-300 rounded-lg px-2 py-1 text-sm w-[260px] focus:outline-none focus:ring-2 focus:ring-indigo-200"
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') onCommitRename()
                      if (e.key === 'Escape') onCancelRename()
                    }}
                  />
                  <button
                    className="text-sm px-2 py-1 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700"
                    onClick={onCommitRename}
                  >
                    Save
                  </button>
                  <button
                    className="text-sm px-2 py-1 rounded-lg border border-slate-300 hover:bg-slate-50"
                    onClick={onCancelRename}
                  >
                    Cancel
                  </button>
                </div>
              )}

              <div className="text-xs text-slate-500">
                Tip: drop <span className="font-medium">onto</span> a location to nest
              </div>
            </div>
          </div>

          {/* subtle right-click hint */}
          <div className="text-xs text-slate-400 opacity-0 group-hover:opacity-100 transition">
            Right-click
          </div>
        </div>
      </div>

      {children}
    </div>
  )
}
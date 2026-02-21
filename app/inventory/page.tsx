'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabaseBrowser } from '@/lib/supabase-browser'
import EditItemModal, { InventoryItem } from '@/components/inventory/EditItemModal'
import { DndContext, closestCenter, useDraggable } from '@dnd-kit/core'
import { CSS } from '@dnd-kit/utilities'

type LocationRow = {
  id: string
  name: string
  parent_id: string | null
  sort_order?: number | null
  property_id?: string
}

type CtxMenu = {
  open: boolean
  x: number
  y: number
  locationId: string | null
}

export default function InventoryPage() {
  const supabase = supabaseBrowser()
  const router = useRouter()
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const [property, setProperty] = useState<any>(null)
  const [locations, setLocations] = useState<LocationRow[]>([])
  const [items, setItems] = useState<InventoryItem[]>([])
  const [selected, setSelected] = useState<string[]>([])
  const [expanded, setExpanded] = useState<string[]>([])
  const [inventoryCollapsed, setInventoryCollapsed] = useState(false)

  const [editingItem, setEditingItem] = useState<InventoryItem | null>(null)
  const [photoTarget, setPhotoTarget] = useState<InventoryItem | null>(null)

  const [search, setSearch] = useState('')

  // inline rename
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState<string>('')

  // context menu
  const [ctx, setCtx] = useState<CtxMenu>({ open: false, x: 0, y: 0, locationId: null })

  // debug
  const [debug, setDebug] = useState<string>('')

  /* ---------------- INIT ---------------- */

  useEffect(() => {
    const init = async () => {
      setDebug('Initializing…')

      const { data: userData, error: userErr } = await supabase.auth.getUser()
      if (userErr) setDebug(`auth.getUser error: ${userErr.message}`)
      if (!userData?.user) {
        router.push('/')
        return
      }

      const { data: prop, error: propErr } = await supabase
        .from('properties')
        .select('*')
        .limit(1)
        .single()

      if (propErr) setDebug(`properties error: ${propErr.message}`)
      if (!prop) {
        setDebug('No property returned from properties table.')
        return
      }
      setProperty(prop)

      const { data: locs, error: locErr } = await supabase
        .from('locations')
        .select('*')
        .eq('property_id', prop.id)
        .order('sort_order', { ascending: true })

      if (locErr) setDebug(`locations error: ${locErr.message}`)
      setLocations(locs ?? [])

      const { data: its, error: itemsErr } = await supabase
        .from('items')
        .select('*')
        .eq('property_id', prop.id)

      if (itemsErr) setDebug(`items error: ${itemsErr.message}`)
      setItems(its ?? [])

      const savedExpanded = localStorage.getItem('expandedTree')
      if (savedExpanded) setExpanded(JSON.parse(savedExpanded))

      setDebug('Loaded.')
    }

    init()
  }, [])

  useEffect(() => {
    localStorage.setItem('expandedTree', JSON.stringify(expanded))
  }, [expanded])

  /* ---------------- MAPS / HELPERS ---------------- */

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

  const ancestorsPath = (id: string): string[] => {
    const path: string[] = []
    let cur: LocationRow | undefined = byId[id]
    while (cur) {
      path.unshift(cur.id)
      cur = cur.parent_id ? byId[cur.parent_id] : undefined
    }
    return path
  }

  /* ---------------- COUNTS ---------------- */

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

  /* ---------------- SELECTION ---------------- */

  const toggleSelectBranch = (id: string) => {
    const branch = descendantsOf(id)
    const isFullySelected = branch.every(x => selected.includes(x))

    if (isFullySelected) {
      setSelected(prev => prev.filter(x => !branch.includes(x)))
    } else {
      setSelected(prev => Array.from(new Set([...prev, ...branch])))
    }
  }

  const isIndeterminate = (id: string) => {
    const branch = descendantsOf(id)
    const selectedCount = branch.filter(x => selected.includes(x)).length
    return selectedCount > 0 && selectedCount < branch.length
  }

  const isChecked = (id: string) => {
    const branch = descendantsOf(id)
    return branch.every(x => selected.includes(x))
  }

  const selectedSet = useMemo(() => new Set(selected), [selected])

  const filteredItems = useMemo(() => {
    if (selected.length === 0) return []
    return items.filter(i => i.location_id && selectedSet.has(i.location_id))
  }, [items, selectedSet, selected.length])

  /* ---------------- SEARCH FILTER (safer) ---------------- */

  const searchLower = search.trim().toLowerCase()
  const matchesSearch = (loc: LocationRow) =>
    searchLower === '' ? true : loc.name.toLowerCase().includes(searchLower)

  const searchVisibleSet = useMemo(() => {
    if (!searchLower) return null as Set<string> | null
    const visible = new Set<string>()
    for (const l of locations) {
      if (matchesSearch(l)) {
        ancestorsPath(l.id).forEach(id => visible.add(id))
        visible.add(l.id)
      }
    }
    return visible
  }, [searchLower, locations])

  useEffect(() => {
    if (!searchLower) return
    const toExpand = new Set(expanded)
    for (const l of locations) {
      if (matchesSearch(l)) {
        ancestorsPath(l.id).forEach(id => toExpand.add(id))
      }
    }
    setExpanded(Array.from(toExpand))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchLower])

  /* ---------------- PHOTOS ---------------- */

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

  /* ---------------- DRAG & DROP (reparent) ---------------- */

  async function handleDragEnd(event: any) {
    const { active, over } = event
    if (!over || active.id === over.id) return

    const activeId = String(active.id)
    const overId = String(over.id)

    const activeDesc = new Set(descendantsOf(activeId))
    if (activeDesc.has(overId)) return

    const { error } = await supabase.from('locations').update({ parent_id: overId }).eq('id', activeId)
    if (error) return alert(error.message)

    const { data } = await supabase.from('locations').select('*').eq('property_id', property.id).order('sort_order')
    setLocations(data ?? [])
  }

  /* ---------------- QUICK FIX: Create a root if none exist ---------------- */

  const createRootIfNone = async () => {
    if (!property) return
    const { data: existing } = await supabase
      .from('locations')
      .select('id')
      .eq('property_id', property.id)
      .is('parent_id', null)
      .limit(1)

    if (existing && existing.length > 0) {
      alert('You already have a root location. No action needed.')
      return
    }

    const name = prompt('Root location name? (Example: Household)')
    if (!name?.trim()) return

    const { data, error } = await supabase
      .from('locations')
      .insert({
        property_id: property.id,
        parent_id: null,
        name: name.trim(),
        sort_order: 10
      })
      .select()
      .single()

    if (error) return alert(error.message)

    setLocations(prev => [...prev, data])
    setExpanded(prev => [...prev, data.id])
  }

  /* ---------------- TREE NODE ---------------- */

  function TreeNode({ node, depth }: { node: LocationRow; depth: number }) {
    const children = childrenMap[node.id] || []
    const hasChildren = children.length > 0
    const isOpen = expanded.includes(node.id)

    const { attributes, listeners, setNodeRef, transform } = useDraggable({ id: node.id })
    const style = transform ? { transform: CSS.Translate.toString(transform) } : undefined

    // hide only when search is active; never hide when search is blank
    if (searchVisibleSet && !searchVisibleSet.has(node.id)) return null

    const railColor = depth === 0 ? 'bg-indigo-500' : depth === 1 ? 'bg-indigo-300' : 'bg-slate-300'

    return (
      <div ref={setNodeRef} style={style}>
        <div className="flex items-center gap-2 py-1.5 px-2 rounded-lg hover:bg-slate-50 group" style={{ marginLeft: depth * 14 }}>
          <div className={`w-1.5 h-6 ${railColor} rounded-full`} />

          {hasChildren ? (
            <button
              onClick={() => setExpanded(prev => (prev.includes(node.id) ? prev.filter(x => x !== node.id) : [...prev, node.id]))}
              className="text-xs text-slate-500 w-6"
              title="Expand/collapse"
            >
              {isOpen ? '▾' : '▸'}
            </button>
          ) : (
            <div className="w-6" />
          )}

          <input
            type="checkbox"
            checked={isChecked(node.id)}
            ref={(el) => {
              if (el) el.indeterminate = isIndeterminate(node.id)
            }}
            onChange={() => toggleSelectBranch(node.id)}
          />

          <span className={`text-sm ${depth === 0 ? 'font-semibold text-slate-800' : 'text-slate-700'}`}>{node.name}</span>

          <span className="text-xs bg-slate-200 px-2 py-0.5 rounded-full ml-2">{countMap[node.id] || 0}</span>

          <div
            {...listeners}
            {...attributes}
            className="ml-auto opacity-0 group-hover:opacity-100 cursor-grab text-slate-400 text-xs px-2"
            title="Drag to re-parent"
          >
            ☰
          </div>
        </div>

        <div
          className="overflow-hidden transition-[max-height,opacity] duration-300 ease-in-out"
          style={{
            maxHeight: isOpen ? 800 : 0,
            opacity: isOpen ? 1 : 0.0
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

      <DndContext collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <div className="bg-white p-6 rounded-xl shadow-md mb-6">
          <div className="flex items-center justify-between gap-4 mb-3">
            <h1 className="text-2xl font-bold">Inventory Locations</h1>

            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search locations..."
              className="border rounded-lg px-3 py-2 w-72"
            />
          </div>

          {/* DEBUG PANEL */}
          <div className="mb-4 p-3 rounded-lg bg-slate-50 border text-sm text-slate-700">
            <div><b>Debug:</b> {debug}</div>
            <div><b>Property ID:</b> {property?.id}</div>
            <div><b>Locations loaded:</b> {locations.length}</div>
            <div><b>Roots found (parent_id is null):</b> {roots.length}</div>
            <div><b>Items loaded:</b> {items.length}</div>

            {locations.length > 0 && roots.length === 0 && (
              <div className="mt-2 text-red-700">
                ⚠️ Your locations have <b>no root</b> (none with parent_id = NULL). That will make the tree look empty.
              </div>
            )}

            <div className="mt-2 flex gap-2">
              <button
                onClick={createRootIfNone}
                className="text-xs bg-indigo-600 text-white px-3 py-2 rounded"
              >
                Auto-create Root (if missing)
              </button>
            </div>
          </div>

          {/* TREE */}
          {roots.length === 0 ? (
            <div className="text-slate-500">
              No root locations to display.
            </div>
          ) : (
            roots.map(root => <TreeNode key={root.id} node={root} depth={0} />)
          )}
        </div>
      </DndContext>

      <div className="mb-4">
        <button onClick={() => setInventoryCollapsed(prev => !prev)} className="text-sm text-indigo-600">
          {inventoryCollapsed ? 'Show Inventory' : 'Hide Inventory'}
        </button>
      </div>

      {!inventoryCollapsed && (
        <div className="space-y-4">
          {selected.length === 0 ? (
            <div className="text-slate-500">Select one or more locations to view inventory.</div>
          ) : (
            filteredItems.map(item => (
              <div key={item.id} className="bg-white rounded-xl shadow-md p-4 flex gap-4">
                <div
                  className="w-24 h-24 border rounded bg-slate-100 cursor-pointer"
                  onClick={() => {
                    setPhotoTarget(item)
                    fileInputRef.current?.click()
                  }}
                >
                  {item.photos?.length ? (
                    <img src={item.photos[0]} className="w-full h-full object-cover" />
                  ) : (
                    <img src="/no-image.jpg" className="w-full h-full object-contain p-4 opacity-60" />
                  )}
                </div>

                <div className="flex-1 cursor-pointer" onClick={() => setEditingItem(item)}>
                  <div className="font-semibold text-slate-800">{item.name}</div>
                  <div className="text-sm text-slate-500">{item.vendor ?? ''}</div>
                </div>

                <button
                  onClick={async () => {
                    if (!confirm('Delete this item?')) return
                    const { error } = await supabase.from('items').delete().eq('id', item.id)
                    if (error) return alert(error.message)
                    setItems(prev => prev.filter(i => i.id !== item.id))
                  }}
                  className="text-red-600 font-semibold"
                >
                  Delete
                </button>
              </div>
            ))
          )}
        </div>
      )}

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
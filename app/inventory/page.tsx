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

  // debug
  const [debug, setDebug] = useState<string>('Initializing…')

  /* ---------------- helpers ---------------- */

  const loadProperty = async () => {
    const { data: prop, error: propErr } = await supabase
      .from('properties')
      .select('*')
      .limit(1)
      .single()

    if (propErr) throw new Error(`properties error: ${propErr.message}`)
    if (!prop) throw new Error('No property returned.')

    setProperty(prop)
    return prop
  }

  const loadData = async (propId: string, reason: string) => {
    setDebug(prev => `${prev}\nReload (${reason})…`)

    const { data: locs, error: locErr } = await supabase
      .from('locations')
      .select('*')
      .eq('property_id', propId)
      .order('sort_order', { ascending: true })

    if (locErr) {
      setDebug(prev => `${prev}\nlocations error: ${locErr.message}`)
      setLocations([])
    } else {
      setLocations(locs ?? [])
      setDebug(prev => `${prev}\nlocations rows: ${(locs ?? []).length}`)
    }

    const { data: its, error: itemsErr } = await supabase
      .from('items')
      .select('*')
      .eq('property_id', propId)

    if (itemsErr) {
      setDebug(prev => `${prev}\nitems error: ${itemsErr.message}`)
      setItems([])
    } else {
      setItems(its ?? [])
      setDebug(prev => `${prev}\nitems rows: ${(its ?? []).length}`)
    }
  }

  /* ---------------- INIT (session-safe) ---------------- */

  useEffect(() => {
    const run = async () => {
      try {
        setDebug('Initializing…')

        // Wait for a real session (this is the key change)
        const { data: sess } = await supabase.auth.getSession()
        const session = sess.session

        if (!session?.access_token) {
          setDebug('No session yet. Waiting for auth state change…')
          // Don't redirect—user may already be logged in but session not hydrated yet.
          return
        }

        setDebug(prev => `${prev}\nSession: YES | User: ${session.user.id}`)

        const prop = await loadProperty()
        setDebug(prev => `${prev}\nProperty: ${prop.id}`)

        const savedExpanded = localStorage.getItem('expandedTree')
        if (savedExpanded) setExpanded(JSON.parse(savedExpanded))

        await loadData(prop.id, 'initial')
        setDebug(prev => `${prev}\nLoaded.`)
      } catch (e: any) {
        setDebug(`Init exception: ${e?.message ?? String(e)}`)
      }
    }

    run()

    // Subscribe to auth changes; when session becomes available, load everything
    const { data: sub } = supabase.auth.onAuthStateChange(async (event, session) => {
      try {
        if (!session?.access_token) return

        setDebug(prev => `${prev}\nAuth event: ${event} | User: ${session.user.id}`)

        // Ensure property exists
        const prop = property ?? (await loadProperty())
        await loadData(prop.id, `auth:${event}`)
      } catch (e: any) {
        setDebug(prev => `${prev}\nAuth handler error: ${e?.message ?? String(e)}`)
      }
    })

    // Reload on tab focus (helps with hydration timing issues)
    const onFocus = async () => {
      try {
        const { data: sess } = await supabase.auth.getSession()
        if (!sess.session?.access_token) return
        if (!property?.id) return
        await loadData(property.id, 'focus')
      } catch {
        // ignore
      }
    }
    window.addEventListener('focus', onFocus)

    return () => {
      sub.subscription.unsubscribe()
      window.removeEventListener('focus', onFocus)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    localStorage.setItem('expandedTree', JSON.stringify(expanded))
  }, [expanded])

  /* ---------------- MAPS / TREE ---------------- */

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

  /* ---------------- SEARCH FILTER (tree) ---------------- */

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
      if (matchesSearch(l)) ancestorsPath(l.id).forEach(id => toExpand.add(id))
    }
    setExpanded(Array.from(toExpand))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchLower])

  /* ---------------- BREADCRUMB SELECTION SUMMARY ---------------- */

  const selectionSummary = useMemo(() => {
    const selectedIds = Array.from(new Set(selected))
    const isDescOfAnotherSelected = (id: string) => {
      const path = ancestorsPath(id)
      return path.some(a => a !== id && selectedIds.includes(a))
    }
    const top = selectedIds.filter(id => !isDescOfAnotherSelected(id))
    const labelFor = (id: string) => byId[id]?.name ?? id
    return top.map(id => ({
      id,
      pathLabel: ancestorsPath(id).map(labelFor).join(' → ')
    }))
  }, [selected, byId])

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

    // prevent cycles
    const activeDesc = new Set(descendantsOf(activeId))
    if (activeDesc.has(overId)) return

    const { error } = await supabase.from('locations').update({ parent_id: overId }).eq('id', activeId)
    if (error) return alert(error.message)

    if (property?.id) await loadData(property.id, 'drag')
  }

  /* ---------------- DEBUG ACTIONS ---------------- */

  const testLocationsAccess = async () => {
    if (!property?.id) {
      setDebug(prev => `${prev}\nNo property loaded yet.`)
      return
    }

    try {
      const { data: s } = await supabase.auth.getSession()
      const uid = s.session?.user?.id ?? 'NO_SESSION'
      const token = s.session?.access_token ? 'YES' : 'NO'

      setDebug(`Session: ${token} | User: ${uid}`)

      const { count, error } = await supabase
        .from('locations')
        .select('*', { count: 'exact', head: true })
        .eq('property_id', property.id)

      if (error) {
        setDebug(prev => `${prev}\nlocations count ERROR: ${error.message}`)
        return
      }

      setDebug(prev => `${prev}\nlocations count OK: ${count}`)

      const { data: sample, error: sampleErr } = await supabase
        .from('locations')
        .select('id,name,parent_id,property_id')
        .eq('property_id', property.id)
        .limit(3)

      if (sampleErr) {
        setDebug(prev => `${prev}\nlocations sample ERROR: ${sampleErr.message}`)
      } else {
        setDebug(prev => `${prev}\nlocations sample: ${JSON.stringify(sample)}`)
      }

      // now that we know access works, force reload into state
      await loadData(property.id, 'test-button')
    } catch (e: any) {
      setDebug(`Test exception: ${e?.message ?? String(e)}`)
    }
  }

  /* ---------------- TREE NODE ---------------- */

  function TreeNode({ node, depth }: { node: LocationRow; depth: number }) {
    const children = childrenMap[node.id] || []
    const hasChildren = children.length > 0
    const isOpen = expanded.includes(node.id)

    const { attributes, listeners, setNodeRef, transform } = useDraggable({ id: node.id })
    const style = transform ? { transform: CSS.Translate.toString(transform) } : undefined

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
          <div className="mb-4 p-3 rounded-lg bg-slate-50 border text-sm text-slate-700 whitespace-pre-wrap">
            <div><b>Debug:</b> {debug}</div>
            <div><b>Property ID:</b> {property?.id}</div>
            <div><b>Locations loaded:</b> {locations.length}</div>
            <div><b>Roots found (parent_id is null):</b> {roots.length}</div>
            <div><b>Items loaded:</b> {items.length}</div>

            <div className="mt-3 flex flex-wrap gap-2">
              <button onClick={testLocationsAccess} className="text-xs bg-indigo-600 text-white px-3 py-2 rounded">
                Test Locations Access (and reload)
              </button>

              <button
                onClick={async () => {
                  if (!property?.id) return
                  await loadData(property.id, 'manual')
                }}
                className="text-xs bg-slate-800 text-white px-3 py-2 rounded"
              >
                Reload Data
              </button>
            </div>
          </div>

          {/* Breadcrumb Selection Summary */}
          <div className="mb-4">
            {selectionSummary.length === 0 ? (
              <div className="text-sm text-slate-500">No locations selected.</div>
            ) : (
              <div className="flex flex-wrap gap-2">
                {selectionSummary.map(s => (
                  <span
                    key={s.id}
                    className="text-xs bg-indigo-50 text-indigo-800 px-2 py-1 rounded-full border border-indigo-100"
                    title="Top-level selected branch"
                  >
                    {s.pathLabel}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* TREE */}
          {roots.length === 0 ? (
            <div className="text-slate-500">No root locations to display.</div>
          ) : (
            roots.map(root => <TreeNode key={root.id} node={root} depth={0} />)
          )}
        </div>
      </DndContext>

      {/* Inventory collapsible */}
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
                  title="Click to add photo(s)"
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
'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabaseBrowser } from '@/lib/supabase-browser'
import EditItemModal, { InventoryItem } from '@/components/inventory/EditItemModal'

type LocationRow = {
  id: string
  name: string
  parent_id: string | null
  sort_order?: number | null
  property_id: string
}

type CategoryRow = {
  id: string
  name: string
  property_id: string
}

type ItemRow = InventoryItem & {
  id: string
  property_id: string
  location_id: string | null
  category_id?: string | null
  vendor?: string | null
  price?: number | null
  // photo fields (kept optional so we don’t break if schema differs slightly)
  primary_photo_url?: string | null
  photos?: string[] | null
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

function depthClasses(depth: number) {
  if (depth === 0) return 'border-l-4 border-indigo-600'
  if (depth === 1) return 'border-l-4 border-indigo-400 bg-indigo-50'
  if (depth === 2) return 'border-l-4 border-sky-400 bg-sky-50'
  return 'border-l-4 border-slate-400 bg-slate-50'
}

function getThumb(item: ItemRow): string | null {
  // Prefer explicit primary, else first photo in array if present.
  if (item.primary_photo_url) return item.primary_photo_url
  if (Array.isArray(item.photos) && item.photos.length > 0) return item.photos[0]
  // Some implementations store photos in (item as any).photos
  const anyPhotos = (item as any)?.photos
  if (Array.isArray(anyPhotos) && anyPhotos.length > 0) return anyPhotos[0]
  const anyPrimary = (item as any)?.primary_photo_url
  return typeof anyPrimary === 'string' ? anyPrimary : null
}

function NoImageSilhouette() {
  // simple inline silhouette (replaces “black box”)
  return (
    <div className="w-14 h-14 rounded-lg bg-slate-100 flex items-center justify-center border">
      <svg width="26" height="26" viewBox="0 0 24 24" aria-hidden="true">
        <path
          fill="currentColor"
          className="text-slate-400"
          d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-3.33 0-8 1.67-8 5v1h16v-1c0-3.33-4.67-5-8-5z"
        />
      </svg>
    </div>
  )
}

export default function InventoryPage() {
  const supabase = supabaseBrowser()
  const router = useRouter()

  const [propertyId, setPropertyId] = useState<string | null>(null)

  const [locations, setLocations] = useState<LocationRow[]>([])
  const [items, setItems] = useState<ItemRow[]>([])
  const [categories, setCategories] = useState<CategoryRow[]>([])

  const [expanded, setExpanded] = useState<string[]>([])
  const [selected, setSelected] = useState<string[]>([])
  const selectedSet = useMemo(() => new Set(selected), [selected])

  const [editingItem, setEditingItem] = useState<ItemRow | null>(null)

  // Create Item modal
  const [showCreate, setShowCreate] = useState(false)
  const [createName, setCreateName] = useState('')
  const [createLocationId, setCreateLocationId] = useState<string>('')
  const [createCategoryId, setCreateCategoryId] = useState<string>('')
  const [createVendor, setCreateVendor] = useState('')
  const [createPrice, setCreatePrice] = useState<string>('')
  const [creating, setCreating] = useState(false)

  /* ------------------------------ load ------------------------------ */

  const loadAll = async (propId: string) => {
    const { data: locs, error: locErr } = await supabase
      .from('locations')
      .select('*')
      .eq('property_id', propId)
      .order('sort_order', { ascending: true })

    if (locErr) throw locErr
    setLocations((locs ?? []) as LocationRow[])

    const { data: its, error: itErr } = await supabase
      .from('items')
      .select('*')
      .eq('property_id', propId)

    if (itErr) throw itErr
    setItems((its ?? []) as ItemRow[])

    const { data: cats, error: catErr } = await supabase
      .from('categories')
      .select('*')
      .eq('property_id', propId)
      .order('name', { ascending: true })

    if (catErr) throw catErr
    setCategories((cats ?? []) as CategoryRow[])
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
      setPropertyId(prop.id)

      const savedExpanded = localStorage.getItem('expandedInventoryTree')
      if (savedExpanded) setExpanded(JSON.parse(savedExpanded))

      await loadAll(prop.id)
    }

    init()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    localStorage.setItem('expandedInventoryTree', JSON.stringify(expanded))
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
    const kids = childrenMap[id] || []
    for (const k of kids) result.push(...descendantsOf(k.id))
    return result
  }

  /* ------------------------------ counts (rollup) ------------------------------ */

  const countMap = useMemo(() => {
    const direct: Record<string, number> = {}
    for (const it of items) {
      if (!it.location_id) continue
      direct[it.location_id] = (direct[it.location_id] || 0) + 1
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

  /* ------------------------------ tri-state selection ------------------------------ */

  const stateFor = (id: string) => {
    const branch = descendantsOf(id)
    const any = branch.some(x => selectedSet.has(x))
    const all = branch.every(x => selectedSet.has(x))
    return { any, all, indeterminate: any && !all }
  }

  const toggleBranch = (id: string) => {
    const branch = descendantsOf(id)
    const { all } = stateFor(id)
    if (all) {
      setSelected(prev => prev.filter(x => !branch.includes(x)))
    } else {
      setSelected(prev => Array.from(new Set([...prev, ...branch])))
      setExpanded(prev => (prev.includes(id) ? prev : [...prev, id]))
    }
  }

  /* ------------------------------ items displayed ------------------------------ */

  const filteredItems = useMemo(() => {
    if (selected.length === 0) return []
    return items.filter(i => i.location_id && selectedSet.has(i.location_id))
  }, [items, selected, selectedSet])

  /* ------------------------------ create item modal helpers ------------------------------ */

  const openCreate = () => {
    setShowCreate(true)
    setCreateName('')
    setCreateVendor('')
    setCreatePrice('')
    setCreateCategoryId('')
    setCreateLocationId('')
  }

  const isRoot = (locId: string) => {
    const loc = byId[locId]
    return !!loc && loc.parent_id === null
  }

  const createItem = async () => {
    if (!propertyId) return
    if (!createName.trim()) return alert('Item Name is required.')
    if (!createLocationId) return alert('Location is required.')
    if (isRoot(createLocationId)) return alert('Please choose a child/sub-child location (not a root).')

    const priceNum =
      createPrice.trim() === '' ? null : Number(createPrice)

    if (createPrice.trim() !== '' && Number.isNaN(priceNum)) {
      return alert('Price must be a number.')
    }

    setCreating(true)
    try {
      const payload: any = {
        property_id: propertyId,
        location_id: createLocationId,
        name: createName.trim(),
        vendor: createVendor.trim() || null,
        price: priceNum
      }
      if (createCategoryId) payload.category_id = createCategoryId

      const { data, error } = await supabase
        .from('items')
        .insert(payload)
        .select('*')
        .single()

      if (error) return alert(error.message)

      const row = data as ItemRow
      setItems(prev => [row, ...prev])
      setShowCreate(false)

      // Open edit modal immediately so user can add photos and refine fields.
      setEditingItem(row)
    } finally {
      setCreating(false)
    }
  }

  /* ------------------------------ UI: location dropdown options ------------------------------ */

  const locationOptions = useMemo(() => {
    // flatten with indentation for dropdown
    const out: { id: string; label: string; depth: number }[] = []
    const walk = (node: LocationRow, depth: number) => {
      out.push({
        id: node.id,
        label: `${'—'.repeat(depth)} ${node.name}`.trim(),
        depth
      })
      const kids = childrenMap[node.id] || []
      kids.forEach(k => walk(k, depth + 1))
    }
    roots.forEach(r => walk(r, 0))
    return out
  }, [roots, childrenMap])

  /* ------------------------------ render ------------------------------ */

  function TreeNode({ node, depth }: { node: LocationRow; depth: number }) {
    const children = childrenMap[node.id] || []
    const hasChildren = children.length > 0
    const isOpen = expanded.includes(node.id)
    const subtreeCount = countMap[node.id] || 0

    const { any, indeterminate } = stateFor(node.id)

    return (
      <div>
        <div
          className={[
            'flex items-center gap-2 py-2 px-3 rounded-lg hover:bg-slate-50',
            depthClasses(depth)
          ].join(' ')}
          style={{ marginLeft: depth * 10 }}
        >
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

          <input
            type="checkbox"
            checked={any}
            ref={(el) => {
              if (el) el.indeterminate = indeterminate
            }}
            onChange={() => toggleBranch(node.id)}
            title="Select this location (includes children)"
          />

          <span className="text-sm font-medium text-slate-800">
            {node.name}{' '}
            <span className="text-slate-500 font-normal">({subtreeCount})</span>
          </span>
        </div>

        {hasChildren && isOpen && (
          <div className="pl-2">
            {children.map(child => (
              <TreeNode key={child.id} node={child} depth={depth + 1} />
            ))}
          </div>
        )}
      </div>
    )
  }

  if (!propertyId) return <div className="p-8">Loading...</div>

  return (
    <main className="space-y-6">
      {/* Locations full-width */}
      <section className="bg-white p-6 rounded-xl shadow-md">
        <div className="flex items-start justify-between gap-3 mb-4">
          <div>
            <h2 className="text-xl font-bold text-slate-900">Locations</h2>
            <div className="text-sm text-slate-500">
              Select one or more locations to view inventory below. Parent totals include all sub-locations.
            </div>
          </div>
        </div>

        {roots.length === 0 ? (
          <div className="text-slate-600">No locations found.</div>
        ) : (
          roots.map(root => <TreeNode key={root.id} node={root} depth={0} />)
        )}
      </section>

      {/* Inventory full-width */}
      <section className="bg-white p-6 rounded-xl shadow-md">
        <div className="flex items-start justify-between gap-3 mb-4">
          <div>
            <h2 className="text-xl font-bold text-slate-900">Inventory</h2>
            <div className="text-sm text-slate-500">
              {selected.length === 0
                ? 'Select locations above to view items.'
                : `${filteredItems.length} item(s) shown.`}
            </div>
          </div>

          <button
            className="px-3 py-2 rounded-lg text-sm bg-indigo-600 text-white hover:bg-indigo-700"
            onClick={openCreate}
            title="Add a new inventory item"
          >
            + Add New Item
          </button>
        </div>

        {selected.length === 0 ? (
          <div className="text-slate-600">Please select at least one location to view items.</div>
        ) : filteredItems.length === 0 ? (
          <div className="text-slate-600">No items found for the selected location(s).</div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {filteredItems.map(item => {
              const thumb = getThumb(item)
              return (
                <div
                  key={item.id}
                  className="border rounded-xl p-3 hover:bg-slate-50 cursor-pointer flex gap-3"
                  onClick={() => setEditingItem(item)}
                  title="Click to edit"
                >
                  <div className="shrink-0">
                    {thumb ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={thumb}
                        alt=""
                        className="w-14 h-14 rounded-lg object-cover border"
                      />
                    ) : (
                      <NoImageSilhouette />
                    )}
                  </div>

                  <div className="min-w-0">
                    <div className="font-semibold text-slate-900 truncate">{item.name}</div>
                    <div className="text-sm text-slate-600">
                      <div><span className="font-medium">Vendor:</span> {item.vendor ?? '—'}</div>
                      <div>
                        <span className="font-medium">Price:</span>{' '}
                        {typeof item.price === 'number' ? `$${item.price.toFixed(2)}` : '—'}
                      </div>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </section>

      {/* Create Item Modal */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setShowCreate(false)}>
          <div className="bg-white rounded-xl shadow-lg w-[560px] p-6" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-slate-900 mb-1">Add New Inventory Item</h3>
            <div className="text-sm text-slate-500 mb-4">
              Enter key details now. After saving, the item opens for full edit + photo upload.
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Item Name</label>
                <input
                  value={createName}
                  onChange={(e) => setCreateName(e.target.value)}
                  className="w-full border rounded-lg px-3 py-2"
                  placeholder="e.g., Samsung TV"
                  autoFocus
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Location</label>
                <select
                  value={createLocationId}
                  onChange={(e) => setCreateLocationId(e.target.value)}
                  className="w-full border rounded-lg px-3 py-2"
                >
                  <option value="">Select a location...</option>
                  {locationOptions.map(opt => (
                    <option key={opt.id} value={opt.id}>
                      {opt.label}
                    </option>
                  ))}
                </select>
                <div className="text-xs text-slate-500 mt-1">
                  Root locations are not allowed for inventory. Choose a child/sub-child location.
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Category</label>
                  <select
                    value={createCategoryId}
                    onChange={(e) => setCreateCategoryId(e.target.value)}
                    className="w-full border rounded-lg px-3 py-2"
                  >
                    <option value="">—</option>
                    {categories.map(c => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Vendor</label>
                  <input
                    value={createVendor}
                    onChange={(e) => setCreateVendor(e.target.value)}
                    className="w-full border rounded-lg px-3 py-2"
                    placeholder="e.g., Best Buy"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Price</label>
                <input
                  value={createPrice}
                  onChange={(e) => setCreatePrice(e.target.value)}
                  className="w-full border rounded-lg px-3 py-2"
                  placeholder="e.g., 799.99"
                  inputMode="decimal"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 mt-5">
              <button
                className="px-3 py-2 rounded-lg bg-slate-200 text-slate-800"
                onClick={() => setShowCreate(false)}
                disabled={creating}
              >
                Cancel
              </button>
              <button
                className={[
                  'px-3 py-2 rounded-lg text-white',
                  creating ? 'bg-indigo-300' : 'bg-indigo-600 hover:bg-indigo-700'
                ].join(' ')}
                onClick={createItem}
                disabled={creating}
              >
                {creating ? 'Creating…' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Item Modal */}
      {editingItem && (
        <EditItemModal
          item={editingItem}
          onClose={() => setEditingItem(null)}
          onUpdated={(updated) => {
            setItems(prev => prev.map(i => (i.id === (updated as any).id ? (updated as ItemRow) : i)))
            setEditingItem(null)
          }}
          onDeleted={(id) => {
            setItems(prev => prev.filter(i => i.id !== id))
            setEditingItem(null)
          }}
        />
      )}
    </main>
  )
}
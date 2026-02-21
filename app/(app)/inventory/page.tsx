'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { supabaseBrowser } from '@/lib/supabase-browser'

type LocationRow = {
  id: string
  property_id: string
  parent_id: string | null
  name: string
  sort_order: number | null
}

type ItemRow = {
  id: string
  property_id: string
  location_id: string
  name: string
  vendor: string | null
  price: number | null
  category_id: string | null
  created_at: string
}

type CategoryRow = {
  id: string
  property_id: string
  name: string
}

type PhotoRow = {
  id: string
  item_id: string
  url: string
  is_primary: boolean | null
  created_at: string
}

type DisplayRow = {
  id: string
  name: string
  depth: number
  hasChildren: boolean
  aggCount: number
  cycle: boolean
}

function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(' ')
}

function depthStyle(depth: number) {
  if (depth === 0) return 'border-indigo-600 bg-indigo-50/40'
  if (depth === 1) return 'border-slate-500 bg-slate-50'
  if (depth === 2) return 'border-indigo-400 bg-indigo-50/20'
  return 'border-slate-300 bg-white'
}

export default function InventoryPage() {
  const supabase = useMemo(() => supabaseBrowser(), [])

  const [loading, setLoading] = useState(true)
  const [userId, setUserId] = useState<string | null>(null)
  const [propertyId, setPropertyId] = useState<string | null>(null)

  const [locations, setLocations] = useState<LocationRow[]>([])
  const [items, setItems] = useState<ItemRow[]>([])
  const [categories, setCategories] = useState<CategoryRow[]>([])
  const [photos, setPhotos] = useState<PhotoRow[]>([])

  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const [selected, setSelected] = useState<Record<string, boolean>>({})
  const [search, setSearch] = useState('')

  const [cycleIds, setCycleIds] = useState<string[]>([])

  // Add item modal
  const [showAdd, setShowAdd] = useState(false)
  const [addLocationId, setAddLocationId] = useState('')
  const [form, setForm] = useState({ name: '', vendor: '', price: '', category_id: '' })

  // photo picker
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const [photoTargetItem, setPhotoTargetItem] = useState<ItemRow | null>(null)

  useEffect(() => {
    loadAll()
    const { data: sub } = supabase.auth.onAuthStateChange(() => loadAll())
    return () => sub?.subscription?.unsubscribe()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function loadAll() {
    setLoading(true)
    try {
      const { data: sessionData } = await supabase.auth.getSession()
      const uid = sessionData?.session?.user?.id ?? null
      setUserId(uid)

      if (!uid) {
        setPropertyId(null)
        setLocations([])
        setItems([])
        setCategories([])
        setPhotos([])
        return
      }

      const { data: pm } = await supabase
        .from('property_members')
        .select('property_id')
        .eq('user_id', uid)
        .order('created_at', { ascending: true })
        .limit(1)

      const pid = pm?.[0]?.property_id ?? null
      setPropertyId(pid)

      if (!pid) {
        setLocations([])
        setItems([])
        setCategories([])
        setPhotos([])
        return
      }

      const [locRes, catRes, itemRes, photoRes] = await Promise.all([
        supabase
          .from('locations')
          .select('id, property_id, parent_id, name, sort_order')
          .eq('property_id', pid)
          .order('sort_order', { ascending: true })
          .order('created_at', { ascending: true }),
        supabase
          .from('categories')
          .select('id, property_id, name')
          .eq('property_id', pid)
          .order('name', { ascending: true }),
        supabase
          .from('items')
          .select('id, property_id, location_id, name, vendor, price, category_id, created_at')
          .eq('property_id', pid)
          .order('created_at', { ascending: false }),
        supabase
          .from('item_photos')
          .select('id, item_id, url, is_primary, created_at')
          .order('created_at', { ascending: false })
      ])

      if (locRes.error) throw locRes.error
      if (catRes.error) throw catRes.error
      if (itemRes.error) throw itemRes.error
      if (photoRes.error) throw photoRes.error

      const locs = (locRes.data as LocationRow[]) ?? []
      const its = (itemRes.data as ItemRow[]) ?? []
      const cats = (catRes.data as CategoryRow[]) ?? []
      const phs = (photoRes.data as PhotoRow[]) ?? []

      setLocations(locs)
      setItems(its)
      setCategories(cats)

      const itemIdSet = new Set(its.map(i => i.id))
      setPhotos(phs.filter(p => itemIdSet.has(p.item_id)))

      setExpanded(prev => {
        const next = { ...prev }
        for (const l of locs) {
          if (l.parent_id === null && next[l.id] === undefined) next[l.id] = true
        }
        return next
      })
    } finally {
      setLoading(false)
    }
  }

  const byId = useMemo(() => new Map(locations.map(l => [l.id, l])), [locations])

  const childrenByParent = useMemo(() => {
    const map = new Map<string | null, LocationRow[]>()
    for (const l of locations) {
      const key = l.parent_id ?? null
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(l)
    }
    for (const [k, arr] of map.entries()) {
      arr.sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
      map.set(k, arr)
    }
    return map
  }, [locations])

  const directCountByLoc = useMemo(() => {
    const m = new Map<string, number>()
    for (const it of items) m.set(it.location_id, (m.get(it.location_id) ?? 0) + 1)
    return m
  }, [items])

  const aggCountByLoc = useMemo(() => {
    const memo = new Map<string, number>()
    const visiting = new Set<string>()
    const cycles = new Set<string>()

    function dfs(id: string): number {
      if (memo.has(id)) return memo.get(id)!
      if (visiting.has(id)) {
        cycles.add(id)
        const direct = directCountByLoc.get(id) ?? 0
        memo.set(id, direct)
        return direct
      }
      visiting.add(id)
      const direct = directCountByLoc.get(id) ?? 0
      const kids = childrenByParent.get(id) ?? []
      let sum = direct
      for (const k of kids) sum += dfs(k.id)
      visiting.delete(id)
      memo.set(id, sum)
      return sum
    }

    for (const l of locations) dfs(l.id)
    setCycleIds(Array.from(cycles))
    return memo
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locations, childrenByParent, directCountByLoc])

  const filteredKeep = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return null as Set<string> | null

    const keep = new Set<string>()
    for (const l of locations) if (l.name.toLowerCase().includes(q)) keep.add(l.id)

    for (const id of Array.from(keep)) {
      const seen = new Set<string>()
      let cur = byId.get(id)
      while (cur?.parent_id) {
        if (seen.has(cur.parent_id)) break
        seen.add(cur.parent_id)
        keep.add(cur.parent_id)
        cur = byId.get(cur.parent_id)
      }
    }
    return keep
  }, [search, locations, byId])

  function toggleExpand(id: string) {
    setExpanded(prev => ({ ...prev, [id]: !prev[id] }))
  }

  function setBranchChecked(id: string, checked: boolean, next: Record<string, boolean>) {
    next[id] = checked
    const kids = childrenByParent.get(id) ?? []
    for (const k of kids) setBranchChecked(k.id, checked, next)
  }

  function recomputeParents(next: Record<string, boolean>) {
    // parent is checked if all children checked; indeterminate shown separately
    const seen = new Set<string>()
    function walkUp(id: string) {
      const loc = byId.get(id)
      if (!loc?.parent_id) return
      const parentId = loc.parent_id
      if (seen.has(parentId)) return
      seen.add(parentId)

      const kids = childrenByParent.get(parentId) ?? []
      const checkedCount = kids.filter(k => !!next[k.id]).length

      if (kids.length > 0 && checkedCount === kids.length) next[parentId] = true
      else if (checkedCount === 0) next[parentId] = false
      else next[parentId] = false // indeterminate state rendered in UI

      walkUp(parentId)
    }

    for (const id of Object.keys(next)) walkUp(id)
  }

  function isIndeterminate(id: string) {
    const kids = childrenByParent.get(id) ?? []
    if (kids.length === 0) return false
    const any = kids.some(k => !!selected[k.id])
    const all = kids.every(k => !!selected[k.id])
    return any && !all
  }

  function onToggleCheck(id: string, checked: boolean) {
    setSelected(prev => {
      const next = { ...prev }
      setBranchChecked(id, checked, next)
      recomputeParents(next)
      return next
    })
  }

  const selectedLocationIds = useMemo(
    () => Object.keys(selected).filter(id => selected[id]),
    [selected]
  )

  // Include descendants with cycle protection (iterative)
  const selectedWithDescendants = useMemo(() => {
    const out = new Set<string>()
    const stack = [...selectedLocationIds]
    const seen = new Set<string>()

    while (stack.length) {
      const id = stack.pop()!
      if (seen.has(id)) continue
      seen.add(id)
      out.add(id)
      const kids = childrenByParent.get(id) ?? []
      for (const k of kids) stack.push(k.id)
    }

    return out
  }, [selectedLocationIds, childrenByParent])

  const filteredItems = useMemo(() => {
    if (selectedLocationIds.length === 0) return []
    return items.filter(it => selectedWithDescendants.has(it.location_id))
  }, [items, selectedLocationIds.length, selectedWithDescendants])

  const categoryNameById = useMemo(() => {
    const m = new Map<string, string>()
    for (const c of categories) m.set(c.id, c.name)
    return m
  }, [categories])

  const primaryPhotoByItem = useMemo(() => {
    const map = new Map<string, string>()
    const grouped = new Map<string, PhotoRow[]>()
    for (const p of photos) {
      if (!grouped.has(p.item_id)) grouped.set(p.item_id, [])
      grouped.get(p.item_id)!.push(p)
    }
    for (const [itemId, arr] of grouped.entries()) {
      const prim = arr.find(a => a.is_primary) ?? arr[0]
      if (prim?.url) map.set(itemId, prim.url)
    }
    return map
  }, [photos])

  // Flatten locations for rendering (non-recursive)
  const displayRows: DisplayRow[] = useMemo(() => {
    const out: DisplayRow[] = []
    const roots = (childrenByParent.get(null) ?? []).slice()
    const visited = new Set<string>()

    const stack: Array<{ id: string; depth: number }> = []
    for (let i = roots.length - 1; i >= 0; i--) stack.push({ id: roots[i].id, depth: 0 })

    while (stack.length) {
      const { id, depth } = stack.pop()!
      if (visited.has(id)) continue
      visited.add(id)

      if (filteredKeep && !filteredKeep.has(id)) continue

      const loc = byId.get(id)
      if (!loc) continue

      const kids = childrenByParent.get(id) ?? []
      const hasChildren = kids.length > 0
      const isExpanded = expanded[id] ?? false
      const agg = aggCountByLoc.get(id) ?? 0
      const isCycle = cycleIds.includes(id)

      out.push({ id, name: loc.name, depth, hasChildren, aggCount: agg, cycle: isCycle })

      if (hasChildren && isExpanded) {
        for (let i = kids.length - 1; i >= 0; i--) stack.push({ id: kids[i].id, depth: depth + 1 })
      }
    }

    return out
  }, [childrenByParent, byId, expanded, filteredKeep, aggCountByLoc, cycleIds])

  function isRootLocation(id: string) {
    const l = byId.get(id)
    return !!l && l.parent_id === null
  }

  async function createItem() {
    if (!propertyId) return
    const name = form.name.trim()
    if (!name) return alert('Name is required.')
    if (!addLocationId) return alert('Location is required.')
    if (isRootLocation(addLocationId)) return alert('Items can only be added to child (non-root) locations.')

    const priceNum =
      form.price.trim() === ''
        ? null
        : Number.isFinite(Number(form.price))
          ? Number(form.price)
          : null

    const { data, error } = await supabase
      .from('items')
      .insert({
        property_id: propertyId,
        location_id: addLocationId,
        name,
        vendor: form.vendor.trim() || null,
        price: priceNum,
        category_id: form.category_id || null
      })
      .select('id, property_id, location_id, name, vendor, price, category_id, created_at')
      .single()

    if (error) return alert(error.message)

    setItems(prev => [data as ItemRow, ...prev])
    setShowAdd(false)
    setAddLocationId('')
    setForm({ name: '', vendor: '', price: '', category_id: '' })
  }

  function clickAddPhotos(item: ItemRow) {
    setPhotoTargetItem(item)
    setTimeout(() => fileInputRef.current?.click(), 0)
  }

  async function uploadPhotosForItem(item: ItemRow, files: FileList) {
    const bucket = 'item-photos'
    for (let i = 0; i < files.length; i++) {
      const f = files[i]
      const ext = (f.name.split('.').pop() || 'jpg').toLowerCase()
      const path = `${item.id}/${crypto.randomUUID()}.${ext}`

      const up = await supabase.storage.from(bucket).upload(path, f, { upsert: false })
      if (up.error) {
        alert(up.error.message)
        continue
      }

      const pub = supabase.storage.from(bucket).getPublicUrl(path)
      const url = pub.data.publicUrl

      const { data: inserted, error: insErr } = await supabase
        .from('item_photos')
        .insert({ item_id: item.id, url, is_primary: false })
        .select('id, item_id, url, is_primary, created_at')
        .single()

      if (insErr) alert(insErr.message)
      else if (inserted) setPhotos(prev => [inserted as PhotoRow, ...prev])
    }
  }

  async function onFilesChosen(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files
    if (!files || files.length === 0) return
    if (!photoTargetItem) return

    await uploadPhotosForItem(photoTargetItem, files)
    e.target.value = ''
    setPhotoTargetItem(null)
  }

  const locationOptions = useMemo(() => {
    // show a simple flat list (no recursion) for dropdown
    return locations.slice().sort((a, b) => a.name.localeCompare(b.name))
  }, [locations])

  return (
    <div className="max-w-6xl mx-auto px-6 py-10">
      <div className="flex items-start justify-between gap-6">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Inventory</h1>
          <p className="text-slate-600 mt-1">
            Select one or more locations to display items below. Parent selection includes descendants.
          </p>
          {cycleIds.length > 0 && (
            <div className="mt-2 text-sm text-red-700">
              Warning: Detected a cycle in locations. UI is protected, but please fix the hierarchy.
            </div>
          )}
        </div>

        <div className="flex items-center gap-3">
          <input
            className="w-72 rounded-xl border px-3 py-2"
            placeholder="Search locations..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <button
            className="rounded-xl bg-indigo-600 text-white px-4 py-2 font-medium hover:bg-indigo-700"
            onClick={() => setShowAdd(true)}
          >
            + Add New Item
          </button>
        </div>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={onFilesChosen}
      />

      <div className="mt-8 rounded-2xl bg-white shadow-sm border p-5">
        <div className="text-lg font-bold text-slate-900">Locations</div>
        <div className="text-sm text-slate-600 mt-1">Pick locations to show items below.</div>

        <div className="mt-4">
          {loading ? (
            <div className="text-slate-600">Loading…</div>
          ) : !userId ? (
            <div className="text-slate-600">Not logged in.</div>
          ) : locations.length === 0 ? (
            <div className="text-slate-600">No locations yet. Create them in the Locations tab.</div>
          ) : (
            <div className="space-y-1">
              {displayRows.map(r => {
                const checked = !!selected[r.id]
                const ind = isIndeterminate(r.id)
                const isExpanded = expanded[r.id] ?? false

                return (
                  <div
                    key={r.id}
                    className={cx(
                      'flex items-center gap-2 rounded-lg border-l-4 px-3 py-2',
                      depthStyle(r.depth),
                      r.cycle ? 'ring-1 ring-red-200' : '',
                      'hover:bg-indigo-50/60 transition-colors'
                    )}
                    style={{ marginLeft: r.depth * 14 }}
                  >
                    <button
                      type="button"
                      className={cx(
                        'h-7 w-7 flex items-center justify-center rounded-md',
                        r.hasChildren ? 'hover:bg-slate-200/70' : 'opacity-30 cursor-default'
                      )}
                      onClick={() => r.hasChildren && toggleExpand(r.id)}
                    >
                      {r.hasChildren ? (isExpanded ? '▾' : '▸') : '•'}
                    </button>

                    <input
                      type="checkbox"
                      checked={checked}
                      ref={(el) => {
                        if (el) el.indeterminate = ind
                      }}
                      onChange={(e) => onToggleCheck(r.id, e.target.checked)}
                    />

                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-slate-900 truncate">
                        {r.name}{' '}
                        <span className="text-slate-500 font-normal">({r.aggCount})</span>
                        {r.cycle && <span className="ml-2 text-xs text-red-700">cycle</span>}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      <div className="mt-8 rounded-2xl bg-white shadow-sm border p-5">
        <div className="text-lg font-bold text-slate-900">Items</div>
        <div className="text-sm text-slate-600 mt-1">
          {selectedLocationIds.length === 0
            ? 'Select one or more locations to view items.'
            : `${filteredItems.length} item(s) shown.`}
        </div>

        {selectedLocationIds.length === 0 ? (
          <div className="mt-6 text-slate-600">No locations selected.</div>
        ) : filteredItems.length === 0 ? (
          <div className="mt-6 text-slate-600">No items found for the selected locations.</div>
        ) : (
          <div className="mt-5 grid grid-cols-1 gap-3">
            {filteredItems.map(item => {
              const photoUrl = primaryPhotoByItem.get(item.id)
              const catName = item.category_id ? categoryNameById.get(item.category_id) : null

              return (
                <div
                  key={item.id}
                  className="flex items-center gap-4 rounded-2xl border bg-white p-4 hover:bg-slate-50 transition-colors"
                >
                  <button
                    className="relative h-16 w-16 rounded-xl overflow-hidden border bg-slate-100 shrink-0"
                    onClick={() => clickAddPhotos(item)}
                    title="Click to add photo(s)"
                  >
                    {photoUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={photoUrl} alt="Item" className="h-full w-full object-cover" />
                    ) : (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src="/no-image.jpg" alt="No Image" className="h-full w-full object-cover" />
                    )}
                    <div className="absolute inset-0 opacity-0 hover:opacity-100 transition-opacity bg-black/30 flex items-center justify-center">
                      <div className="text-white text-xs font-medium">Click to Add Photo</div>
                    </div>
                  </button>

                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-slate-900 truncate">{item.name}</div>
                    <div className="text-sm text-slate-600 mt-0.5">
                      <div><span className="font-medium">Category:</span> {catName ?? '—'}</div>
                      <div><span className="font-medium">Vendor:</span> {item.vendor ?? '—'}</div>
                      <div><span className="font-medium">Price:</span> {typeof item.price === 'number' ? `$${item.price.toFixed(2)}` : '—'}</div>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Add Item Modal */}
      {showAdd && (
        <div className="fixed inset-0 z-40 bg-black/30 flex items-center justify-center px-4">
          <div className="w-full max-w-xl rounded-2xl bg-white shadow-xl border p-6">
            <div className="flex items-start justify-between">
              <div>
                <div className="text-xl font-bold text-slate-900">Add New Item</div>
                <div className="text-slate-600 text-sm mt-1">Items can only be added to child (non-root) locations.</div>
              </div>
              <button className="rounded-lg border px-3 py-1 hover:bg-slate-50" onClick={() => setShowAdd(false)}>
                Close
              </button>
            </div>

            <div className="mt-4 space-y-3">
              <div>
                <label className="text-sm font-medium text-slate-700">Location</label>
                <select
                  className="mt-1 w-full rounded-xl border px-3 py-2"
                  value={addLocationId}
                  onChange={(e) => setAddLocationId(e.target.value)}
                >
                  <option value="">Select a location…</option>
                  {locationOptions.map(l => (
                    <option key={l.id} value={l.id}>
                      {l.name}{l.parent_id === null ? ' (root)' : ''}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-sm font-medium text-slate-700">Item name</label>
                <input
                  className="mt-1 w-full rounded-xl border px-3 py-2"
                  placeholder="e.g., Desk"
                  value={form.name}
                  onChange={(e) => setForm(prev => ({ ...prev, name: e.target.value }))}
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <label className="text-sm font-medium text-slate-700">Vendor</label>
                  <input
                    className="mt-1 w-full rounded-xl border px-3 py-2"
                    placeholder="e.g., IKEA"
                    value={form.vendor}
                    onChange={(e) => setForm(prev => ({ ...prev, vendor: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="text-sm font-medium text-slate-700">Price</label>
                  <input
                    className="mt-1 w-full rounded-xl border px-3 py-2"
                    placeholder="e.g., 199.99"
                    value={form.price}
                    onChange={(e) => setForm(prev => ({ ...prev, price: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="text-sm font-medium text-slate-700">Category</label>
                  <select
                    className="mt-1 w-full rounded-xl border px-3 py-2"
                    value={form.category_id}
                    onChange={(e) => setForm(prev => ({ ...prev, category_id: e.target.value }))}
                  >
                    <option value="">—</option>
                    {categories.map(c => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button className="rounded-xl border px-4 py-2 hover:bg-slate-50" onClick={() => setShowAdd(false)}>
                  Cancel
                </button>
                <button className="rounded-xl bg-indigo-600 text-white px-4 py-2 font-medium hover:bg-indigo-700" onClick={createItem}>
                  Create
                </button>
              </div>

              <div className="text-xs text-slate-500">
                Add photos after creation by clicking the thumbnail on the item card.
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
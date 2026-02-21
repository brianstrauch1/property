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

type CategoryRow = {
  id: string
  property_id: string
  name: string
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

type PhotoRow = {
  id: string
  item_id: string
  url: string
  is_primary: boolean | null
  created_at: string
}

function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(' ')
}

function depthColor(depth: number) {
  const colors = [
    'border-indigo-600 bg-indigo-50/40',
    'border-slate-600 bg-slate-50',
    'border-indigo-400 bg-indigo-50/20',
    'border-slate-400 bg-white'
  ]
  return colors[Math.min(depth, colors.length - 1)]
}

export default function InventoryPage() {
  const supabase = useMemo(() => supabaseBrowser(), [])

  const [loading, setLoading] = useState(true)
  const [userId, setUserId] = useState<string | null>(null)
  const [propertyId, setPropertyId] = useState<string | null>(null)

  const [locations, setLocations] = useState<LocationRow[]>([])
  const [categories, setCategories] = useState<CategoryRow[]>([])
  const [items, setItems] = useState<ItemRow[]>([])
  const [photos, setPhotos] = useState<PhotoRow[]>([])

  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const [selected, setSelected] = useState<Record<string, boolean>>({})
  const [search, setSearch] = useState('')

  // Add item modal
  const [showAdd, setShowAdd] = useState(false)
  const [addLocationId, setAddLocationId] = useState<string>('') // required
  const [form, setForm] = useState({
    name: '',
    vendor: '',
    price: '',
    category_id: ''
  })

  // hidden file picker for quick photo add
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const [photoTargetItem, setPhotoTargetItem] = useState<ItemRow | null>(null)

  async function loadAll() {
    setLoading(true)
    try {
      const { data: sessionData } = await supabase.auth.getSession()
      const uid = sessionData?.session?.user?.id ?? null
      setUserId(uid)

      if (!uid) {
        setPropertyId(null)
        setLocations([])
        setCategories([])
        setItems([])
        setPhotos([])
        return
      }

      const { data: pm, error: pmErr } = await supabase
        .from('property_members')
        .select('property_id')
        .eq('user_id', uid)
        .order('created_at', { ascending: true })
        .limit(1)

      if (pmErr) throw pmErr
      const pid = pm?.[0]?.property_id ?? null
      setPropertyId(pid)

      if (!pid) {
        setLocations([])
        setCategories([])
        setItems([])
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
      setLocations(locs)
      setCategories((catRes.data as CategoryRow[]) ?? [])
      setItems((itemRes.data as ItemRow[]) ?? [])

      // Only keep photos that belong to items we have (safety)
      const itemIdSet = new Set(((itemRes.data as ItemRow[]) ?? []).map(i => i.id))
      setPhotos((((photoRes.data as PhotoRow[]) ?? []).filter(p => itemIdSet.has(p.item_id))))

      // expand roots
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

  useEffect(() => {
    loadAll()
    const { data: sub } = supabase.auth.onAuthStateChange(() => loadAll())
    return () => sub?.subscription?.unsubscribe()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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

  const byId = useMemo(() => new Map(locations.map(l => [l.id, l])), [locations])

  const directItemCountByLocation = useMemo(() => {
    const m = new Map<string, number>()
    for (const it of items) m.set(it.location_id, (m.get(it.location_id) ?? 0) + 1)
    return m
  }, [items])

  const aggregateCountByLocation = useMemo(() => {
    const agg = new Map<string, number>()
    function dfs(id: string): number {
      if (agg.has(id)) return agg.get(id)!
      const direct = directItemCountByLocation.get(id) ?? 0
      const kids = childrenByParent.get(id) ?? []
      let sum = direct
      for (const k of kids) sum += dfs(k.id)
      agg.set(id, sum)
      return sum
    }
    for (const l of locations) dfs(l.id)
    return agg
  }, [locations, childrenByParent, directItemCountByLocation])

  const filteredIds = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return null
    const keep = new Set<string>()
    for (const l of locations) if (l.name.toLowerCase().includes(q)) keep.add(l.id)
    // include ancestors
    for (const id of Array.from(keep)) {
      let cur = byId.get(id)
      while (cur?.parent_id) {
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
    // walk upwards: parent checked if all children checked; parent unchecked if none; indeterminate computed at render time
    const visited = new Set<string>()
    function updateUp(id: string) {
      const loc = byId.get(id)
      if (!loc?.parent_id) return
      const parentId = loc.parent_id
      if (visited.has(parentId)) return
      visited.add(parentId)

      const kids = childrenByParent.get(parentId) ?? []
      const checkedCount = kids.filter(k => !!next[k.id]).length
      if (checkedCount === kids.length && kids.length > 0) next[parentId] = true
      else if (checkedCount === 0) next[parentId] = false
      else next[parentId] = false // keep false; indeterminate will show in UI

      updateUp(parentId)
    }
    for (const id of Object.keys(next)) updateUp(id)
  }

  function isIndeterminate(id: string) {
    const kids = childrenByParent.get(id) ?? []
    if (kids.length === 0) return false
    let any = false
    let all = true
    for (const k of kids) {
      const c = !!selected[k.id]
      any = any || c
      all = all && c
    }
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

  const selectedDescendants = useMemo(() => {
    // For each selected location, include all descendants. This makes parent selection show all child items.
    const out = new Set<string>()
    function addDesc(id: string) {
      out.add(id)
      const kids = childrenByParent.get(id) ?? []
      for (const k of kids) addDesc(k.id)
    }
    for (const id of selectedLocationIds) addDesc(id)
    return out
  }, [selectedLocationIds, childrenByParent])

  const filteredItems = useMemo(() => {
    if (selectedLocationIds.length === 0) return []
    return items.filter(it => selectedDescendants.has(it.location_id))
  }, [items, selectedLocationIds.length, selectedDescendants])

  const primaryPhotoByItem = useMemo(() => {
    const map = new Map<string, string>()
    // choose newest primary; fallback newest
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

  const categoryNameById = useMemo(() => {
    const m = new Map<string, string>()
    for (const c of categories) m.set(c.id, c.name)
    return m
  }, [categories])

  async function openAddItem() {
    // Require non-root location? You asked previously: no items at root level.
    // Here: allow add anytime, but requires a specific location selection that is NOT a root? We enforce: must choose a child/sub-child.
    setShowAdd(true)
    setForm({ name: '', vendor: '', price: '', category_id: '' })
    setAddLocationId('')
  }

  function isRootLocation(id: string) {
    const l = byId.get(id)
    return !!l && l.parent_id === null
  }

  async function createItem() {
    if (!propertyId) return
    const name = form.name.trim()
    if (!name) return alert('Name is required.')
    if (!addLocationId) return alert('Location is required.')
    if (isRootLocation(addLocationId)) {
      return alert('You can only add inventory items to child (non-root) locations.')
    }

    const priceNum =
      form.price.trim() === '' ? null : Number.isFinite(Number(form.price)) ? Number(form.price) : null

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
  }

  async function uploadPhotosForItem(item: ItemRow, files: FileList) {
    if (!propertyId) return
    const bucket = 'item-photos'
    const uploadedUrls: string[] = []

    for (let i = 0; i < files.length; i++) {
      const f = files[i]
      const ext = (f.name.split('.').pop() || 'jpg').toLowerCase()
      const path = `${item.id}/${crypto.randomUUID()}.${ext}`

      const up = await supabase.storage.from(bucket).upload(path, f, {
        cacheControl: '3600',
        upsert: false
      })
      if (up.error) {
        alert(up.error.message)
        continue
      }

      const pub = supabase.storage.from(bucket).getPublicUrl(path)
      const url = pub.data.publicUrl
      uploadedUrls.push(url)

      // Insert row
      const { data: inserted, error: insErr } = await supabase
        .from('item_photos')
        .insert({
          item_id: item.id,
          url,
          is_primary: false
        })
        .select('id, item_id, url, is_primary, created_at')
        .single()

      if (insErr) {
        alert(insErr.message)
      } else if (inserted) {
        setPhotos(prev => [inserted as PhotoRow, ...prev])
      }
    }

    // If item has no primary, set first uploaded as primary
    const alreadyPrimary = photos.some(p => p.item_id === item.id && p.is_primary)
    if (!alreadyPrimary && uploadedUrls.length > 0) {
      const firstUrl = uploadedUrls[0]
      const { data: row } = await supabase
        .from('item_photos')
        .select('id, item_id, url, is_primary, created_at')
        .eq('item_id', item.id)
        .eq('url', firstUrl)
        .limit(1)
        .maybeSingle()

      if (row?.id) {
        await supabase.from('item_photos').update({ is_primary: true }).eq('id', row.id)
        setPhotos(prev =>
          prev.map(p => (p.id === row.id ? { ...p, is_primary: true } : p))
        )
      }
    }
  }

  function renderTree(parent: string | null, depth: number) {
    const rows = childrenByParent.get(parent) ?? []
    const out: any[] = []
    for (const loc of rows) {
      if (filteredIds && !filteredIds.has(loc.id)) continue

      const kids = childrenByParent.get(loc.id) ?? []
      const isExpanded = expanded[loc.id] ?? false
      const checked = !!selected[loc.id]
      const ind = isIndeterminate(loc.id)
      const agg = aggregateCountByLocation.get(loc.id) ?? 0

      out.push(
        <div key={loc.id} className="relative">
          <div
            className={cx(
              'group flex items-center gap-2 rounded-lg border-l-4 px-3 py-2 mb-1',
              depthColor(depth),
              'hover:bg-indigo-50/60 transition-colors'
            )}
            style={{ marginLeft: depth * 14 }}
            title="Select one or more locations to view inventory below."
          >
            <button
              type="button"
              className={cx(
                'h-7 w-7 flex items-center justify-center rounded-md',
                kids.length ? 'hover:bg-slate-200/70' : 'opacity-30 cursor-default'
              )}
              onClick={() => kids.length && toggleExpand(loc.id)}
              aria-label={kids.length ? (isExpanded ? 'Collapse' : 'Expand') : 'No children'}
            >
              {kids.length ? (isExpanded ? '▾' : '▸') : '•'}
            </button>

            <input
              type="checkbox"
              checked={checked}
              ref={(el) => {
                if (el) el.indeterminate = ind
              }}
              onChange={(e) => onToggleCheck(loc.id, e.target.checked)}
            />

            <div className="flex-1 min-w-0">
              <div className="font-medium text-slate-900 truncate">
                {loc.name} <span className="text-slate-500 font-normal">({agg})</span>
              </div>
              <div className="text-xs text-slate-500">
                {loc.parent_id ? 'Child location' : 'Root location'}
              </div>
            </div>
          </div>

          {depth > 0 && (
            <div
              className="absolute left-1 top-0 bottom-0 w-px bg-slate-200"
              style={{ marginLeft: depth * 14 }}
              aria-hidden
            />
          )}

          {kids.length > 0 && isExpanded && (
            <div className="pl-2">{renderTree(loc.id, depth + 1)}</div>
          )}
        </div>
      )
    }
    return out
  }

  const locationOptions = useMemo(() => {
    // Flatten list with indentation for add modal
    const out: Array<{ id: string; label: string; isRoot: boolean }> = []
    function walk(parent: string | null, depth: number) {
      const rows = childrenByParent.get(parent) ?? []
      for (const r of rows) {
        out.push({ id: r.id, label: `${'— '.repeat(depth)}${r.name}`, isRoot: r.parent_id === null })
        walk(r.id, depth + 1)
      }
    }
    walk(null, 0)
    return out
  }, [childrenByParent])

  function clickAddPhotos(item: ItemRow) {
    setPhotoTargetItem(item)
    // trigger picker
    setTimeout(() => fileInputRef.current?.click(), 0)
  }

  async function onFilesChosen(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files
    if (!files || files.length === 0) return
    if (!photoTargetItem) return

    await uploadPhotosForItem(photoTargetItem, files)

    // reset input
    e.target.value = ''
    setPhotoTargetItem(null)
  }

  return (
    <div className="max-w-6xl mx-auto px-6 py-10">
      <div className="flex items-start justify-between gap-6">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Inventory</h1>
          <p className="text-slate-600 mt-1">
            Select one or more locations to view inventory. Parent selection includes all sub-locations.
          </p>
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
            onClick={openAddItem}
          >
            + Add New Item
          </button>
        </div>
      </div>

      {/* file picker */}
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
        <div className="text-sm text-slate-600 mt-1">
          Pick locations to show items below.
        </div>

        <div className="mt-4">
          {loading ? (
            <div className="text-slate-600">Loading…</div>
          ) : !userId ? (
            <div className="text-slate-600">Not logged in.</div>
          ) : locations.length === 0 ? (
            <div className="text-slate-600">No locations yet. Create them in the Locations tab.</div>
          ) : (
            <div>{renderTree(null, 0)}</div>
          )}
        </div>
      </div>

      <div className="mt-8 rounded-2xl bg-white shadow-sm border p-5">
        <div className="flex items-start justify-between gap-6">
          <div>
            <div className="text-lg font-bold text-slate-900">Items</div>
            <div className="text-sm text-slate-600 mt-1">
              {selectedLocationIds.length === 0
                ? 'Select one or more locations to view items.'
                : `${filteredItems.length} item(s) shown.`}
            </div>
          </div>
        </div>

        {selectedLocationIds.length === 0 ? (
          <div className="mt-6 text-slate-600">No locations selected.</div>
        ) : filteredItems.length === 0 ? (
          <div className="mt-6 text-slate-600">No items found for the selected locations.</div>
        ) : (
          <div className="mt-5 grid grid-cols-1 gap-3">
            {filteredItems.map(item => {
              const photoUrl = primaryPhotoByItem.get(item.id)
              const categoryName = item.category_id ? categoryNameById.get(item.category_id) : null

              return (
                <div
                  key={item.id}
                  className="flex items-center gap-4 rounded-2xl border bg-white p-4 hover:bg-slate-50 transition-colors"
                  title="Click image to add photos"
                >
                  {/* thumbnail */}
                  <button
                    className="relative h-16 w-16 rounded-xl overflow-hidden border bg-slate-100 shrink-0"
                    onClick={() => clickAddPhotos(item)}
                  >
                    {photoUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={photoUrl}
                        alt="Item"
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src="/no-image.jpg"
                        alt="No Image"
                        className="h-full w-full object-cover"
                      />
                    )}
                    <div className="absolute inset-0 opacity-0 hover:opacity-100 transition-opacity bg-black/30 flex items-center justify-center">
                      <div className="text-white text-xs font-medium">Click to Add Photo</div>
                    </div>
                  </button>

                  {/* details */}
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-slate-900 truncate">{item.name}</div>
                    <div className="text-sm text-slate-600 mt-0.5">
                      <div><span className="font-medium">Category:</span> {categoryName ?? '—'}</div>
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
      </div>

      {/* Add item modal */}
      {showAdd && (
        <div className="fixed inset-0 z-40 bg-black/30 flex items-center justify-center px-4">
          <div className="w-full max-w-xl rounded-2xl bg-white shadow-xl border p-6">
            <div className="flex items-start justify-between">
              <div>
                <div className="text-xl font-bold text-slate-900">Add New Item</div>
                <div className="text-slate-600 text-sm mt-1">
                  Items can only be added to <span className="font-medium">child (non-root)</span> locations.
                </div>
              </div>
              <button
                className="rounded-lg border px-3 py-1 hover:bg-slate-50"
                onClick={() => setShowAdd(false)}
              >
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
                  {locationOptions.map(o => (
                    <option key={o.id} value={o.id}>
                      {o.label}{o.isRoot ? ' (root)' : ''}
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
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="flex justify-between items-center pt-2">
                <div className="text-xs text-slate-500">
                  Photos are added after creation by clicking the thumbnail on the item card.
                </div>
                <div className="flex gap-2">
                  <button
                    className="rounded-xl border px-4 py-2 hover:bg-slate-50"
                    onClick={() => setShowAdd(false)}
                  >
                    Cancel
                  </button>
                  <button
                    className="rounded-xl bg-indigo-600 text-white px-4 py-2 font-medium hover:bg-indigo-700"
                    onClick={createItem}
                  >
                    Create
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
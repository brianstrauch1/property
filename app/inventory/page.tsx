'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabaseBrowser } from '@/lib/supabase-browser'
import EditItemModal, { InventoryItem } from '@/components/inventory/EditItemModal'

type LocationRow = {
  id: string
  name: string
  parent_id: string | null
}

type LocStats = { count: number; total: number; depreciated: number }

const WARRANTY_ALERT_DAYS = 30

function parseDate(d: string | null): Date | null {
  if (!d) return null
  const dt = new Date(d)
  return isNaN(dt.getTime()) ? null : dt
}

function yearsBetween(a: Date, b: Date): number {
  const ms = b.getTime() - a.getTime()
  return ms / (1000 * 60 * 60 * 24 * 365.25)
}

function calcDepreciatedValue(item: InventoryItem): number {
  const price = item.price ?? 0
  const depYears = item.depreciation_years ?? null
  if (!depYears || depYears <= 0) return price

  const purchase = parseDate(item.purchase_date)
  if (!purchase) return price

  const ageYears = yearsBetween(purchase, new Date())
  const factor = 1 - ageYears / depYears
  return Math.max(0, price * factor)
}

function toCsv(rows: Record<string, any>[]) {
  if (rows.length === 0) return ''
  const headers = Object.keys(rows[0])
  const esc = (v: any) => {
    const s = String(v ?? '')
    if (s.includes('"') || s.includes(',') || s.includes('\n')) return `"${s.replace(/"/g, '""')}"`
    return s
  }
  const lines = [headers.join(','), ...rows.map(r => headers.map(h => esc(r[h])).join(','))]
  return lines.join('\n')
}

export default function InventoryPage() {
  const supabase = supabaseBrowser()
  const router = useRouter()
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const [property, setProperty] = useState<any>(null)
  const [locations, setLocations] = useState<LocationRow[]>([])
  const [items, setItems] = useState<InventoryItem[]>([])
  const [selectedLocationIds, setSelectedLocationIds] = useState<string[]>([])
  const [editingItem, setEditingItem] = useState<InventoryItem | null>(null)
  const [photoTarget, setPhotoTarget] = useState<InventoryItem | null>(null)

  useEffect(() => {
    const init = async () => {
      const { data: userData } = await supabase.auth.getUser()
      if (!userData.user) {
        router.push('/')
        return
      }

      const { data: prop } = await supabase.from('properties').select('*').limit(1).single()
      if (!prop) return
      setProperty(prop)

      const { data: locs } = await supabase.from('locations').select('*').eq('property_id', prop.id)
      const { data: its } = await supabase.from('items').select('*').eq('property_id', prop.id)

      setLocations(locs ?? [])
      setItems(its ?? [])
    }

    init()
  }, [])

  // Build hierarchy maps
  const { childrenMap, nameMap, roots } = useMemo(() => {
    const children: Record<string, string[]> = {}
    const names: Record<string, string> = {}
    const rootIds: string[] = []

    for (const l of locations) {
      names[l.id] = l.name
      if (!l.parent_id) rootIds.push(l.id)
      if (l.parent_id) {
        if (!children[l.parent_id]) children[l.parent_id] = []
        children[l.parent_id].push(l.id)
      }
    }
    return { childrenMap: children, nameMap: names, roots: rootIds }
  }, [locations])

  const descendantsOf = useMemo(() => {
    const memo: Record<string, Set<string>> = {}

    const dfs = (id: string): Set<string> => {
      if (memo[id]) return memo[id]
      const s = new Set<string>()
      s.add(id)
      const kids = childrenMap[id] || []
      for (const k of kids) {
        for (const d of dfs(k)) s.add(d)
      }
      memo[id] = s
      return s
    }

    return (id: string) => dfs(id)
  }, [childrenMap])

  // Rollup stats per location (including descendants)
  const rollupStats: Record<string, LocStats> = useMemo(() => {
    const direct: Record<string, LocStats> = {}
    for (const it of items) {
      if (!it.location_id) continue
      if (!direct[it.location_id]) direct[it.location_id] = { count: 0, total: 0, depreciated: 0 }
      direct[it.location_id].count += 1
      direct[it.location_id].total += it.price ?? 0
      direct[it.location_id].depreciated += calcDepreciatedValue(it)
    }

    const rollup: Record<string, LocStats> = {}

    const compute = (id: string): LocStats => {
      if (rollup[id]) return rollup[id]
      const base = direct[id] || { count: 0, total: 0, depreciated: 0 }
      const kids = childrenMap[id] || []
      const agg = { ...base }
      for (const k of kids) {
        const child = compute(k)
        agg.count += child.count
        agg.total += child.total
        agg.depreciated += child.depreciated
      }
      rollup[id] = agg
      return agg
    }

    for (const l of locations) compute(l.id)
    return rollup
  }, [items, locations, childrenMap])

  // Selecting a location selects that node (not auto-descendants in UI),
  // but filtering includes descendants so “root selection” works.
  const toggleLocation = (id: string) => {
    setSelectedLocationIds(prev => (prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]))
  }

  const selectedLocationSet = useMemo(() => {
    const s = new Set<string>()
    for (const id of selectedLocationIds) {
      for (const d of descendantsOf(id)) s.add(d)
    }
    return s
  }, [selectedLocationIds, descendantsOf])

  const filteredItems = useMemo(() => {
    if (selectedLocationIds.length === 0) return []
    return items.filter(i => i.location_id && selectedLocationSet.has(i.location_id))
  }, [items, selectedLocationIds, selectedLocationSet])

  const totals = useMemo(() => {
    const total = filteredItems.reduce((sum, i) => sum + (i.price ?? 0), 0)
    const depreciated = filteredItems.reduce((sum, i) => sum + calcDepreciatedValue(i), 0)
    return { total, depreciated }
  }, [filteredItems])

  const warrantyAlerts = useMemo(() => {
    const now = new Date()
    const soon = new Date(now.getTime() + WARRANTY_ALERT_DAYS * 24 * 60 * 60 * 1000)

    const expired: InventoryItem[] = []
    const expiring: InventoryItem[] = []

    for (const it of filteredItems) {
      const w = parseDate(it.warranty_expiration)
      if (!w) continue
      if (w < now) expired.push(it)
      else if (w <= soon) expiring.push(it)
    }

    return { expired, expiring }
  }, [filteredItems])

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

  const handleDeleteFromList = async (id: string) => {
    if (!confirm('Delete this item?')) return
    const { error } = await supabase.from('items').delete().eq('id', id)
    if (error) return alert(error.message)
    setItems(prev => prev.filter(i => i.id !== id))
  }

  const exportCsv = () => {
    const rows = filteredItems.map(it => ({
      id: it.id,
      name: it.name,
      location: it.location_id ? nameMap[it.location_id] ?? it.location_id : '',
      vendor: it.vendor ?? '',
      price: it.price ?? 0,
      purchase_date: it.purchase_date ?? '',
      warranty_expiration: it.warranty_expiration ?? '',
      depreciation_years: it.depreciation_years ?? '',
      depreciated_value: calcDepreciatedValue(it).toFixed(2),
      photo_count: it.photos?.length ?? 0
    }))

    const csv = toCsv(rows)
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)

    const a = document.createElement('a')
    a.href = url
    a.download = `inventory_export_${new Date().toISOString().slice(0, 10)}.csv`
    a.click()

    URL.revokeObjectURL(url)
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

      <div className="bg-white p-6 rounded-xl shadow-md mb-6">
        <h1 className="text-2xl font-bold mb-4">Inventory</h1>

        {/* Location rollup badges (roots + children) */}
        <div className="space-y-3">
          {roots.map(rootId => (
            <div key={rootId}>
              <div className="flex items-center gap-3 mb-2">
                <button
                  onClick={() => toggleLocation(rootId)}
                  className={`px-4 py-2 rounded-lg border flex flex-col items-start ${
                    selectedLocationIds.includes(rootId) ? 'bg-indigo-600 text-white' : 'bg-white'
                  }`}
                >
                  <span className="font-semibold">{nameMap[rootId] ?? 'Root'}</span>
                  <span className="text-xs opacity-80">{rollupStats[rootId]?.count ?? 0} items</span>
                  <span className="text-xs opacity-80">${(rollupStats[rootId]?.total ?? 0).toFixed(2)} total</span>
                  <span className="text-xs opacity-80">${(rollupStats[rootId]?.depreciated ?? 0).toFixed(2)} dep.</span>
                </button>

                <span className="text-slate-500 text-sm">Rollup (includes all children)</span>
              </div>

              <div className="flex gap-3 flex-wrap pl-2">
                {(childrenMap[rootId] || []).map(childId => (
                  <button
                    key={childId}
                    onClick={() => toggleLocation(childId)}
                    className={`px-4 py-2 rounded-lg border flex flex-col items-start ${
                      selectedLocationIds.includes(childId) ? 'bg-indigo-600 text-white' : 'bg-white'
                    }`}
                  >
                    <span className="font-semibold">{nameMap[childId] ?? 'Location'}</span>
                    <span className="text-xs opacity-80">{rollupStats[childId]?.count ?? 0} items</span>
                    <span className="text-xs opacity-80">${(rollupStats[childId]?.total ?? 0).toFixed(2)} total</span>
                    <span className="text-xs opacity-80">${(rollupStats[childId]?.depreciated ?? 0).toFixed(2)} dep.</span>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="mt-5 flex flex-wrap gap-3 items-center justify-between">
          <div className="text-sm text-slate-700">
            <span className="font-semibold">Selected Total:</span> ${totals.total.toFixed(2)}{' '}
            <span className="ml-3 font-semibold">Depreciated:</span> ${totals.depreciated.toFixed(2)}
          </div>

          <button
            onClick={exportCsv}
            disabled={selectedLocationIds.length === 0}
            className="px-4 py-2 rounded bg-slate-800 text-white disabled:opacity-50"
          >
            Export CSV
          </button>
        </div>

        {(warrantyAlerts.expired.length > 0 || warrantyAlerts.expiring.length > 0) && (
          <div className="mt-4 p-4 rounded-lg border bg-slate-50">
            <div className="font-semibold mb-2">Warranty Alerts</div>
            <div className="text-sm text-slate-700 flex flex-col gap-1">
              {warrantyAlerts.expired.length > 0 && (
                <div>
                  <span className="text-red-700 font-semibold">Expired:</span> {warrantyAlerts.expired.length} item(s)
                </div>
              )}
              {warrantyAlerts.expiring.length > 0 && (
                <div>
                  <span className="text-amber-700 font-semibold">Expiring ≤ {WARRANTY_ALERT_DAYS} days:</span>{' '}
                  {warrantyAlerts.expiring.length} item(s)
                </div>
              )}
              <div className="text-xs text-slate-500">
                Tip: open an item to confirm warranty date and vendor contact.
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Items list */}
      {selectedLocationIds.length === 0 ? (
        <div className="text-slate-500 text-center">Select a location to view inventory.</div>
      ) : (
        <div className="space-y-4">
          {filteredItems.map(item => {
            const dep = calcDepreciatedValue(item)
            const w = parseDate(item.warranty_expiration)
            const now = new Date()
            const soon = new Date(now.getTime() + WARRANTY_ALERT_DAYS * 24 * 60 * 60 * 1000)

            const warrantyStatus =
              w && w < now ? 'expired' : w && w <= soon ? 'expiring' : null

            return (
              <div key={item.id} className="bg-white rounded-xl shadow-md p-4 flex gap-4">
                <div
                  className="w-24 h-24 border rounded bg-slate-100 cursor-pointer flex items-center justify-center"
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
                  <div className="flex items-center gap-2">
                    <div className="font-semibold text-slate-800">{item.name}</div>
                    {warrantyStatus === 'expired' && (
                      <span className="text-xs px-2 py-1 rounded bg-red-100 text-red-800">Warranty expired</span>
                    )}
                    {warrantyStatus === 'expiring' && (
                      <span className="text-xs px-2 py-1 rounded bg-amber-100 text-amber-800">
                        Warranty soon
                      </span>
                    )}
                  </div>

                  <div className="text-sm text-slate-700 mt-1">
                    <span className="font-semibold">Price:</span> ${item.price ?? 0}{' '}
                    <span className="ml-3 font-semibold">Depreciated:</span> ${dep.toFixed(2)}
                  </div>

                  <div className="text-sm text-slate-500 mt-1">
                    {item.vendor ?? ''}{item.vendor ? ' • ' : ''}
                    {item.purchase_date ? `Purchased ${item.purchase_date}` : ''}
                  </div>
                </div>

                <button onClick={() => handleDeleteFromList(item.id)} className="text-red-600 font-semibold">
                  Delete
                </button>
              </div>
            )
          })}
        </div>
      )}

      {editingItem && (
        <EditItemModal
          item={editingItem}
          onClose={() => setEditingItem(null)}
          onUpdated={updated => {
            setItems(prev => prev.map(i => (i.id === updated.id ? updated : i)))
          }}
          onDeleted={id => {
            setItems(prev => prev.filter(i => i.id !== id))
          }}
        />
      )}
    </main>
  )
}
'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabaseBrowser } from '@/lib/supabase-browser'

type LocationRow = {
  id: string
  name: string
  parent_id: string | null
}

type CategoryRow = {
  id: string
  name: string
}

type ItemRow = {
  id: string
  property_id: string
  location_id: string | null
  name: string
  category: string | null
  quantity: number
  purchase_price: number | null
  vendor: string | null
  notes: string | null
  photo_url: string | null

  purchase_date: string | null
  warranty_expires_on: string | null
  depreciation_method: string | null
  useful_life_months: number | null
  salvage_value: number | null
}

function safeCsv(v: any) {
  const s = String(v ?? '')
  // CSV escape: wrap in quotes and double any internal quotes
  return `"${s.replace(/"/g, '""')}"`
}

export default function InventoryPage() {
  const supabase = supabaseBrowser()
  const router = useRouter()

  const [property, setProperty] = useState<any>(null)
  const [locations, setLocations] = useState<LocationRow[]>([])
  const [categories, setCategories] = useState<CategoryRow[]>([])
  const [items, setItems] = useState<ItemRow[]>([])
  const [selectedLocations, setSelectedLocations] = useState<string[]>([])
  const [selectedItems, setSelectedItems] = useState<string[]>([])
  const [layout, setLayout] = useState<'grid' | 'table'>('grid')
  const [sortBy, setSortBy] = useState<'name' | 'price' | 'vendor'>('name')

  const [editingItem, setEditingItem] = useState<ItemRow | null>(null)

  useEffect(() => {
    const init = async () => {
      const { data: userData } = await supabase.auth.getUser()
      if (!userData.user) {
        router.push('/')
        return
      }

      const { data: prop } = await supabase
        .from('properties')
        .select('*')
        .limit(1)
        .single()

      if (!prop) return
      setProperty(prop)

      const { data: locs } = await supabase
        .from('locations')
        .select('id,name,parent_id')
        .eq('property_id', prop.id)

      setLocations(locs ?? [])

      const { data: cats } = await supabase
        .from('categories')
        .select('*')
        .eq('property_id', prop.id)
        .order('name')

      setCategories(cats ?? [])

      const { data: its } = await supabase
        .from('items')
        .select('*')
        .eq('property_id', prop.id)

      setItems((its ?? []) as ItemRow[])
    }

    init()
  }, [])

  const validLocations = useMemo(() => locations.filter(l => l.parent_id !== null), [locations])

  const locationName = useMemo(() => {
    const m = new Map<string, string>()
    locations.forEach(l => m.set(l.id, l.name))
    return m
  }, [locations])

  const locationCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    items.forEach(i => {
      if (!i.location_id) return
      counts[i.location_id] = (counts[i.location_id] ?? 0) + 1
    })
    return counts
  }, [items])

  const toggleLocation = (id: string) => {
    setSelectedLocations(prev => (prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]))
    setSelectedItems([]) // clear selection when scope changes
  }

  const filteredItems = useMemo(() => {
    if (selectedLocations.length === 0) return []

    let result = items.filter(i => i.location_id && selectedLocations.includes(i.location_id))

    result = result.sort((a, b) => {
      if (sortBy === 'name') return a.name.localeCompare(b.name)
      if (sortBy === 'vendor') return (a.vendor ?? '').localeCompare(b.vendor ?? '')
      if (sortBy === 'price') return (a.purchase_price ?? 0) - (b.purchase_price ?? 0)
      return 0
    })

    return result
  }, [items, selectedLocations, sortBy])

  const totalPrice = useMemo(() => {
    return filteredItems.reduce((sum, item) => sum + (item.purchase_price ?? 0), 0)
  }, [filteredItems])

  const perLocation = useMemo(() => {
    const map = new Map<string, { locationId: string; count: number; value: number }>()
    for (const item of filteredItems) {
      if (!item.location_id) continue
      const rec = map.get(item.location_id) ?? { locationId: item.location_id, count: 0, value: 0 }
      rec.count += 1
      rec.value += item.purchase_price ?? 0
      map.set(item.location_id, rec)
    }
    const arr = Array.from(map.values())
    arr.sort((a, b) => b.value - a.value)
    return arr
  }, [filteredItems])

  const maxLocValue = perLocation.length ? perLocation[0].value : 0

  const toggleItem = (id: string) => {
    setSelectedItems(prev => (prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]))
  }

  const bulkDelete = async () => {
    if (selectedItems.length === 0) return
    if (!confirm(`Delete ${selectedItems.length} selected item(s)?`)) return

    const { error } = await supabase.from('items').delete().in('id', selectedItems)
    if (error) {
      alert(error.message)
      return
    }

    setItems(prev => prev.filter(i => !selectedItems.includes(i.id)))
    setSelectedItems([])
  }

  const deleteSingle = async (id: string) => {
    if (!confirm('Delete this item?')) return
    const { error } = await supabase.from('items').delete().eq('id', id)
    if (error) {
      alert(error.message)
      return
    }
    setItems(prev => prev.filter(i => i.id !== id))
    setSelectedItems(prev => prev.filter(x => x !== id))
  }

  const exportCsv = () => {
    if (selectedLocations.length === 0) {
      alert('Select one or more locations first.')
      return
    }

    // Export currently filtered items (scope = selected locations)
    const headers = [
      'id',
      'name',
      'category',
      'vendor',
      'purchase_price',
      'purchase_date',
      'warranty_expires_on',
      'depreciation_method',
      'useful_life_months',
      'salvage_value',
      'location',
      'notes',
      'photo_url'
    ]

    const rows = filteredItems.map(i => [
      i.id,
      i.name,
      i.category ?? '',
      i.vendor ?? '',
      i.purchase_price ?? '',
      i.purchase_date ?? '',
      i.warranty_expires_on ?? '',
      i.depreciation_method ?? '',
      i.useful_life_months ?? '',
      i.salvage_value ?? '',
      i.location_id ? locationName.get(i.location_id) ?? i.location_id : '',
      i.notes ?? '',
      i.photo_url ?? ''
    ])

    const csv =
      headers.map(safeCsv).join(',') +
      '\n' +
      rows.map(r => r.map(safeCsv).join(',')).join('\n')

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)

    const a = document.createElement('a')
    a.href = url
    a.download = `inventory_export_${new Date().toISOString().slice(0, 10)}.csv`
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
  }

  const uploadPhoto = async (file: File, itemId: string) => {
    if (!property) return null

    const filePath = `${property.id}/${itemId}/${Date.now()}_${file.name}`
    const { error } = await supabase.storage.from('property-files').upload(filePath, file)
    if (error) {
      alert(error.message)
      return null
    }

    const { data } = supabase.storage.from('property-files').getPublicUrl(filePath)
    return data.publicUrl
  }

  const saveItem = async (updated: ItemRow) => {
    // enforce category from Settings
    if (!updated.category) {
      alert('Category is required (manage categories in Settings).')
      return
    }
    if (!updated.location_id) {
      alert('Location is required (no root-level items).')
      return
    }

    const { error } = await supabase.from('items').update(updated).eq('id', updated.id)
    if (error) {
      alert(error.message)
      return
    }

    setItems(prev => prev.map(i => (i.id === updated.id ? updated : i)))
    setEditingItem(null)
  }

  if (!property) return <div className="p-8">Loading...</div>

  return (
    <main className="min-h-screen bg-slate-100 p-8">
      <TopNav />

      <div className="bg-white p-6 rounded-xl shadow-md mb-6">
        <h1 className="text-2xl font-bold mb-4">Inventory</h1>

        <div className="font-semibold mb-2">Select Location(s)</div>
        <div className="flex flex-wrap gap-2 mb-4">
          {validLocations.map(l => (
            <button
              key={l.id}
              onClick={() => toggleLocation(l.id)}
              className={`px-3 py-1 rounded border ${
                selectedLocations.includes(l.id) ? 'bg-indigo-600 text-white' : 'bg-white'
              }`}
            >
              {l.name}
              <span className="ml-2 text-xs bg-slate-200 px-2 py-0.5 rounded text-slate-700">
                {locationCounts[l.id] ?? 0}
              </span>
            </button>
          ))}
        </div>

        {selectedLocations.length > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="text-sm text-slate-700">
              Total Purchase Value (selected): <span className="font-semibold">${totalPrice.toFixed(2)}</span>
            </div>

            <div className="flex flex-wrap gap-2 items-center">
              <button onClick={exportCsv} className="border px-3 py-1 rounded bg-white">
                Export CSV
              </button>

              <select value={sortBy} onChange={e => setSortBy(e.target.value as any)} className="border p-1 rounded">
                <option value="name">Sort: Name</option>
                <option value="price">Sort: Price</option>
                <option value="vendor">Sort: Vendor</option>
              </select>

              <button
                onClick={() => setLayout(layout === 'grid' ? 'table' : 'grid')}
                className="border px-3 py-1 rounded bg-white"
              >
                {layout === 'grid' ? 'Table View' : 'Grid View'}
              </button>

              <button
                onClick={bulkDelete}
                disabled={selectedItems.length === 0}
                className={`px-3 py-1 rounded text-white ${
                  selectedItems.length === 0 ? 'bg-red-300 cursor-not-allowed' : 'bg-red-600'
                }`}
              >
                Delete Selected ({selectedItems.length})
              </button>
            </div>
          </div>
        )}
      </div>

      {selectedLocations.length === 0 ? (
        <div className="text-center text-slate-500 mt-12">Please select one or more locations to view inventory.</div>
      ) : (
        <>
          {/* Per-location breakdown */}
          <div className="bg-white p-6 rounded-xl shadow-md mb-6">
            <h2 className="text-xl font-semibold mb-3">Per-Location Value Breakdown</h2>

            {perLocation.length === 0 ? (
              <div className="text-slate-500">No items in selected locations.</div>
            ) : (
              <div className="space-y-3">
                {perLocation.map(r => {
                  const pct = maxLocValue ? (r.value / maxLocValue) * 100 : 0
                  return (
                    <div key={r.locationId}>
                      <div className="flex justify-between text-sm mb-1">
                        <div className="font-medium">{locationName.get(r.locationId) ?? r.locationId}</div>
                        <div className="text-slate-600">
                          ${r.value.toFixed(2)} • {r.count} items
                        </div>
                      </div>
                      <div className="h-3 bg-slate-100 rounded">
                        <div className="h-3 bg-indigo-600 rounded" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Items */}
          {layout === 'grid' ? (
            <div className="grid gap-4 md:grid-cols-3">
              {filteredItems.map(item => (
                <div key={item.id} className="bg-white p-4 rounded-xl shadow-md">
                  <div className="flex gap-3 mb-3">
                    {item.photo_url ? (
                      <img src={item.photo_url} className="w-16 h-16 object-cover rounded" />
                    ) : (
                      <div className="w-16 h-16 bg-slate-200 rounded flex items-center justify-center text-xs text-slate-500">
                        No Image
                      </div>
                    )}

                    <div className="min-w-0">
                      <div className="font-semibold truncate">{item.name}</div>
                      <div className="text-sm text-slate-600 truncate">{item.category ?? ''}</div>
                      {item.vendor && <div className="text-xs text-slate-500 truncate">Vendor: {item.vendor}</div>}
                      {item.purchase_price !== null && (
                        <div className="text-xs text-slate-500">Price: ${item.purchase_price}</div>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center justify-between">
                    <label className="text-sm flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={selectedItems.includes(item.id)}
                        onChange={() => toggleItem(item.id)}
                      />
                      Select
                    </label>

                    <div className="flex gap-3 text-sm">
                      <button onClick={() => setEditingItem(item)} className="text-indigo-600">
                        Edit
                      </button>
                      <button onClick={() => deleteSingle(item.id)} className="text-red-600">
                        Delete
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="bg-white rounded-xl shadow-md overflow-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-100">
                  <tr>
                    <th className="p-2 text-left">Select</th>
                    <th className="p-2 text-left">Name</th>
                    <th className="p-2 text-left">Category</th>
                    <th className="p-2 text-left">Vendor</th>
                    <th className="p-2 text-left">Price</th>
                    <th className="p-2 text-left">Purchase Date</th>
                    <th className="p-2 text-left">Warranty Expires</th>
                    <th className="p-2 text-left">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredItems.map(item => (
                    <tr key={item.id} className="border-t">
                      <td className="p-2">
                        <input
                          type="checkbox"
                          checked={selectedItems.includes(item.id)}
                          onChange={() => toggleItem(item.id)}
                        />
                      </td>
                      <td className="p-2">{item.name}</td>
                      <td className="p-2">{item.category ?? ''}</td>
                      <td className="p-2">{item.vendor ?? ''}</td>
                      <td className="p-2">${item.purchase_price ?? 0}</td>
                      <td className="p-2">{item.purchase_date ?? ''}</td>
                      <td className="p-2">{item.warranty_expires_on ?? ''}</td>
                      <td className="p-2">
                        <div className="flex gap-3">
                          <button onClick={() => setEditingItem(item)} className="text-indigo-600">
                            Edit
                          </button>
                          <button onClick={() => deleteSingle(item.id)} className="text-red-600">
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {editingItem && (
            <EditItemModal
              item={editingItem}
              categories={categories}
              locations={validLocations}
              uploadPhoto={uploadPhoto}
              onCancel={() => setEditingItem(null)}
              onSave={saveItem}
            />
          )}
        </>
      )}
    </main>
  )
}

function EditItemModal({
  item,
  categories,
  locations,
  uploadPhoto,
  onCancel,
  onSave
}: {
  item: ItemRow
  categories: CategoryRow[]
  locations: LocationRow[]
  uploadPhoto: (file: File, itemId: string) => Promise<string | null>
  onCancel: () => void
  onSave: (updated: ItemRow) => void
}) {
  const [form, setForm] = useState<ItemRow>({ ...item })

  const handleFile = async (e: any) => {
    const file = e.target.files?.[0]
    if (!file) return
    const url = await uploadPhoto(file, form.id)
    if (!url) return
    setForm({ ...form, photo_url: url })
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center">
      <div className="bg-white p-6 rounded-xl w-[650px] max-w-[95vw] space-y-4">
        <div className="flex justify-between items-center">
          <h2 className="text-xl font-semibold">Edit Inventory Item</h2>
          <button onClick={onCancel} className="text-slate-600">✕</button>
        </div>

        <Field label="Item Name">
          <input
            className="border p-2 rounded w-full"
            value={form.name}
            onChange={e => setForm({ ...form, name: e.target.value })}
            placeholder="e.g., Dyson Vacuum V15"
          />
        </Field>

        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Category">
            <select
              className="border p-2 rounded w-full"
              value={form.category ?? ''}
              onChange={e => setForm({ ...form, category: e.target.value || null })}
            >
              <option value="">Select Category</option>
              {categories.map(c => (
                <option key={c.id} value={c.name}>{c.name}</option>
              ))}
            </select>
            <div className="text-xs text-slate-500 mt-1">
              Manage categories in Settings.
            </div>
          </Field>

          <Field label="Location (non-root required)">
            <select
              className="border p-2 rounded w-full"
              value={form.location_id ?? ''}
              onChange={e => setForm({ ...form, location_id: e.target.value || null })}
            >
              <option value="">Select Location</option>
              {locations.map(l => (
                <option key={l.id} value={l.id}>{l.name}</option>
              ))}
            </select>
          </Field>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Purchase Price (USD)">
            <input
              type="number"
              step="0.01"
              className="border p-2 rounded w-full"
              value={form.purchase_price ?? ''}
              onChange={e => setForm({ ...form, purchase_price: e.target.value ? parseFloat(e.target.value) : null })}
              placeholder="e.g., 499.99"
            />
          </Field>

          <Field label="Vendor">
            <input
              className="border p-2 rounded w-full"
              value={form.vendor ?? ''}
              onChange={e => setForm({ ...form, vendor: e.target.value || null })}
              placeholder="e.g., Home Depot"
            />
          </Field>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Purchase Date">
            <input
              type="date"
              className="border p-2 rounded w-full"
              value={form.purchase_date ?? ''}
              onChange={e => setForm({ ...form, purchase_date: e.target.value || null })}
            />
          </Field>

          <Field label="Warranty Expires On">
            <input
              type="date"
              className="border p-2 rounded w-full"
              value={form.warranty_expires_on ?? ''}
              onChange={e => setForm({ ...form, warranty_expires_on: e.target.value || null })}
            />
          </Field>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <Field label="Depreciation Method">
            <select
              className="border p-2 rounded w-full"
              value={form.depreciation_method ?? 'straight_line'}
              onChange={e => setForm({ ...form, depreciation_method: e.target.value })}
            >
              <option value="straight_line">Straight-line</option>
            </select>
          </Field>

          <Field label="Useful Life (months)">
            <input
              type="number"
              className="border p-2 rounded w-full"
              value={form.useful_life_months ?? ''}
              onChange={e => setForm({ ...form, useful_life_months: e.target.value ? parseInt(e.target.value) : null })}
              placeholder="e.g., 60"
            />
          </Field>

          <Field label="Salvage Value (USD)">
            <input
              type="number"
              step="0.01"
              className="border p-2 rounded w-full"
              value={form.salvage_value ?? ''}
              onChange={e => setForm({ ...form, salvage_value: e.target.value ? parseFloat(e.target.value) : null })}
              placeholder="e.g., 50.00"
            />
          </Field>
        </div>

        <Field label="Notes">
          <textarea
            className="border p-2 rounded w-full"
            value={form.notes ?? ''}
            onChange={e => setForm({ ...form, notes: e.target.value || null })}
            placeholder="Any details you want to remember: model, serial, maintenance notes, etc."
          />
        </Field>

        <Field label="Photo">
          <input type="file" onChange={handleFile} />
          <div className="mt-2">
            {form.photo_url ? (
              <img src={form.photo_url} className="w-32 h-32 object-cover rounded" />
            ) : (
              <div className="w-32 h-32 bg-slate-200 rounded flex items-center justify-center text-xs text-slate-500">
                No Image
              </div>
            )}
          </div>
        </Field>

        <div className="flex justify-end gap-3 pt-2">
          <button onClick={onCancel} className="text-slate-700">Cancel</button>
          <button onClick={() => onSave(form)} className="bg-indigo-600 text-white px-4 py-2 rounded">
            Save
          </button>
        </div>
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: any }) {
  return (
    <div>
      <div className="text-sm font-semibold mb-1">{label}</div>
      {children}
    </div>
  )
}

function TopNav() {
  return (
    <div className="flex gap-4 mb-6">
      <Link href="/dashboard">Locations</Link>
      <Link href="/inventory" className="font-semibold">Inventory</Link>
      <Link href="/analytics">Analytics</Link>
      <Link href="/settings">Settings</Link>
    </div>
  )
}
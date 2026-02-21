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

type ItemRow = {
  id: string
  property_id: string
  location_id: string | null
  name: string
  category: string | null
  purchase_price: number | null
  vendor: string | null
  notes: string | null
  photo_url: string | null
}

export default function InventoryPage() {
  const supabase = supabaseBrowser()
  const router = useRouter()

  const [property, setProperty] = useState<any>(null)
  const [locations, setLocations] = useState<LocationRow[]>([])
  const [items, setItems] = useState<ItemRow[]>([])
  const [selectedLocations, setSelectedLocations] = useState<string[]>([])
  const [editingItem, setEditingItem] = useState<ItemRow | null>(null)
  const [photoItem, setPhotoItem] = useState<ItemRow | null>(null)

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

      const { data: its } = await supabase
        .from('items')
        .select('*')
        .eq('property_id', prop.id)

      setItems(its ?? [])
    }

    init()
  }, [])

  const validLocations = useMemo(
    () => locations.filter(l => l.parent_id !== null),
    [locations]
  )

  const toggleLocation = (id: string) => {
    setSelectedLocations(prev =>
      prev.includes(id)
        ? prev.filter(x => x !== id)
        : [...prev, id]
    )
  }

  const filteredItems = useMemo(() => {
    if (selectedLocations.length === 0) return []
    return items.filter(
      i => i.location_id && selectedLocations.includes(i.location_id)
    )
  }, [items, selectedLocations])

  const deleteItem = async (id: string) => {
    if (!confirm('Delete this item?')) return
    await supabase.from('items').delete().eq('id', id)
    setItems(prev => prev.filter(i => i.id !== id))
  }

  const saveItem = async (updated: ItemRow) => {
    await supabase
      .from('items')
      .update(updated)
      .eq('id', updated.id)

    setItems(prev =>
      prev.map(i => (i.id === updated.id ? updated : i))
    )

    setEditingItem(null)
  }

  if (!property)
    return <div className="p-8">Loading...</div>

  return (
    <main className="min-h-screen bg-slate-100 p-8">
      <TopNav />

      <div className="bg-white p-6 rounded-xl shadow-md mb-6">
        <h1 className="text-2xl font-bold mb-4">
          Inventory
        </h1>

        <div className="flex gap-2 flex-wrap">
          {validLocations.map(l => (
            <button
              key={l.id}
              onClick={() => toggleLocation(l.id)}
              className={`px-3 py-1 rounded border ${
                selectedLocations.includes(l.id)
                  ? 'bg-indigo-600 text-white'
                  : 'bg-white'
              }`}
            >
              {l.name}
            </button>
          ))}
        </div>
      </div>

      {selectedLocations.length === 0 ? (
        <div className="text-center text-slate-500">
          Select location(s) to view items.
        </div>
      ) : (
        <div className="space-y-4">
          {filteredItems.map(item => (
            <div
              key={item.id}
              className="bg-white rounded-xl shadow-md p-4 flex gap-4 hover:shadow-lg transition cursor-pointer"
              onClick={() => setEditingItem(item)}
            >
              {/* IMAGE THUMBNAIL */}
              <div
                className="w-28 h-28 rounded-lg overflow-hidden border bg-slate-100 relative group flex-shrink-0"
                onClick={(e) => {
                  e.stopPropagation()
                  setPhotoItem(item)
                }}
              >
                {item.photo_url ? (
                  <img
                    src={item.photo_url}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <img
                    src="/no-image.jpg"
                    className="w-full h-full object-contain p-4 opacity-60"
                  />
                )}

                <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-40 transition flex items-center justify-center">
                  <span className="text-white text-xs opacity-0 group-hover:opacity-100 transition">
                    Manage Photos
                  </span>
                </div>
              </div>

              {/* DETAILS */}
              <div className="flex-1">
                <div className="text-lg font-semibold">
                  {item.name}
                </div>

                <div className="text-sm text-slate-600 mt-1">
                  Category: {item.category ?? '—'}
                </div>

                <div className="text-sm text-slate-600">
                  Vendor: {item.vendor ?? '—'}
                </div>

                <div className="text-sm text-slate-600">
                  Price: $
                  {item.purchase_price ?? 0}
                </div>

                <div className="flex gap-4 mt-3 text-sm">
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      setEditingItem(item)
                    }}
                    className="text-indigo-600"
                  >
                    Edit
                  </button>

                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      deleteItem(item.id)
                    }}
                    className="text-red-600"
                  >
                    Delete
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* FULL EDIT MODAL */}
      {editingItem && (
        <EditModal
          item={editingItem}
          onClose={() => setEditingItem(null)}
          onSave={saveItem}
        />
      )}

      {/* PHOTO MANAGER MODAL */}
      {photoItem && (
        <PhotoModal
          item={photoItem}
          onClose={() => setPhotoItem(null)}
        />
      )}
    </main>
  )
}

function EditModal({
  item,
  onClose,
  onSave,
}: {
  item: ItemRow
  onClose: () => void
  onSave: (i: ItemRow) => void
}) {
  const [form, setForm] = useState(item)

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center">
      <div className="bg-white p-6 rounded-xl w-[600px] space-y-4">
        <h2 className="text-xl font-semibold">
          Edit Inventory Item
        </h2>

        <input
          className="border p-2 rounded w-full"
          value={form.name}
          onChange={(e) =>
            setForm({ ...form, name: e.target.value })
          }
          placeholder="Item Name"
        />

        <input
          className="border p-2 rounded w-full"
          value={form.category ?? ''}
          onChange={(e) =>
            setForm({ ...form, category: e.target.value })
          }
          placeholder="Category"
        />

        <input
          className="border p-2 rounded w-full"
          value={form.vendor ?? ''}
          onChange={(e) =>
            setForm({ ...form, vendor: e.target.value })
          }
          placeholder="Vendor"
        />

        <input
          type="number"
          className="border p-2 rounded w-full"
          value={form.purchase_price ?? ''}
          onChange={(e) =>
            setForm({
              ...form,
              purchase_price: parseFloat(e.target.value),
            })
          }
          placeholder="Purchase Price"
        />

        <textarea
          className="border p-2 rounded w-full"
          value={form.notes ?? ''}
          onChange={(e) =>
            setForm({ ...form, notes: e.target.value })
          }
          placeholder="Notes"
        />

        <div className="flex justify-end gap-3">
          <button
            onClick={onClose}
            className="text-slate-600"
          >
            Cancel
          </button>
          <button
            onClick={() => onSave(form)}
            className="bg-indigo-600 text-white px-4 py-2 rounded"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  )
}

function PhotoModal({
  item,
  onClose,
}: {
  item: ItemRow
  onClose: () => void
}) {
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center">
      <div className="bg-white p-6 rounded-xl w-[600px] space-y-4">
        <h2 className="text-xl font-semibold">
          Photo Manager
        </h2>

        <div className="text-slate-600">
          Multi-photo gallery will go here next.
        </div>

        <button
          onClick={onClose}
          className="bg-indigo-600 text-white px-4 py-2 rounded"
        >
          Close
        </button>
      </div>
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
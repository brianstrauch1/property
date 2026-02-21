'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
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

  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const [activePhotoItem, setActivePhotoItem] = useState<ItemRow | null>(null)

  const [property, setProperty] = useState<any>(null)
  const [locations, setLocations] = useState<LocationRow[]>([])
  const [items, setItems] = useState<ItemRow[]>([])
  const [selectedLocations, setSelectedLocations] = useState<string[]>([])
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
    await supabase.from('items').update(updated).eq('id', updated.id)

    setItems(prev =>
      prev.map(i => (i.id === updated.id ? updated : i))
    )

    setEditingItem(null)
  }

  const handlePhotoUpload = async (files: FileList) => {
    if (!activePhotoItem) return

    let firstUploadedUrl: string | null = null

    for (let file of Array.from(files)) {
      const filePath = `${activePhotoItem.id}/${Date.now()}-${file.name}`

      const { error: uploadError } = await supabase.storage
        .from('item-photos')
        .upload(filePath, file)

      if (uploadError) continue

      const { data } = supabase.storage
        .from('item-photos')
        .getPublicUrl(filePath)

      await supabase.from('item_photos').insert({
        item_id: activePhotoItem.id,
        photo_url: data.publicUrl,
        is_primary: false,
      })

      if (!firstUploadedUrl) firstUploadedUrl = data.publicUrl
    }

    if (firstUploadedUrl) {
      await supabase
        .from('items')
        .update({ photo_url: firstUploadedUrl })
        .eq('id', activePhotoItem.id)

      setItems(prev =>
        prev.map(i =>
          i.id === activePhotoItem.id
            ? { ...i, photo_url: firstUploadedUrl }
            : i
        )
      )
    }

    setActivePhotoItem(null)
  }

  if (!property) return <div className="p-8">Loading...</div>

  return (
    <main className="min-h-screen bg-slate-100 p-8">
      <TopNav />

      <div className="bg-white p-6 rounded-xl shadow-md mb-6">
        <h1 className="text-2xl font-bold mb-4">Inventory</h1>

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

      <input
        type="file"
        ref={fileInputRef}
        multiple
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          if (e.target.files) handlePhotoUpload(e.target.files)
        }}
      />

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
              <div
                className="w-28 h-28 rounded-lg overflow-hidden border bg-slate-100 flex-shrink-0"
                onClick={(e) => {
                  e.stopPropagation()
                  setActivePhotoItem(item)
                  fileInputRef.current?.click()
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
              </div>

              <div className="flex-1">
                <div className="text-lg font-semibold">
                  {item.name}
                </div>
                <div className="text-sm text-slate-600">
                  Category: {item.category ?? '—'}
                </div>
                <div className="text-sm text-slate-600">
                  Vendor: {item.vendor ?? '—'}
                </div>
                <div className="text-sm text-slate-600">
                  Price: ${item.purchase_price ?? 0}
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

      {editingItem && (
        <EditModal
          item={editingItem}
          onClose={() => setEditingItem(null)}
          onSave={saveItem}
        />
      )}
    </main>
  )
}

function EditModal({
  item,
  onClose,
  onSave,
}: any) {
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
          <button onClick={onClose}>Cancel</button>
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

function TopNav() {
  return (
    <div className="flex gap-4 mb-6">
      <Link href="/dashboard">Locations</Link>
      <Link href="/inventory" className="font-semibold">
        Inventory
      </Link>
      <Link href="/analytics">Analytics</Link>
      <Link href="/settings">Settings</Link>
    </div>
  )
}
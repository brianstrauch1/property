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

type PhotoRow = {
  id: string
  item_id: string
  photo_url: string
  is_primary: boolean
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
    await supabase.from('items').update(updated).eq('id', updated.id)

    setItems(prev =>
      prev.map(i => (i.id === updated.id ? updated : i))
    )

    setEditingItem(null)
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

      {photoItem && (
        <PhotoModal
          item={photoItem}
          onClose={() => setPhotoItem(null)}
          onPrimaryUpdate={(url: string) => {
            setItems(prev =>
              prev.map(i =>
                i.id === photoItem.id
                  ? { ...i, photo_url: url }
                  : i
              )
            )
          }}
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
  onSave: (item: ItemRow) => void
}) {
  const [form, setForm] = useState<ItemRow>(item)

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

function PhotoModal({
  item,
  onClose,
  onPrimaryUpdate,
}: {
  item: ItemRow
  onClose: () => void
  onPrimaryUpdate: (url: string) => void
}) {
  const supabase = supabaseBrowser()
  const [photos, setPhotos] = useState<PhotoRow[]>([])

  useEffect(() => {
    loadPhotos()
  }, [])

  const loadPhotos = async () => {
    const { data } = await supabase
      .from('item_photos')
      .select('*')
      .eq('item_id', item.id)
      .order('created_at', { ascending: false })

    setPhotos(data ?? [])
  }

  const uploadPhotos = async (files: FileList) => {
    for (let file of Array.from(files)) {
      const filePath = `${item.id}/${Date.now()}-${file.name}`

      await supabase.storage
        .from('item-photos')
        .upload(filePath, file)

      const { data } = supabase.storage
        .from('item-photos')
        .getPublicUrl(filePath)

      await supabase.from('item_photos').insert({
        item_id: item.id,
        photo_url: data.publicUrl,
      })
    }

    loadPhotos()
  }

  const setPrimary = async (photo: PhotoRow) => {
    await supabase
      .from('item_photos')
      .update({ is_primary: false })
      .eq('item_id', item.id)

    await supabase
      .from('item_photos')
      .update({ is_primary: true })
      .eq('id', photo.id)

    await supabase
      .from('items')
      .update({ photo_url: photo.photo_url })
      .eq('id', item.id)

    onPrimaryUpdate(photo.photo_url)
    loadPhotos()
  }

  const deletePhoto = async (photo: PhotoRow) => {
    await supabase
      .from('item_photos')
      .delete()
      .eq('id', photo.id)

    loadPhotos()
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center">
      <div className="bg-white p-6 rounded-xl w-[800px] max-h-[90vh] overflow-y-auto space-y-4">
        <h2 className="text-xl font-semibold">
          Photo Gallery — {item.name}
        </h2>

        <input
          type="file"
          multiple
          accept="image/*"
          onChange={(e) => {
            if (e.target.files) uploadPhotos(e.target.files)
          }}
        />

        <div className="grid grid-cols-4 gap-4 mt-4">
          {photos.map(photo => (
            <div key={photo.id} className="relative group">
              <img
                src={photo.photo_url}
                className="w-full h-32 object-cover rounded"
              />

              {photo.is_primary && (
                <div className="absolute top-2 left-2 bg-indigo-600 text-white text-xs px-2 py-1 rounded">
                  Primary
                </div>
              )}

              <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition flex flex-col items-center justify-center gap-2">
                <button
                  onClick={() => setPrimary(photo)}
                  className="bg-white text-xs px-2 py-1 rounded"
                >
                  Set Primary
                </button>
                <button
                  onClick={() => deletePhoto(photo)}
                  className="bg-red-600 text-white text-xs px-2 py-1 rounded"
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>

        <div className="flex justify-end">
          <button
            onClick={onClose}
            className="bg-indigo-600 text-white px-4 py-2 rounded"
          >
            Close
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
'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabaseBrowser } from '@/lib/supabase-browser'
import EditItemModal, {
  InventoryItem
} from '@/components/inventory/EditItemModal'

type LocationRow = {
  id: string
  name: string
  parent_id: string | null
}

export default function InventoryPage() {
  const supabase = supabaseBrowser()
  const router = useRouter()
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const [property, setProperty] = useState<any>(null)
  const [locations, setLocations] = useState<LocationRow[]>([])
  const [items, setItems] = useState<InventoryItem[]>([])
  const [selectedLocations, setSelectedLocations] = useState<string[]>([])
  const [editingItem, setEditingItem] = useState<InventoryItem | null>(null)
  const [photoTarget, setPhotoTarget] = useState<InventoryItem | null>(null)
  const [selectedItems, setSelectedItems] = useState<string[]>([])

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
        .select('*')
        .eq('property_id', prop.id)

      const { data: its } = await supabase
        .from('items')
        .select('*')
        .eq('property_id', prop.id)

      setLocations(locs ?? [])
      setItems(its ?? [])
    }

    init()
  }, [])

  const selectableLocations = useMemo(
    () => locations.filter(l => l.parent_id !== null),
    [locations]
  )

  const locationStats = useMemo(() => {
    const stats: Record<
      string,
      { count: number; total: number }
    > = {}

    for (const item of items) {
      if (!item.location_id) continue

      if (!stats[item.location_id]) {
        stats[item.location_id] = { count: 0, total: 0 }
      }

      stats[item.location_id].count += 1
      stats[item.location_id].total += item.price ?? 0
    }

    return stats
  }, [items])

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

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this item?')) return

    await supabase.from('items').delete().eq('id', id)
    setItems(prev => prev.filter(i => i.id !== id))
  }

  const handlePhotoUpload = async (files: FileList) => {
    if (!photoTarget) return

    const uploadedUrls: string[] = []

    for (const file of Array.from(files)) {
      const filePath = `${photoTarget.id}/${Date.now()}-${file.name}`

      const { error } = await supabase.storage
        .from('item-photos')
        .upload(filePath, file)

      if (error) return alert(error.message)

      const { data } = supabase.storage
        .from('item-photos')
        .getPublicUrl(filePath)

      uploadedUrls.push(data.publicUrl)
    }

    const updatedPhotos = [
      ...(photoTarget.photos || []),
      ...uploadedUrls
    ]

    await supabase
      .from('items')
      .update({ photos: updatedPhotos })
      .eq('id', photoTarget.id)

    setItems(prev =>
      prev.map(i =>
        i.id === photoTarget.id
          ? { ...i, photos: updatedPhotos }
          : i
      )
    )

    setPhotoTarget(null)
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
        <h1 className="text-2xl font-bold mb-4">
          Inventory
        </h1>

        <div className="flex gap-3 flex-wrap">
          {selectableLocations.map(loc => {
            const stat = locationStats[loc.id]

            return (
              <button
                key={loc.id}
                onClick={() => toggleLocation(loc.id)}
                className={`px-4 py-2 rounded-lg border flex flex-col items-start ${
                  selectedLocations.includes(loc.id)
                    ? 'bg-indigo-600 text-white'
                    : 'bg-white'
                }`}
              >
                <span className="font-semibold">
                  {loc.name}
                </span>

                <span className="text-xs opacity-80">
                  {stat?.count ?? 0} items
                </span>

                <span className="text-xs opacity-80">
                  ${stat?.total.toFixed(2) ?? '0.00'}
                </span>
              </button>
            )
          })}
        </div>
      </div>

      <div className="space-y-4">
        {filteredItems.map(item => (
          <div
            key={item.id}
            className="bg-white rounded-xl shadow-md p-4 flex gap-4"
          >
            <div
              className="w-24 h-24 border rounded bg-slate-100 cursor-pointer"
              onClick={() => {
                setPhotoTarget(item)
                fileInputRef.current?.click()
              }}
            >
              {item.photos?.length ? (
                <img
                  src={item.photos[0]}
                  className="w-full h-full object-cover"
                />
              ) : (
                <img
                  src="/no-image.jpg"
                  className="w-full h-full object-contain p-4 opacity-60"
                />
              )}
            </div>

            <div
              className="flex-1 cursor-pointer"
              onClick={() => setEditingItem(item)}
            >
              <div className="font-semibold">
                {item.name}
              </div>
              <div>${item.price ?? 0}</div>
              <div className="text-sm text-slate-500">
                {item.vendor}
              </div>
            </div>

            <button
              onClick={() => handleDelete(item.id)}
              className="text-red-600 font-semibold"
            >
              Delete
            </button>
          </div>
        ))}
      </div>

      {editingItem && (
        <EditItemModal
          item={editingItem}
          onClose={() => setEditingItem(null)}
          onUpdated={(updated) => {
            setItems(prev =>
              prev.map(i =>
                i.id === updated.id ? updated : i
              )
            )
          }}
        />
      )}

    </main>
  )
}
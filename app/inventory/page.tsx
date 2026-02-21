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

export default function InventoryPage() {
  const supabase = supabaseBrowser()
  const router = useRouter()

  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const [activePhotoItem, setActivePhotoItem] = useState<InventoryItem | null>(null)

  const [property, setProperty] = useState<any>(null)
  const [locations, setLocations] = useState<LocationRow[]>([])
  const [items, setItems] = useState<InventoryItem[]>([])
  const [selectedLocations, setSelectedLocations] = useState<string[]>([])
  const [editingItem, setEditingItem] = useState<InventoryItem | null>(null)

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
        .from('inventory_items')
        .select('*')
        .eq('property_id', prop.id)

      setLocations(locs ?? [])
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

  const handlePhotoUpload = async (files: FileList) => {
    if (!activePhotoItem) return

    const uploadedUrls: string[] = []

    for (let file of Array.from(files)) {
      const filePath = `${activePhotoItem.id}/${Date.now()}-${file.name}`

      const { error } = await supabase.storage
        .from('item-photos')
        .upload(filePath, file)

      if (!error) {
        const { data } = supabase.storage
          .from('item-photos')
          .getPublicUrl(filePath)

        uploadedUrls.push(data.publicUrl)
      }
    }

    if (uploadedUrls.length > 0) {
      const updatedPhotos = [
        ...(activePhotoItem.photos || []),
        ...uploadedUrls
      ]

      await supabase
        .from('inventory_items')
        .update({ photos: updatedPhotos })
        .eq('id', activePhotoItem.id)

      setItems(prev =>
        prev.map(i =>
          i.id === activePhotoItem.id
            ? { ...i, photos: updatedPhotos }
            : i
        )
      )
    }

    setActivePhotoItem(null)
  }

  if (!property) return <div className="p-8">Loading...</div>

  return (
    <main className="min-h-screen bg-slate-100 p-8">

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
              {item.photos && item.photos.length > 0 ? (
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

            <div className="flex-1">
              <div className="text-lg font-semibold">{item.name}</div>
              <div className="text-sm text-slate-600">
                ${item.price ?? 0}
              </div>
              <div className="text-sm text-slate-500">
                {item.vendor ?? ''}
              </div>
            </div>
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
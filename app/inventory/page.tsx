'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import imageCompression from 'browser-image-compression'
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
  const [uploadingId, setUploadingId] = useState<string | null>(null)

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

  // ===== IMAGE UPLOAD (DRAG + CLICK + COMPRESSION) =====

  const handleUpload = async (
    itemId: string,
    file: File
  ) => {
    try {
      setUploadingId(itemId)

      // compress before upload
      const compressedFile = await imageCompression(file, {
        maxSizeMB: 1,
        maxWidthOrHeight: 1200,
        useWebWorker: true,
      })

      const filePath = `${itemId}-${Date.now()}.jpg`

      const { error: uploadError } = await supabase.storage
        .from('item-photos')
        .upload(filePath, compressedFile, {
          contentType: 'image/jpeg',
        })

      if (uploadError) throw uploadError

      const { data } = supabase.storage
        .from('item-photos')
        .getPublicUrl(filePath)

      await supabase
        .from('items')
        .update({ photo_url: data.publicUrl })
        .eq('id', itemId)

      setItems(prev =>
        prev.map(i =>
          i.id === itemId
            ? { ...i, photo_url: data.publicUrl }
            : i
        )
      )
    } catch (err) {
      alert('Upload failed.')
    } finally {
      setUploadingId(null)
    }
  }

  const handleDrop = (
    e: React.DragEvent,
    itemId: string
  ) => {
    e.preventDefault()
    if (e.dataTransfer.files.length > 0) {
      handleUpload(itemId, e.dataTransfer.files[0])
    }
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
        <div className="grid gap-6 md:grid-cols-3">
          {filteredItems.map(item => (
            <div
              key={item.id}
              className="bg-white rounded-xl shadow-md p-4"
            >
              <div
                className="relative w-full h-48 rounded-lg overflow-hidden border bg-slate-100 cursor-pointer group transition-all duration-200 hover:shadow-lg"
                onDragOver={e => e.preventDefault()}
                onDrop={e => handleDrop(e, item.id)}
                onClick={() =>
                  document
                    .getElementById(`file-${item.id}`)
                    ?.click()
                }
              >
                {item.photo_url ? (
                  <img
                    src={item.photo_url}
                    className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                  />
                ) : (
                  <img
                    src="/no-image.jpg"
                    className="w-full h-full object-contain p-6 opacity-50"
                  />
                )}

                {/* Hover Overlay */}
                <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-40 transition duration-200 flex items-center justify-center">
                  <span className="text-white opacity-0 group-hover:opacity-100 transition text-sm font-medium">
                    Click or Drop Photo
                  </span>
                </div>

                {/* Camera Badge */}
                <div className="absolute top-2 right-2 bg-indigo-600 text-white text-xs px-2 py-1 rounded-full shadow">
                  📷
                </div>

                {uploadingId === item.id && (
                  <div className="absolute inset-0 bg-white bg-opacity-70 flex items-center justify-center text-sm font-medium">
                    Uploading...
                  </div>
                )}
              </div>

              <input
                id={`file-${item.id}`}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={e => {
                  if (e.target.files?.[0]) {
                    handleUpload(
                      item.id,
                      e.target.files[0]
                    )
                  }
                }}
              />

              <div className="mt-3 font-semibold">
                {item.name}
              </div>
              <div className="text-sm text-slate-600">
                {item.category}
              </div>
            </div>
          ))}
        </div>
      )}
    </main>
  )
}

function TopNav() {
  return (
    <div className="flex gap-4 mb-6">
      <Link href="/dashboard">Locations</Link>
      <Link
        href="/inventory"
        className="font-semibold"
      >
        Inventory
      </Link>
      <Link href="/analytics">Analytics</Link>
      <Link href="/settings">Settings</Link>
    </div>
  )
}
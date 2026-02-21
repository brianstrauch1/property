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

type CategoryRow = {
  id: string
  name: string
}

type ItemRow = {
  id: string
  property_id: string
  location_id: string | null
  name: string
  category_id: string | null
  purchase_price: number | null
  vendor: string | null
  notes: string | null
  photo_url: string | null
}

export default function InventoryPage() {
  const supabase = supabaseBrowser()
  const router = useRouter()

  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const [property, setProperty] = useState<any>(null)
  const [locations, setLocations] = useState<LocationRow[]>([])
  const [categories, setCategories] = useState<CategoryRow[]>([])
  const [items, setItems] = useState<ItemRow[]>([])
  const [selectedLocations, setSelectedLocations] = useState<string[]>([])
  const [editingItem, setEditingItem] = useState<ItemRow | null>(null)
  const [activePhotoItem, setActivePhotoItem] = useState<ItemRow | null>(null)

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

      const { data: cats } = await supabase
        .from('categories')
        .select('*')
        .eq('property_id', prop.id)

      const { data: its } = await supabase
        .from('items')
        .select('*')
        .eq('property_id', prop.id)

      setLocations(locs ?? [])
      setCategories(cats ?? [])
      setItems(its ?? [])
    }

    init()
  }, [])

  const handlePhotoUpload = async (files: FileList) => {
    if (!activePhotoItem) return

    for (let file of Array.from(files)) {
      const filePath = `${activePhotoItem.id}/${Date.now()}-${file.name}`

      const { error: uploadError } = await supabase.storage
        .from('item-photos')
        .upload(filePath, file)

      if (uploadError) {
        alert(uploadError.message)
        return
      }

      const { data } = supabase.storage
        .from('item-photos')
        .getPublicUrl(filePath)

      await supabase
        .from('items')
        .update({ photo_url: data.publicUrl })
        .eq('id', activePhotoItem.id)

      setItems(prev =>
        prev.map(i =>
          i.id === activePhotoItem.id
            ? { ...i, photo_url: data.publicUrl }
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

      {items.map(item => (
        <div
          key={item.id}
          className="bg-white p-4 rounded-xl shadow-md flex gap-4"
        >
          <div
            className="w-24 h-24 border rounded cursor-pointer"
            onClick={() => {
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

          <div>
            <div className="font-semibold">{item.name}</div>
            <div className="text-sm text-slate-500">
              Category:{' '}
              {
                categories.find(
                  c => c.id === item.category_id
                )?.name ?? '—'
              }
            </div>
          </div>
        </div>
      ))}
    </main>
  )
}
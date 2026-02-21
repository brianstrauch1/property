'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabaseBrowser } from '@/lib/supabase-browser'

type LocationRow = {
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
}

export default function InventoryPage() {
  const supabase = supabaseBrowser()
  const router = useRouter()

  const [property, setProperty] = useState<any>(null)
  const [locations, setLocations] = useState<LocationRow[]>([])
  const [items, setItems] = useState<ItemRow[]>([])
  const [editingItem, setEditingItem] = useState<ItemRow | null>(null)

  const [search, setSearch] = useState('')

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
        .select('id,name')
        .eq('property_id', prop.id)

      setLocations(locs ?? [])

      const { data: its } = await supabase
        .from('items')
        .select('*')
        .eq('property_id', prop.id)
        .order('created_at', { ascending: false })

      setItems(its ?? [])
    }

    init()
  }, [])

  const filteredItems = useMemo(() => {
    return items.filter(item =>
      item.name.toLowerCase().includes(search.toLowerCase())
    )
  }, [items, search])

  const uploadPhoto = async (file: File, itemId: string) => {
    if (!property) return null

    const filePath = `${property.id}/${itemId}/${Date.now()}_${file.name}`

    const { error } = await supabase.storage
      .from('property-files')
      .upload(filePath, file)

    if (error) {
      alert(error.message)
      return null
    }

    const { data } = supabase.storage
      .from('property-files')
      .getPublicUrl(filePath)

    return data.publicUrl
  }

  const saveItem = async () => {
    if (!editingItem) return

    const { error } = await supabase
      .from('items')
      .update(editingItem)
      .eq('id', editingItem.id)

    if (error) {
      alert(error.message)
      return
    }

    setItems(prev =>
      prev.map(i => (i.id === editingItem.id ? editingItem : i))
    )

    setEditingItem(null)
  }

  if (!property) return <div className="p-8">Loading...</div>

  return (
    <main className="min-h-screen bg-slate-100 p-8">
      <TopNav />

      <div className="bg-white p-6 rounded-xl shadow-md mb-6">
        <h1 className="text-2xl font-bold">Inventory</h1>
      </div>

      <div className="bg-white p-6 rounded-xl shadow-md">

        <input
          className="border p-2 rounded w-full mb-4"
          placeholder="Search items..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />

        <div className="space-y-3">
          {filteredItems.map(item => (
            <div key={item.id} className="border rounded p-3 flex justify-between">
              <div className="flex gap-4">
                {item.photo_url && (
                  <img
                    src={item.photo_url}
                    className="w-16 h-16 object-cover rounded"
                  />
                )}
                <div>
                  <div className="font-semibold">{item.name}</div>
                  <div className="text-sm text-slate-600">
                    Qty: {item.quantity}
                    {item.purchase_price && ` • $${item.purchase_price}`}
                  </div>
                </div>
              </div>

              <button
                onClick={() => setEditingItem(item)}
                className="text-indigo-600 text-sm"
              >
                Edit
              </button>
            </div>
          ))}
        </div>
      </div>

      {editingItem && (
        <EditModal
          item={editingItem}
          setItem={setEditingItem}
          save={saveItem}
          uploadPhoto={uploadPhoto}
          cancel={() => setEditingItem(null)}
        />
      )}
    </main>
  )
}

function EditModal({ item, setItem, save, cancel, uploadPhoto }: any) {

  const handleFile = async (e: any) => {
    const file = e.target.files[0]
    if (!file) return

    const url = await uploadPhoto(file, item.id)
    if (!url) return

    setItem({ ...item, photo_url: url })
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center">
      <div className="bg-white p-6 rounded-xl w-[500px] space-y-3">
        <h2 className="text-xl font-semibold">Edit Item</h2>

        <input
          className="border p-2 rounded w-full"
          value={item.name}
          onChange={e => setItem({ ...item, name: e.target.value })}
        />

        <input
          type="file"
          onChange={handleFile}
          className="w-full"
        />

        {item.photo_url && (
          <img
            src={item.photo_url}
            className="w-32 h-32 object-cover rounded"
          />
        )}

        <div className="flex justify-end gap-3">
          <button onClick={cancel} className="text-slate-600">
            Cancel
          </button>
          <button onClick={save} className="bg-indigo-600 text-white px-4 py-2 rounded">
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
      <Link href="/inventory" className="font-semibold">Inventory</Link>
      <Link href="/settings">Settings</Link>
    </div>
  )
}
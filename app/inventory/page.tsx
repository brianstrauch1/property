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
  const [creating, setCreating] = useState(false)

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

  const createItem = async (item: Partial<ItemRow>) => {
    if (!property || !item.name) return

    const { data, error } = await supabase
      .from('items')
      .insert([
        {
          property_id: property.id,
          location_id: item.location_id ?? null,
          name: item.name,
          category: item.category ?? null,
          quantity: item.quantity ?? 1,
          purchase_price: item.purchase_price ?? null,
          vendor: item.vendor ?? null,
          notes: item.notes ?? null,
          photo_url: null
        }
      ])
      .select()
      .single()

    if (error) {
      alert(error.message)
      return
    }

    setItems(prev => [data as ItemRow, ...prev])
    setCreating(false)
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

      <div className="bg-white p-6 rounded-xl shadow-md mb-6 flex justify-between items-center">
        <h1 className="text-2xl font-bold">Inventory</h1>
        <button
          onClick={() => setCreating(true)}
          className="bg-indigo-600 text-white px-4 py-2 rounded"
        >
          + Add Item
        </button>
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

      {creating && (
        <CreateModal
          locations={locations}
          createItem={createItem}
          cancel={() => setCreating(false)}
        />
      )}

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

function CreateModal({ createItem, cancel, locations }: any) {
  const [form, setForm] = useState({
    name: '',
    category: '',
    quantity: 1,
    location_id: ''
  })

  return (
    <Modal>
      <h2 className="text-xl font-semibold mb-4">Add Item</h2>

      <input
        className="border p-2 rounded w-full mb-2"
        placeholder="Name"
        value={form.name}
        onChange={e => setForm({ ...form, name: e.target.value })}
      />

      <input
        className="border p-2 rounded w-full mb-2"
        placeholder="Category"
        value={form.category}
        onChange={e => setForm({ ...form, category: e.target.value })}
      />

      <input
        type="number"
        className="border p-2 rounded w-full mb-2"
        value={form.quantity}
        onChange={e =>
          setForm({ ...form, quantity: parseInt(e.target.value) })
        }
      />

      <select
        className="border p-2 rounded w-full mb-4"
        value={form.location_id}
        onChange={e =>
          setForm({ ...form, location_id: e.target.value })
        }
      >
        <option value="">No Location</option>
        {locations.map((l: any) => (
          <option key={l.id} value={l.id}>{l.name}</option>
        ))}
      </select>

      <div className="flex justify-end gap-3">
        <button onClick={cancel}>Cancel</button>
        <button
          onClick={() => createItem(form)}
          className="bg-indigo-600 text-white px-4 py-2 rounded"
        >
          Create
        </button>
      </div>
    </Modal>
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
    <Modal>
      <h2 className="text-xl font-semibold mb-4">Edit Item</h2>

      <input
        className="border p-2 rounded w-full mb-2"
        value={item.name}
        onChange={e => setItem({ ...item, name: e.target.value })}
      />

      <input type="file" onChange={handleFile} className="mb-2" />

      {item.photo_url && (
        <img
          src={item.photo_url}
          className="w-32 h-32 object-cover rounded mb-2"
        />
      )}

      <div className="flex justify-end gap-3">
        <button onClick={cancel}>Cancel</button>
        <button
          onClick={save}
          className="bg-indigo-600 text-white px-4 py-2 rounded"
        >
          Save
        </button>
      </div>
    </Modal>
  )
}

function Modal({ children }: any) {
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center">
      <div className="bg-white p-6 rounded-xl w-[500px]">
        {children}
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
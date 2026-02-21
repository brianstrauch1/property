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
}

export default function InventoryPage() {
  const supabase = supabaseBrowser()
  const router = useRouter()

  const [property, setProperty] = useState<any>(null)
  const [locations, setLocations] = useState<LocationRow[]>([])
  const [categories, setCategories] = useState<CategoryRow[]>([])
  const [items, setItems] = useState<ItemRow[]>([])
  const [editingItem, setEditingItem] = useState<ItemRow | null>(null)
  const [creating, setCreating] = useState(false)

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
        .order('created_at', { ascending: false })

      setItems(its ?? [])
    }

    init()
  }, [])

  const validLocations = useMemo(() => {
    return locations.filter(l => l.parent_id !== null)
  }, [locations])

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
    if (!property) return

    if (!item.location_id) {
      alert('Inventory cannot be added at the root level.')
      return
    }

    if (!item.category) {
      alert('Please select a valid category from Settings.')
      return
    }

    const { data, error } = await supabase
      .from('items')
      .insert([
        {
          property_id: property.id,
          location_id: item.location_id,
          name: item.name,
          category: item.category,
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

    if (!editingItem.category) {
      alert('Category must exist in Settings.')
      return
    }

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

      <div className="bg-white p-6 rounded-xl shadow-md mb-6 flex justify-between">
        <h1 className="text-2xl font-bold">Inventory</h1>
        <button
          onClick={() => setCreating(true)}
          className="bg-indigo-600 text-white px-4 py-2 rounded"
        >
          + Add Item
        </button>
      </div>

      <div className="bg-white p-6 rounded-xl shadow-md space-y-3">
        {items.map(item => (
          <div key={item.id} className="border rounded p-3 flex justify-between">
            <div>
              <div className="font-semibold">{item.name}</div>
              <div className="text-sm text-slate-600">
                Qty: {item.quantity}
                {item.category && ` • ${item.category}`}
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

      {creating && (
        <ItemModal
          categories={categories}
          locations={validLocations}
          createItem={createItem}
          cancel={() => setCreating(false)}
        />
      )}

      {editingItem && (
        <ItemModal
          item={editingItem}
          categories={categories}
          locations={validLocations}
          saveItem={saveItem}
          uploadPhoto={uploadPhoto}
          cancel={() => setEditingItem(null)}
        />
      )}
    </main>
  )
}

function ItemModal(props: any) {
  const isEdit = !!props.item

  const [form, setForm] = useState(
    props.item ?? {
      name: '',
      category: '',
      quantity: 1,
      location_id: '',
      purchase_price: '',
      vendor: '',
      notes: ''
    }
  )

  const handleFile = async (e: any) => {
    const file = e.target.files[0]
    if (!file || !props.uploadPhoto) return
    const url = await props.uploadPhoto(file, form.id)
    setForm({ ...form, photo_url: url })
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center">
      <div className="bg-white p-6 rounded-xl w-[550px] space-y-3">

        <h2 className="text-xl font-semibold">
          {isEdit ? 'Edit Item' : 'Add Item'}
        </h2>

        <input
          className="border p-2 rounded w-full"
          value={form.name}
          onChange={e => setForm({ ...form, name: e.target.value })}
          placeholder="Name"
        />

        <select
          className="border p-2 rounded w-full"
          value={form.category ?? ''}
          onChange={e => setForm({ ...form, category: e.target.value })}
        >
          <option value="">Select Category</option>
          {props.categories.map((c: any) => (
            <option key={c.id} value={c.name}>{c.name}</option>
          ))}
        </select>

        <input
          type="number"
          className="border p-2 rounded w-full"
          value={form.quantity}
          onChange={e =>
            setForm({ ...form, quantity: parseInt(e.target.value) })
          }
        />

        <select
          className="border p-2 rounded w-full"
          value={form.location_id ?? ''}
          onChange={e =>
            setForm({ ...form, location_id: e.target.value })
          }
        >
          <option value="">Select Location</option>
          {props.locations.map((l: any) => (
            <option key={l.id} value={l.id}>{l.name}</option>
          ))}
        </select>

        <input
          type="number"
          className="border p-2 rounded w-full"
          value={form.purchase_price ?? ''}
          onChange={e =>
            setForm({
              ...form,
              purchase_price: e.target.value
                ? parseFloat(e.target.value)
                : null
            })
          }
          placeholder="Purchase Price"
        />

        <input
          className="border p-2 rounded w-full"
          value={form.vendor ?? ''}
          onChange={e => setForm({ ...form, vendor: e.target.value })}
          placeholder="Vendor"
        />

        <textarea
          className="border p-2 rounded w-full"
          value={form.notes ?? ''}
          onChange={e => setForm({ ...form, notes: e.target.value })}
          placeholder="Notes"
        />

        {isEdit && (
          <>
            <input type="file" onChange={handleFile} />
            {form.photo_url && (
              <img
                src={form.photo_url}
                className="w-32 h-32 object-cover rounded"
              />
            )}
          </>
        )}

        <div className="flex justify-end gap-3">
          <button onClick={props.cancel}>Cancel</button>

          {isEdit ? (
            <button
              onClick={() => props.saveItem(form)}
              className="bg-indigo-600 text-white px-4 py-2 rounded"
            >
              Save
            </button>
          ) : (
            <button
              onClick={() => props.createItem(form)}
              className="bg-indigo-600 text-white px-4 py-2 rounded"
            >
              Create
            </button>
          )}
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
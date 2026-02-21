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
}

export default function InventoryPage() {
  const supabase = supabaseBrowser()
  const router = useRouter()

  const [property, setProperty] = useState<any>(null)
  const [locations, setLocations] = useState<LocationRow[]>([])
  const [items, setItems] = useState<ItemRow[]>([])
  const [editingItem, setEditingItem] = useState<ItemRow | null>(null)

  const [filter, setFilter] = useState('')
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
    return items.filter(item => {
      const matchesLocation = !filter || item.location_id === filter
      const matchesSearch =
        !search ||
        item.name.toLowerCase().includes(search.toLowerCase()) ||
        (item.category?.toLowerCase().includes(search.toLowerCase()) ?? false)

      return matchesLocation && matchesSearch
    })
  }, [items, filter, search])

  const deleteItem = async (id: string) => {
    if (!confirm('Delete item?')) return
    await supabase.from('items').delete().eq('id', id)
    setItems(prev => prev.filter(i => i.id !== id))
  }

  const saveItem = async () => {
    if (!editingItem) return

    const { error } = await supabase
      .from('items')
      .update({
        name: editingItem.name,
        category: editingItem.category,
        quantity: editingItem.quantity,
        purchase_price: editingItem.purchase_price,
        vendor: editingItem.vendor,
        notes: editingItem.notes,
        location_id: editingItem.location_id
      })
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

        <div className="flex gap-4 mb-4">
          <input
            className="border p-2 rounded w-full"
            placeholder="Search items..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />

          <select
            className="border p-2 rounded"
            value={filter}
            onChange={e => setFilter(e.target.value)}
          >
            <option value="">All Locations</option>
            {locations.map(l => (
              <option key={l.id} value={l.id}>{l.name}</option>
            ))}
          </select>
        </div>

        <div className="space-y-2">
          {filteredItems.map(item => (
            <div key={item.id} className="border rounded p-3 flex justify-between">
              <div>
                <div className="font-semibold">{item.name}</div>
                <div className="text-sm text-slate-600">
                  Qty: {item.quantity}
                  {item.category && ` • ${item.category}`}
                  {item.purchase_price && ` • $${item.purchase_price}`}
                </div>
              </div>

              <div className="flex gap-3 text-sm">
                <button
                  onClick={() => setEditingItem(item)}
                  className="text-indigo-600"
                >
                  Edit
                </button>

                <button
                  onClick={() => deleteItem(item.id)}
                  className="text-red-600"
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {editingItem && (
        <EditModal
          item={editingItem}
          setItem={setEditingItem}
          save={saveItem}
          cancel={() => setEditingItem(null)}
          locations={locations}
        />
      )}
    </main>
  )
}

function EditModal({ item, setItem, save, cancel, locations }: any) {
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
          className="border p-2 rounded w-full"
          value={item.category ?? ''}
          onChange={e => setItem({ ...item, category: e.target.value })}
        />

        <input
          type="number"
          className="border p-2 rounded w-full"
          value={item.quantity}
          onChange={e => setItem({ ...item, quantity: parseInt(e.target.value) })}
        />

        <input
          type="number"
          className="border p-2 rounded w-full"
          value={item.purchase_price ?? ''}
          onChange={e =>
            setItem({
              ...item,
              purchase_price: e.target.value ? parseFloat(e.target.value) : null
            })
          }
        />

        <select
          className="border p-2 rounded w-full"
          value={item.location_id ?? ''}
          onChange={e =>
            setItem({
              ...item,
              location_id: e.target.value || null
            })
          }
        >
          <option value="">No Location</option>
          {locations.map((l: any) => (
            <option key={l.id} value={l.id}>{l.name}</option>
          ))}
        </select>

        <textarea
          className="border p-2 rounded w-full"
          value={item.notes ?? ''}
          onChange={e => setItem({ ...item, notes: e.target.value })}
        />

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
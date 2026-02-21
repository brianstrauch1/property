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

  const [filterLocationId, setFilterLocationId] = useState<string>('')

  const [name, setName] = useState('')
  const [category, setCategory] = useState('')
  const [quantity, setQuantity] = useState(1)
  const [locationId, setLocationId] = useState('')
  const [purchasePrice, setPurchasePrice] = useState('')
  const [vendor, setVendor] = useState('')
  const [notes, setNotes] = useState('')

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

      setLocations((locs ?? []) as LocationRow[])

      const { data: its } = await supabase
        .from('items')
        .select('*')
        .eq('property_id', prop.id)
        .order('created_at', { ascending: false })

      setItems((its ?? []) as ItemRow[])
    }

    init()
  }, [])

  const locationNameMap = useMemo(() => {
    const map = new Map<string, string>()
    locations.forEach(l => map.set(l.id, l.name))
    return map
  }, [locations])

  const filteredItems = useMemo(() => {
    if (!filterLocationId) return items
    return items.filter(i => i.location_id === filterLocationId)
  }, [items, filterLocationId])

  const createItem = async () => {
    if (!property || !name.trim()) return

    const { data, error } = await supabase
      .from('items')
      .insert([
        {
          property_id: property.id,
          location_id: locationId || null,
          name: name.trim(),
          category: category.trim() || null,
          quantity,
          purchase_price: purchasePrice ? parseFloat(purchasePrice) : null,
          vendor: vendor.trim() || null,
          notes: notes.trim() || null
        }
      ])
      .select()
      .single()

    if (error) {
      alert(error.message)
      return
    }

    setItems(prev => [data as ItemRow, ...prev])

    setName('')
    setCategory('')
    setQuantity(1)
    setLocationId('')
    setPurchasePrice('')
    setVendor('')
    setNotes('')
  }

  const deleteItem = async (id: string) => {
    const ok = confirm('Delete this item?')
    if (!ok) return

    await supabase.from('items').delete().eq('id', id)
    setItems(prev => prev.filter(i => i.id !== id))
  }

  if (!property) return <div className="p-8">Loading...</div>

  return (
    <main className="min-h-screen bg-slate-100 p-8">
      <TopNav />

      <div className="bg-white p-6 rounded-xl shadow-md mb-6">
        <h1 className="text-2xl font-bold">Inventory</h1>
        <p className="text-slate-600">{property.name}</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">

        {/* Create Item */}
        <div className="bg-white p-6 rounded-xl shadow-md">
          <h2 className="text-xl font-semibold mb-4">Add Item</h2>

          <div className="space-y-3">

            <input
              className="border p-2 rounded w-full"
              placeholder="Item Name"
              value={name}
              onChange={e => setName(e.target.value)}
            />

            <input
              className="border p-2 rounded w-full"
              placeholder="Category"
              value={category}
              onChange={e => setCategory(e.target.value)}
            />

            <div className="flex gap-2">
              <input
                type="number"
                min={1}
                className="border p-2 rounded w-24"
                value={quantity}
                onChange={e => setQuantity(parseInt(e.target.value))}
              />

              <select
                className="border p-2 rounded w-full"
                value={locationId}
                onChange={e => setLocationId(e.target.value)}
              >
                <option value="">No Location</option>
                {locations.map(l => (
                  <option key={l.id} value={l.id}>{l.name}</option>
                ))}
              </select>
            </div>

            <input
              type="number"
              step="0.01"
              className="border p-2 rounded w-full"
              placeholder="Purchase Price"
              value={purchasePrice}
              onChange={e => setPurchasePrice(e.target.value)}
            />

            <input
              className="border p-2 rounded w-full"
              placeholder="Vendor"
              value={vendor}
              onChange={e => setVendor(e.target.value)}
            />

            <textarea
              className="border p-2 rounded w-full"
              placeholder="Notes"
              value={notes}
              onChange={e => setNotes(e.target.value)}
            />

            <button
              onClick={createItem}
              className="bg-indigo-600 text-white px-4 py-2 rounded"
            >
              Add Item
            </button>
          </div>
        </div>

        {/* Item List */}
        <div className="bg-white p-6 rounded-xl shadow-md">
          <div className="flex justify-between mb-4">
            <h2 className="text-xl font-semibold">Items</h2>

            <select
              className="border p-2 rounded"
              value={filterLocationId}
              onChange={e => setFilterLocationId(e.target.value)}
            >
              <option value="">All Locations</option>
              {locations.map(l => (
                <option key={l.id} value={l.id}>{l.name}</option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            {filteredItems.length === 0 && (
              <div className="text-slate-500">No items yet.</div>
            )}

            {filteredItems.map(item => (
              <div key={item.id} className="border rounded p-3 flex justify-between">
                <div>
                  <div className="font-medium">{item.name}</div>
                  <div className="text-sm text-slate-600">
                    Qty: {item.quantity}
                    {item.category && ` • ${item.category}`}
                    {item.location_id && ` • ${locationNameMap.get(item.location_id)}`}
                    {item.purchase_price && ` • $${item.purchase_price}`}
                  </div>
                </div>

                <button
                  onClick={() => deleteItem(item.id)}
                  className="text-red-600 text-sm"
                >
                  Delete
                </button>
              </div>
            ))}
          </div>
        </div>

      </div>
    </main>
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
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
  purchase_price: number | null
  vendor: string | null
  notes: string | null
  photo_url: string | null

  purchase_date: string | null
  warranty_expires_on: string | null
  depreciation_method: string | null
  useful_life_months: number | null
  salvage_value: number | null
}

function safeCsv(v: any) {
  const s = String(v ?? '')
  return `"${s.replace(/"/g, '""')}"`
}

export default function InventoryPage() {
  const supabase = supabaseBrowser()
  const router = useRouter()

  const [property, setProperty] = useState<any>(null)
  const [locations, setLocations] = useState<LocationRow[]>([])
  const [categories, setCategories] = useState<CategoryRow[]>([])
  const [items, setItems] = useState<ItemRow[]>([])
  const [selectedLocations, setSelectedLocations] = useState<string[]>([])
  const [selectedItems, setSelectedItems] = useState<string[]>([])
  const [layout, setLayout] = useState<'grid' | 'table'>('grid')
  const [sortBy, setSortBy] = useState<'name' | 'price' | 'vendor'>('name')
  const [editingItem, setEditingItem] = useState<ItemRow | null>(null)

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

      setItems(its ?? [])
    }

    init()
  }, [])

  const validLocations = useMemo(
    () => locations.filter(l => l.parent_id !== null),
    [locations]
  )

  const locationCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    items.forEach(i => {
      if (!i.location_id) return
      counts[i.location_id] = (counts[i.location_id] ?? 0) + 1
    })
    return counts
  }, [items])

  const toggleLocation = (id: string) => {
    setSelectedLocations(prev =>
      prev.includes(id)
        ? prev.filter(x => x !== id)
        : [...prev, id]
    )
    setSelectedItems([])
  }

  const filteredItems = useMemo(() => {
    if (selectedLocations.length === 0) return []

    let result = items.filter(
      i => i.location_id && selectedLocations.includes(i.location_id)
    )

    result = result.sort((a, b) => {
      if (sortBy === 'name')
        return a.name.localeCompare(b.name)
      if (sortBy === 'vendor')
        return (a.vendor ?? '').localeCompare(b.vendor ?? '')
      if (sortBy === 'price')
        return (a.purchase_price ?? 0) - (b.purchase_price ?? 0)
      return 0
    })

    return result
  }, [items, selectedLocations, sortBy])

  const totalPrice = useMemo(
    () =>
      filteredItems.reduce(
        (sum, item) => sum + (item.purchase_price ?? 0),
        0
      ),
    [filteredItems]
  )

  const toggleItem = (id: string) => {
    setSelectedItems(prev =>
      prev.includes(id)
        ? prev.filter(x => x !== id)
        : [...prev, id]
    )
  }

  const deleteSingle = async (id: string) => {
    if (!confirm('Delete this item?')) return
    await supabase.from('items').delete().eq('id', id)
    setItems(prev => prev.filter(i => i.id !== id))
  }

  const exportCsv = () => {
    if (selectedLocations.length === 0) {
      alert('Select one or more locations first.')
      return
    }

    const headers = [
      'name',
      'category',
      'vendor',
      'purchase_price',
      'purchase_date',
      'warranty_expires_on'
    ]

    const rows = filteredItems.map(i => [
      i.name,
      i.category ?? '',
      i.vendor ?? '',
      i.purchase_price ?? '',
      i.purchase_date ?? '',
      i.warranty_expires_on ?? ''
    ])

    const csv =
      headers.map(safeCsv).join(',') +
      '\n' +
      rows.map(r => r.map(safeCsv).join(',')).join('\n')

    const blob = new Blob([csv], {
      type: 'text/csv;charset=utf-8;'
    })

    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `inventory_${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
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

        <div className="flex flex-wrap gap-2 mb-4">
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
              <span className="ml-2 text-xs bg-slate-200 px-2 py-0.5 rounded">
                {locationCounts[l.id] ?? 0}
              </span>
            </button>
          ))}
        </div>

        {selectedLocations.length > 0 && (
          <div className="flex justify-between items-center">
            <div>
              Total Value: $
              {totalPrice.toFixed(2)}
            </div>

            <div className="flex gap-2">
              <button
                onClick={exportCsv}
                className="border px-3 py-1 rounded bg-white"
              >
                Export CSV
              </button>

              <button
                onClick={() =>
                  setLayout(
                    layout === 'grid'
                      ? 'table'
                      : 'grid'
                  )
                }
                className="border px-3 py-1 rounded bg-white"
              >
                {layout === 'grid'
                  ? 'Table View'
                  : 'Grid View'}
              </button>
            </div>
          </div>
        )}
      </div>

      {selectedLocations.length === 0 ? (
        <div className="text-center text-slate-500">
          Select location(s) to view items.
        </div>
      ) : layout === 'grid' ? (
        <div className="grid gap-4 md:grid-cols-3">
          {filteredItems.map(item => (
            <div
              key={item.id}
              className="bg-white p-4 rounded-xl shadow-md"
            >
              <button
                onClick={() =>
                  setEditingItem(item)
                }
                className="w-20 h-20 rounded overflow-hidden border bg-slate-100 hover:ring-2 hover:ring-indigo-500 transition mb-3"
              >
                {item.photo_url ? (
                  <img
                    src={item.photo_url}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <img
                    src="/no-image.jpg"
                    className="w-full h-full object-contain p-2 opacity-60"
                  />
                )}
              </button>

              <div className="font-semibold">
                {item.name}
              </div>
              <div className="text-sm text-slate-600">
                {item.category}
              </div>

              <div className="flex justify-between mt-3 text-sm">
                <button
                  onClick={() =>
                    deleteSingle(item.id)
                  }
                  className="text-red-600"
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-md">
          <table className="w-full text-sm">
            <thead className="bg-slate-100">
              <tr>
                <th>Name</th>
                <th>Category</th>
                <th>Vendor</th>
                <th>Price</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filteredItems.map(item => (
                <tr
                  key={item.id}
                  className="border-t"
                >
                  <td>{item.name}</td>
                  <td>{item.category}</td>
                  <td>{item.vendor}</td>
                  <td>
                    $
                    {item.purchase_price ?? 0}
                  </td>
                  <td>
                    <button
                      onClick={() =>
                        setEditingItem(item)
                      }
                      className="text-indigo-600"
                    >
                      Edit
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  )
}

function TopNav() {
  return (
    <div className="flex gap-4 mb-6">
      <Link href="/dashboard">
        Locations
      </Link>
      <Link
        href="/inventory"
        className="font-semibold"
      >
        Inventory
      </Link>
      <Link href="/analytics">
        Analytics
      </Link>
      <Link href="/settings">
        Settings
      </Link>
    </div>
  )
}
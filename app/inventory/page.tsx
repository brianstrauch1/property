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

  const [viewMode, setViewMode] = useState<'grid' | 'table'>('grid')
  const [sortBy, setSortBy] = useState<'name' | 'price' | 'vendor'>('name')
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

  const toggleLocation = (id: string) => {
    setSelectedLocations(prev =>
      prev.includes(id)
        ? prev.filter(x => x !== id)
        : [...prev, id]
    )
  }

  const filteredItems = useMemo(() => {
    let result =
      selectedLocations.length === 0
        ? []
        : items.filter(
            i =>
              i.location_id &&
              selectedLocations.includes(i.location_id)
          )

    result = [...result].sort((a, b) => {
      if (sortBy === 'price')
        return (a.price ?? 0) - (b.price ?? 0)
      return (a[sortBy] ?? '').toString().localeCompare(
        (b[sortBy] ?? '').toString()
      )
    })

    return result
  }, [items, selectedLocations, sortBy])

  const totalValue = useMemo(
    () =>
      filteredItems.reduce(
        (sum, i) => sum + (i.price ?? 0),
        0
      ),
    [filteredItems]
  )

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this item?')) return

    await supabase.from('items').delete().eq('id', id)

    setItems(prev => prev.filter(i => i.id !== id))
  }

  const handleBulkDelete = async () => {
    if (selectedItems.length === 0) return
    if (!confirm('Delete selected items?')) return

    await supabase
      .from('items')
      .delete()
      .in('id', selectedItems)

    setItems(prev =>
      prev.filter(i => !selectedItems.includes(i.id))
    )

    setSelectedItems([])
  }

  const toggleItemSelect = (id: string) => {
    setSelectedItems(prev =>
      prev.includes(id)
        ? prev.filter(x => x !== id)
        : [...prev, id]
    )
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

        <div className="flex gap-2 flex-wrap mb-4">
          {selectableLocations.map(loc => (
            <button
              key={loc.id}
              onClick={() => toggleLocation(loc.id)}
              className={`px-3 py-1 rounded border ${
                selectedLocations.includes(loc.id)
                  ? 'bg-indigo-600 text-white'
                  : 'bg-white'
              }`}
            >
              {loc.name}
            </button>
          ))}
        </div>

        <div className="flex justify-between items-center flex-wrap gap-4">

          <div className="text-lg font-semibold">
            Total: ${totalValue.toFixed(2)}
          </div>

          <div className="flex gap-2">

            <select
              value={sortBy}
              onChange={e =>
                setSortBy(e.target.value as any)
              }
              className="border rounded px-3 py-1"
            >
              <option value="name">Sort: Name</option>
              <option value="price">Sort: Price</option>
              <option value="vendor">Sort: Vendor</option>
            </select>

            <button
              onClick={() =>
                setViewMode(v =>
                  v === 'grid' ? 'table' : 'grid'
                )
              }
              className="border rounded px-3 py-1"
            >
              {viewMode === 'grid'
                ? 'Table View'
                : 'Grid View'}
            </button>

            {selectedItems.length > 0 && (
              <button
                onClick={handleBulkDelete}
                className="bg-red-600 text-white px-3 py-1 rounded"
              >
                Delete Selected
              </button>
            )}

          </div>
        </div>
      </div>

      {viewMode === 'grid' ? (
        <div className="space-y-4">
          {filteredItems.map(item => (
            <div
              key={item.id}
              className="bg-white rounded-xl shadow-md p-4 flex gap-4"
            >
              <input
                type="checkbox"
                checked={selectedItems.includes(item.id)}
                onChange={() =>
                  toggleItemSelect(item.id)
                }
              />

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
                className="text-red-600"
              >
                Delete
              </button>
            </div>
          ))}
        </div>
      ) : (
        <table className="w-full bg-white rounded-xl shadow-md">
          <thead>
            <tr className="border-b">
              <th></th>
              <th>Name</th>
              <th>Price</th>
              <th>Vendor</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {filteredItems.map(item => (
              <tr key={item.id} className="border-b">
                <td>
                  <input
                    type="checkbox"
                    checked={selectedItems.includes(item.id)}
                    onChange={() =>
                      toggleItemSelect(item.id)
                    }
                  />
                </td>
                <td
                  onClick={() =>
                    setEditingItem(item)
                  }
                  className="cursor-pointer"
                >
                  {item.name}
                </td>
                <td>${item.price ?? 0}</td>
                <td>{item.vendor}</td>
                <td>
                  <button
                    onClick={() =>
                      handleDelete(item.id)
                    }
                    className="text-red-600"
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

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
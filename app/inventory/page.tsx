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

  const [property, setProperty] = useState<any>(null)
  const [locations, setLocations] = useState<LocationRow[]>([])
  const [items, setItems] = useState<InventoryItem[]>([])
  const [selectedLocationIds, setSelectedLocationIds] = useState<string[]>([])
  const [expanded, setExpanded] = useState<string[]>([])
  const [editingItem, setEditingItem] = useState<InventoryItem | null>(null)
  const [photoTarget, setPhotoTarget] = useState<InventoryItem | null>(null)

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

  const childrenMap = useMemo(() => {
    const map: Record<string, LocationRow[]> = {}
    for (const loc of locations) {
      if (!loc.parent_id) continue
      if (!map[loc.parent_id]) map[loc.parent_id] = []
      map[loc.parent_id].push(loc)
    }
    return map
  }, [locations])

  const roots = useMemo(
    () => locations.filter(l => !l.parent_id),
    [locations]
  )

  const descendantsOf = (id: string): string[] => {
    const result: string[] = [id]
    const children = childrenMap[id] || []
    for (const child of children) {
      result.push(...descendantsOf(child.id))
    }
    return result
  }

  const toggleLocation = (id: string) => {
    setSelectedLocationIds(prev => {
      if (prev.includes(id)) {
        return prev.filter(x => x !== id)
      }
      return [...prev, id]
    })
  }

  const toggleExpand = (id: string) => {
    setExpanded(prev =>
      prev.includes(id)
        ? prev.filter(x => x !== id)
        : [...prev, id]
    )
  }

  const selectedSet = useMemo(() => {
    const set = new Set<string>()
    for (const id of selectedLocationIds) {
      descendantsOf(id).forEach(d => set.add(d))
    }
    return set
  }, [selectedLocationIds, childrenMap])

  const filteredItems = useMemo(() => {
    if (selectedLocationIds.length === 0) return []
    return items.filter(
      i => i.location_id && selectedSet.has(i.location_id)
    )
  }, [items, selectedSet])

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this item?')) return
    await supabase.from('items').delete().eq('id', id)
    setItems(prev => prev.filter(i => i.id !== id))
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

  const renderTree = (node: LocationRow, depth = 0) => {
    const hasChildren = childrenMap[node.id]?.length > 0
    const isExpanded = expanded.includes(node.id)

    return (
      <div key={node.id}>
        <div
          style={{ paddingLeft: depth * 20 }}
          className="flex items-center gap-2"
        >
          {hasChildren && (
            <button
              onClick={() => toggleExpand(node.id)}
              className="text-xs"
            >
              {isExpanded ? '▾' : '▸'}
            </button>
          )}

          <input
            type="checkbox"
            checked={selectedLocationIds.includes(node.id)}
            onChange={() => toggleLocation(node.id)}
          />

          <span className="text-sm">{node.name}</span>
        </div>

        {hasChildren &&
          isExpanded &&
          childrenMap[node.id].map(child =>
            renderTree(child, depth + 1)
          )}
      </div>
    )
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

        <div className="space-y-2">
          {roots.map(root => renderTree(root))}
        </div>
      </div>

      {selectedLocationIds.length === 0 ? (
        <div className="text-slate-500">
          Select one or more locations.
        </div>
      ) : (
        <div className="space-y-4">
          {filteredItems.map(item => (
            <div
              key={item.id}
              className="bg-white rounded-xl shadow-md p-4 flex gap-4"
            >
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
          onDeleted={(id) =>
            setItems(prev => prev.filter(i => i.id !== id))
          }
        />
      )}
    </main>
  )
}
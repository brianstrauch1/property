'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabaseBrowser } from '@/lib/supabase-browser'
import EditItemModal, { InventoryItem } from '@/components/inventory/EditItemModal'
import { DndContext, closestCenter, useDraggable, useDroppable } from '@dnd-kit/core'
import { CSS } from '@dnd-kit/utilities'

type LocationRow = {
  id: string
  name: string
  parent_id: string | null
  sort_order?: number | null
}

export default function InventoryPage() {
  const supabase = supabaseBrowser()
  const router = useRouter()
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const [property, setProperty] = useState<any>(null)
  const [locations, setLocations] = useState<LocationRow[]>([])
  const [items, setItems] = useState<InventoryItem[]>([])
  const [selected, setSelected] = useState<string[]>([])
  const [expanded, setExpanded] = useState<string[]>([])
  const [editingItem, setEditingItem] = useState<InventoryItem | null>(null)
  const [photoTarget, setPhotoTarget] = useState<InventoryItem | null>(null)
  const [inventoryCollapsed, setInventoryCollapsed] = useState(false)

  /* ---------------- INIT ---------------- */

  useEffect(() => {
    const init = async () => {
      const { data: userData } = await supabase.auth.getUser()
      if (!userData.user) {
        router.push('/')
        return
      }

      const { data: prop } = await supabase.from('properties').select('*').limit(1).single()
      if (!prop) return
      setProperty(prop)

      const { data: locs } = await supabase
        .from('locations')
        .select('*')
        .eq('property_id', prop.id)
        .order('sort_order')

      const { data: its } = await supabase
        .from('items')
        .select('*')
        .eq('property_id', prop.id)

      setLocations(locs ?? [])
      setItems(its ?? [])

      const savedExpanded = localStorage.getItem('expandedTree')
      if (savedExpanded) setExpanded(JSON.parse(savedExpanded))
    }

    init()
  }, [])

  useEffect(() => {
    localStorage.setItem('expandedTree', JSON.stringify(expanded))
  }, [expanded])

  /* ---------------- TREE MAPS ---------------- */

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
    const result = [id]
    const children = childrenMap[id] || []
    for (const c of children) {
      result.push(...descendantsOf(c.id))
    }
    return result
  }

  /* ---------------- COUNTS ---------------- */

  const countMap = useMemo(() => {
    const counts: Record<string, number> = {}

    for (const item of items) {
      if (!item.location_id) continue
      counts[item.location_id] = (counts[item.location_id] || 0) + 1
    }

    const rollup: Record<string, number> = {}

    const compute = (id: string): number => {
      if (rollup[id] !== undefined) return rollup[id]
      let total = counts[id] || 0
      const children = childrenMap[id] || []
      for (const c of children) total += compute(c.id)
      rollup[id] = total
      return total
    }

    locations.forEach(l => compute(l.id))
    return rollup
  }, [items, locations])

  /* ---------------- SELECTION ---------------- */

  const toggleSelect = (id: string) => {
    const branch = descendantsOf(id)
    const isSelected = selected.includes(id)

    if (isSelected) {
      setSelected(prev => prev.filter(x => !branch.includes(x)))
    } else {
      setSelected(prev => Array.from(new Set([...prev, ...branch])))
    }
  }

  const isIndeterminate = (id: string) => {
    const branch = descendantsOf(id)
    const selectedCount = branch.filter(x => selected.includes(x)).length
    return selectedCount > 0 && selectedCount < branch.length
  }

  const isChecked = (id: string) => selected.includes(id)

  const selectedSet = new Set(selected)

  const filteredItems = items.filter(
    i => i.location_id && selectedSet.has(i.location_id)
  )

  /* ---------------- DRAG & DROP ---------------- */

  async function handleDragEnd(event: any) {
    const { active, over } = event
    if (!over || active.id === over.id) return

    await supabase
      .from('locations')
      .update({ parent_id: over.id })
      .eq('id', active.id)

    const { data } = await supabase.from('locations').select('*')
    setLocations(data ?? [])
  }

  /* ---------------- TREE NODE ---------------- */

  function TreeNode({ node, depth }: { node: LocationRow; depth: number }) {
    const hasChildren = childrenMap[node.id]?.length > 0
    const expandedNode = expanded.includes(node.id)

    const { attributes, listeners, setNodeRef, transform } = useDraggable({
      id: node.id
    })

    const style = transform
      ? { transform: CSS.Translate.toString(transform) }
      : undefined

    return (
      <div ref={setNodeRef} style={style}>
        <div
          className="flex items-center gap-2 py-1 group"
          style={{ paddingLeft: depth * 18 }}
        >
          <div className="w-1 h-6 bg-indigo-400 rounded-full mr-1" />

          {hasChildren && (
            <button
              onClick={() =>
                setExpanded(prev =>
                  prev.includes(node.id)
                    ? prev.filter(x => x !== node.id)
                    : [...prev, node.id]
                )
              }
              className="text-xs text-slate-500"
            >
              {expandedNode ? '▾' : '▸'}
            </button>
          )}

          <input
            type="checkbox"
            checked={isChecked(node.id)}
            ref={el => {
              if (el) el.indeterminate = isIndeterminate(node.id)
            }}
            onChange={() => toggleSelect(node.id)}
          />

          <span className="text-sm font-medium text-slate-700">
            {node.name}
          </span>

          <span className="text-xs bg-slate-200 px-2 py-0.5 rounded-full ml-2">
            {countMap[node.id] || 0}
          </span>

          <div
            {...listeners}
            {...attributes}
            className="ml-auto opacity-0 group-hover:opacity-100 cursor-grab text-slate-400 text-xs"
          >
            ☰
          </div>
        </div>

        {hasChildren && expandedNode &&
          childrenMap[node.id].map(child => (
            <TreeNode key={child.id} node={child} depth={depth + 1} />
          ))}
      </div>
    )
  }

  if (!property) return <div className="p-8">Loading...</div>

  return (
    <main className="min-h-screen bg-slate-100 p-8">

      <DndContext collisionDetection={closestCenter} onDragEnd={handleDragEnd}>

        <div className="bg-white p-6 rounded-xl shadow-md mb-6">
          <h1 className="text-2xl font-bold mb-4">
            Inventory Locations
          </h1>

          {roots.map(root => (
            <TreeNode key={root.id} node={root} depth={0} />
          ))}
        </div>

      </DndContext>

      <div className="mb-4">
        <button
          onClick={() => setInventoryCollapsed(prev => !prev)}
          className="text-sm text-indigo-600"
        >
          {inventoryCollapsed ? 'Show Inventory' : 'Hide Inventory'}
        </button>
      </div>

      {!inventoryCollapsed && (
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
                <div className="font-semibold">{item.name}</div>
                <div className="text-sm text-slate-500">{item.vendor}</div>
              </div>

              <button
                onClick={() =>
                  supabase.from('items').delete().eq('id', item.id)
                }
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
          onUpdated={updated =>
            setItems(prev =>
              prev.map(i =>
                i.id === updated.id ? updated : i
              )
            )
          }
          onDeleted={id =>
            setItems(prev => prev.filter(i => i.id !== id))
          }
        />
      )}
    </main>
  )
}
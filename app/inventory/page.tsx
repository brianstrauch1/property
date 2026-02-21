'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabaseBrowser } from '@/lib/supabase-browser'
import EditItemModal, { InventoryItem } from '@/components/inventory/EditItemModal'
import { DndContext, closestCenter, useDraggable } from '@dnd-kit/core'
import { CSS } from '@dnd-kit/utilities'

type LocationRow = {
  id: string
  name: string
  parent_id: string | null
  sort_order?: number | null
  property_id?: string
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
  const [inventoryCollapsed, setInventoryCollapsed] = useState(false)
  const [editingItem, setEditingItem] = useState<InventoryItem | null>(null)
  const [photoTarget, setPhotoTarget] = useState<InventoryItem | null>(null)
  const [search, setSearch] = useState('')

  /* ---------------- LOAD ---------------- */

  useEffect(() => {
    const init = async () => {
      const { data: sess } = await supabase.auth.getSession()
      if (!sess.session?.access_token) {
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
        .order('sort_order', { ascending: true })

      setLocations(locs ?? [])

      const { data: its } = await supabase
        .from('items')
        .select('*')
        .eq('property_id', prop.id)

      setItems(its ?? [])

      const savedExpanded = localStorage.getItem('expandedTree')
      if (savedExpanded) setExpanded(JSON.parse(savedExpanded))
    }

    init()
  }, [router, supabase])

  useEffect(() => {
    localStorage.setItem('expandedTree', JSON.stringify(expanded))
  }, [expanded])

  /* ---------------- TREE ---------------- */

  const byId = useMemo(() => {
    const m: Record<string, LocationRow> = {}
    for (const l of locations) m[l.id] = l
    return m
  }, [locations])

  const childrenMap = useMemo(() => {
    const map: Record<string, LocationRow[]> = {}
    for (const loc of locations) {
      if (!loc.parent_id) continue
      if (!map[loc.parent_id]) map[loc.parent_id] = []
      map[loc.parent_id].push(loc)
    }
    for (const k of Object.keys(map)) {
      map[k] = map[k].slice().sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
    }
    return map
  }, [locations])

  const roots = useMemo(() => {
    return locations.filter(l => !l.parent_id)
  }, [locations])

  const descendantsOf = (id: string): string[] => {
    const result = [id]
    const children = childrenMap[id] || []
    for (const c of children) result.push(...descendantsOf(c.id))
    return result
  }

  const countMap = useMemo(() => {
    const direct: Record<string, number> = {}
    for (const item of items) {
      if (!item.location_id) continue
      direct[item.location_id] = (direct[item.location_id] || 0) + 1
    }

    const rollup: Record<string, number> = {}
    const compute = (id: string): number => {
      if (rollup[id] !== undefined) return rollup[id]
      let total = direct[id] || 0
      const kids = childrenMap[id] || []
      for (const k of kids) total += compute(k.id)
      rollup[id] = total
      return total
    }

    locations.forEach(l => compute(l.id))
    return rollup
  }, [items, locations, childrenMap])

  const toggleSelectBranch = (id: string) => {
    const branch = descendantsOf(id)
    const isFullySelected = branch.every(x => selected.includes(x))
    if (isFullySelected) {
      setSelected(prev => prev.filter(x => !branch.includes(x)))
    } else {
      setSelected(prev => Array.from(new Set([...prev, ...branch])))
    }
  }

  const isChecked = (id: string) => {
    const branch = descendantsOf(id)
    return branch.every(x => selected.includes(x))
  }

  const selectedSet = useMemo(() => new Set(selected), [selected])

  const filteredItems = useMemo(() => {
    if (selected.length === 0) return []
    return items.filter(i => i.location_id && selectedSet.has(i.location_id))
  }, [items, selectedSet, selected.length])

  /* ---------------- DRAG ---------------- */

  async function handleDragEnd(event: any) {
    const { active, over } = event
    if (!over || active.id === over.id) return

    await supabase
      .from('locations')
      .update({ parent_id: over.id })
      .eq('id', active.id)

    const { data } = await supabase
      .from('locations')
      .select('*')
      .eq('property_id', property.id)
      .order('sort_order', { ascending: true })

    setLocations(data ?? [])
  }

  /* ---------------- UI ---------------- */

  function TreeNode({ node, depth }: { node: LocationRow; depth: number }) {
    const children = childrenMap[node.id] || []
    const hasChildren = children.length > 0
    const isOpen = expanded.includes(node.id)

    const { attributes, listeners, setNodeRef, transform } = useDraggable({ id: node.id })
    const style = transform ? { transform: CSS.Translate.toString(transform) } : undefined

    return (
      <div ref={setNodeRef} style={style}>
        <div className="flex items-center gap-2 py-1.5 px-2 rounded-lg hover:bg-slate-50 group" style={{ marginLeft: depth * 14 }}>
          <div className="w-1.5 h-6 bg-indigo-400 rounded-full" />

          {hasChildren ? (
            <button
              onClick={() => setExpanded(prev => (prev.includes(node.id) ? prev.filter(x => x !== node.id) : [...prev, node.id]))}
              className="text-xs text-slate-500 w-6"
            >
              {isOpen ? '▾' : '▸'}
            </button>
          ) : (
            <div className="w-6" />
          )}

          <input
            type="checkbox"
            checked={isChecked(node.id)}
            onChange={() => toggleSelectBranch(node.id)}
          />

          <span className="text-sm font-medium">{node.name}</span>

          <span className="text-xs bg-slate-200 px-2 py-0.5 rounded-full ml-2">
            {countMap[node.id] || 0}
          </span>

          <div {...listeners} {...attributes} className="ml-auto opacity-0 group-hover:opacity-100 cursor-grab text-slate-400 text-xs px-2">
            ☰
          </div>
        </div>

        {hasChildren && isOpen && (
          <div className="pl-2">
            {children.map(child => (
              <TreeNode key={child.id} node={child} depth={depth + 1} />
            ))}
          </div>
        )}
      </div>
    )
  }

  if (!property) return <div className="p-8">Loading...</div>

  return (
    <main className="min-h-screen bg-slate-100 p-8">
      <DndContext collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <div className="bg-white p-6 rounded-xl shadow-md mb-6">
          <h1 className="text-2xl font-bold mb-4">Inventory Locations</h1>

          {roots.map(root => (
            <TreeNode key={root.id} node={root} depth={0} />
          ))}
        </div>
      </DndContext>
    </main>
  )
}
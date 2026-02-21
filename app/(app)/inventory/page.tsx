'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabaseBrowser } from '@/lib/supabase-browser'
import EditItemModal, { InventoryItem } from '@/components/inventory/EditItemModal'

type LocationRow = {
  id: string
  name: string
  parent_id: string | null
  sort_order?: number | null
  property_id: string
}

type ItemRow = InventoryItem & {
  location_id: string | null
  property_id: string
}

function ChevronRight() {
  return (
    <svg width="14" height="14" viewBox="0 0 20 20" aria-hidden="true">
      <path d="M7 4l6 6-6 6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}

function ChevronDown() {
  return (
    <svg width="14" height="14" viewBox="0 0 20 20" aria-hidden="true">
      <path d="M4 7l6 6 6-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}

export default function InventoryPage() {
  const supabase = supabaseBrowser()
  const router = useRouter()

  const [property, setProperty] = useState<{ id: string } | null>(null)
  const [locations, setLocations] = useState<LocationRow[]>([])
  const [items, setItems] = useState<ItemRow[]>([])
  const [expanded, setExpanded] = useState<string[]>([])
  const [selected, setSelected] = useState<string[]>([])
  const selectedSet = useMemo(() => new Set(selected), [selected])

  const [editingItem, setEditingItem] = useState<ItemRow | null>(null)
  const [creating, setCreating] = useState(false)

  // photo input for add-photo (Edit modal still handles photos; this page just opens modals)
  const dummyRef = useRef<HTMLInputElement | null>(null)

  /* ------------------------------ load ------------------------------ */

  const loadAll = async (propId: string) => {
    const { data: locs, error: locErr } = await supabase
      .from('locations')
      .select('*')
      .eq('property_id', propId)
      .order('sort_order', { ascending: true })

    if (locErr) throw locErr
    setLocations((locs ?? []) as LocationRow[])

    const { data: its, error: itErr } = await supabase
      .from('items')
      .select('*')
      .eq('property_id', propId)

    if (itErr) throw itErr
    setItems((its ?? []) as ItemRow[])
  }

  useEffect(() => {
    const init = async () => {
      const { data: sess } = await supabase.auth.getSession()
      if (!sess.session?.access_token) {
        router.push('/')
        return
      }

      const { data: prop, error: propErr } = await supabase
        .from('properties')
        .select('id')
        .limit(1)
        .single()

      if (propErr || !prop?.id) return
      setProperty(prop)

      const savedExpanded = localStorage.getItem('expandedInventoryTree')
      if (savedExpanded) setExpanded(JSON.parse(savedExpanded))

      await loadAll(prop.id)
    }

    init()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    localStorage.setItem('expandedInventoryTree', JSON.stringify(expanded))
  }, [expanded])

  /* ------------------------------ tree helpers ------------------------------ */

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
    return locations
      .filter(l => !l.parent_id)
      .slice()
      .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
  }, [locations])

  const descendantsOf = (id: string): string[] => {
    const result = [id]
    const kids = childrenMap[id] || []
    for (const k of kids) result.push(...descendantsOf(k.id))
    return result
  }

  /* ------------------------------ counts (direct + rollup) ------------------------------ */

  const countMap = useMemo(() => {
    const direct: Record<string, number> = {}
    for (const it of items) {
      if (!it.location_id) continue
      direct[it.location_id] = (direct[it.location_id] || 0) + 1
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

  /* ------------------------------ tri-state selection ------------------------------ */

  const stateFor = (id: string) => {
    const branch = descendantsOf(id)
    const any = branch.some(x => selectedSet.has(x))
    const all = branch.every(x => selectedSet.has(x))
    return { any, all, indeterminate: any && !all }
  }

  const toggleBranch = (id: string) => {
    const branch = descendantsOf(id)
    const { all } = stateFor(id)
    if (all) {
      setSelected(prev => prev.filter(x => !branch.includes(x)))
    } else {
      setSelected(prev => Array.from(new Set([...prev, ...branch])))
      setExpanded(prev => (prev.includes(id) ? prev : [...prev, id]))
    }
  }

  /* ------------------------------ items displayed ------------------------------ */

  const filteredItems = useMemo(() => {
    if (selected.length === 0) return []
    return items.filter(i => i.location_id && selectedSet.has(i.location_id))
  }, [items, selected, selectedSet])

  /* ------------------------------ create item ------------------------------ */

  const selectedSingleLocation = useMemo(() => {
    if (selected.length !== 1) return null
    const id = selected[0]
    return byId[id] ?? null
  }, [selected, byId])

  const canCreateHere = useMemo(() => {
    // Must have exactly one selected location, and it must NOT be a root.
    if (!selectedSingleLocation) return false
    return selectedSingleLocation.parent_id !== null
  }, [selectedSingleLocation])

  const createNewItem = async () => {
    if (!property?.id) return
    if (!canCreateHere || !selectedSingleLocation) return

    setCreating(true)
    try {
      const { data, error } = await supabase
        .from('items')
        .insert({
          property_id: property.id,
          location_id: selectedSingleLocation.id,
          name: 'New Item'
        })
        .select('*')
        .single()

      if (error) return alert(error.message)

      const row = data as ItemRow
      setItems(prev => [row, ...prev])
      setEditingItem(row) // open modal to edit all attributes
    } finally {
      setCreating(false)
    }
  }

  /* ------------------------------ render ------------------------------ */

  function TreeNode({ node, depth }: { node: LocationRow; depth: number }) {
    const children = childrenMap[node.id] || []
    const hasChildren = children.length > 0
    const isOpen = expanded.includes(node.id)
    const subtreeCount = countMap[node.id] || 0

    const { any, all, indeterminate } = stateFor(node.id)

    return (
      <div>
        <div
          className="flex items-center gap-2 py-2 px-2 rounded-lg hover:bg-slate-50"
          style={{ marginLeft: depth * 16 }}
          title="Select to view inventory items"
        >
          <button
            className="w-7 h-7 flex items-center justify-center text-slate-500 hover:text-slate-700 rounded"
            onClick={() => {
              if (!hasChildren) return
              setExpanded(prev => (prev.includes(node.id) ? prev.filter(x => x !== node.id) : [...prev, node.id]))
            }}
            title={hasChildren ? (isOpen ? 'Collapse' : 'Expand') : 'No children'}
          >
            {hasChildren ? (isOpen ? <ChevronDown /> : <ChevronRight />) : <span className="text-slate-300">•</span>}
          </button>

          <input
            type="checkbox"
            checked={any} // parent checks when any child is selected
            ref={(el) => {
              if (el) el.indeterminate = indeterminate
            }}
            onChange={() => toggleBranch(node.id)}
            title="Select this location (includes children)"
          />

          <span className="text-sm font-medium text-slate-800">
            {node.name}{' '}
            <span className="text-slate-500 font-normal">({subtreeCount})</span>
          </span>
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
    <main className="grid grid-cols-3 gap-6">
      <input ref={dummyRef} className="hidden" />

      {/* Locations selection tree */}
      <div className="bg-white p-6 rounded-xl shadow-md">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h2 className="text-xl font-bold text-slate-900">Locations</h2>
            <div className="text-sm text-slate-500">
              Select one or more locations to view items below.
            </div>
          </div>
        </div>

        {roots.map(root => (
          <TreeNode key={root.id} node={root} depth={0} />
        ))}
      </div>

      {/* Inventory */}
      <div className="col-span-2 bg-white p-6 rounded-xl shadow-md">
        <div className="flex items-start justify-between gap-3 mb-4">
          <div>
            <h2 className="text-xl font-bold text-slate-900">Inventory</h2>
            <div className="text-sm text-slate-500">
              {selected.length === 0
                ? 'Select locations to view inventory.'
                : `${filteredItems.length} item(s) shown.`}
            </div>
          </div>

          <button
            className={[
              'px-3 py-2 rounded-lg text-sm',
              canCreateHere && !creating
                ? 'bg-indigo-600 text-white hover:bg-indigo-700'
                : 'bg-slate-200 text-slate-500 cursor-not-allowed'
            ].join(' ')}
            onClick={createNewItem}
            disabled={!canCreateHere || creating}
            title={
              canCreateHere
                ? 'Add a new inventory item under the selected location'
                : 'Select exactly one non-root location to add an item'
            }
          >
            + Add New Item
          </button>
        </div>

        {selected.length === 0 ? (
          <div className="text-slate-600">Please select a location to view items.</div>
        ) : filteredItems.length === 0 ? (
          <div className="text-slate-600">No items found for the selected location(s).</div>
        ) : (
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredItems.map(item => (
              <div
                key={item.id}
                className="border rounded-lg p-3 hover:bg-slate-50 cursor-pointer"
                onClick={() => setEditingItem(item)}
                title="Click to edit"
              >
                <div className="font-semibold text-slate-900">{item.name}</div>
                <div className="text-sm text-slate-600">
                  <div>
                    <span className="font-medium">Vendor:</span> {item.vendor ?? '—'}
                  </div>
                  <div>
                    <span className="font-medium">Price:</span>{' '}
                    {typeof item.price === 'number' ? `$${item.price.toFixed(2)}` : '—'}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {editingItem && (
        <EditItemModal
          item={editingItem}
          onClose={() => setEditingItem(null)}
          onUpdated={(updated) => {
            setItems(prev => prev.map(i => (i.id === updated.id ? (updated as ItemRow) : i)))
            setEditingItem(null)
          }}
          onDeleted={(id) => {
            setItems(prev => prev.filter(i => i.id !== id))
            setEditingItem(null)
          }}
        />
      )}
    </main>
  )
}
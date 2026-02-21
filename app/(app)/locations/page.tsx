'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { supabaseBrowser } from '@/lib/supabase-browser'

type LocationRow = {
  id: string
  property_id: string
  parent_id: string | null
  name: string
  sort_order: number | null
}

type ItemRow = {
  id: string
  property_id: string
  location_id: string
}

function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(' ')
}

function depthColor(depth: number) {
  // slate -> indigo accents per level
  const colors = [
    'border-indigo-600 bg-indigo-50/40',
    'border-slate-600 bg-slate-50',
    'border-indigo-400 bg-indigo-50/20',
    'border-slate-400 bg-white'
  ]
  return colors[Math.min(depth, colors.length - 1)]
}

export default function LocationsPage() {
  const supabase = useMemo(() => supabaseBrowser(), [])

  const [loading, setLoading] = useState(true)
  const [userId, setUserId] = useState<string | null>(null)
  const [propertyId, setPropertyId] = useState<string | null>(null)

  const [locations, setLocations] = useState<LocationRow[]>([])
  const [items, setItems] = useState<ItemRow[]>([])

  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const [search, setSearch] = useState('')

  // Add modal
  const [showAdd, setShowAdd] = useState(false)
  const [newName, setNewName] = useState('')
  const [newParent, setNewParent] = useState<string | null>(null)

  // Inline rename
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')

  // Context menu
  const [menu, setMenu] = useState<{
    id: string
    x: number
    y: number
  } | null>(null)

  const hideMenu = () => setMenu(null)

  useEffect(() => {
    const onClick = () => hideMenu()
    window.addEventListener('click', onClick)
    return () => window.removeEventListener('click', onClick)
  }, [])

  async function loadAll() {
    setLoading(true)
    try {
      const { data: sessionData } = await supabase.auth.getSession()
      const uid = sessionData?.session?.user?.id ?? null
      setUserId(uid)

      if (!uid) {
        // If not logged in, let middleware/route handle redirect; keep page quiet.
        setLocations([])
        setItems([])
        setPropertyId(null)
        return
      }

      // Find property via membership (owner row is fine too)
      const { data: pm, error: pmErr } = await supabase
        .from('property_members')
        .select('property_id, role')
        .eq('user_id', uid)
        .order('created_at', { ascending: true })
        .limit(1)

      if (pmErr) throw pmErr
      const pid = pm?.[0]?.property_id ?? null
      setPropertyId(pid)

      if (!pid) {
        setLocations([])
        setItems([])
        return
      }

      const [{ data: locs, error: locErr }, { data: its, error: itErr }] =
        await Promise.all([
          supabase
            .from('locations')
            .select('id, property_id, parent_id, name, sort_order')
            .eq('property_id', pid)
            .order('sort_order', { ascending: true })
            .order('created_at', { ascending: true }),
          supabase
            .from('items')
            .select('id, property_id, location_id')
            .eq('property_id', pid)
        ])

      if (locErr) throw locErr
      if (itErr) throw itErr

      setLocations((locs as LocationRow[]) ?? [])
      setItems((its as ItemRow[]) ?? [])

      // default expand roots
      setExpanded(prev => {
        const next = { ...prev }
        for (const l of (locs as LocationRow[]) ?? []) {
          if (l.parent_id === null && next[l.id] === undefined) next[l.id] = true
        }
        return next
      })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadAll()
    const { data: sub } = supabase.auth.onAuthStateChange(() => {
      loadAll()
    })
    return () => sub?.subscription?.unsubscribe()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const childrenByParent = useMemo(() => {
    const map = new Map<string | null, LocationRow[]>()
    for (const l of locations) {
      const key = l.parent_id ?? null
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(l)
    }
    // sort stable
    for (const [k, arr] of map.entries()) {
      arr.sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
      map.set(k, arr)
    }
    return map
  }, [locations])

  const directItemCountByLocation = useMemo(() => {
    const m = new Map<string, number>()
    for (const it of items) {
      m.set(it.location_id, (m.get(it.location_id) ?? 0) + 1)
    }
    return m
  }, [items])

  // Aggregate counts = this location + all descendants
  const aggregateCountByLocation = useMemo(() => {
    const agg = new Map<string, number>()

    function dfs(id: string): number {
      if (agg.has(id)) return agg.get(id)!
      const direct = directItemCountByLocation.get(id) ?? 0
      const kids = childrenByParent.get(id) ?? []
      let sum = direct
      for (const k of kids) sum += dfs(k.id)
      agg.set(id, sum)
      return sum
    }

    for (const l of locations) dfs(l.id)
    return agg
  }, [locations, childrenByParent, directItemCountByLocation])

  function hasChildren(id: string) {
    return (childrenByParent.get(id)?.length ?? 0) > 0
  }

  const filteredIds = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return null
    const keep = new Set<string>()
    for (const l of locations) {
      if (l.name.toLowerCase().includes(q)) keep.add(l.id)
    }
    // include ancestors so results remain visible in tree
    const byId = new Map(locations.map(l => [l.id, l]))
    for (const id of Array.from(keep)) {
      let cur = byId.get(id)
      while (cur?.parent_id) {
        keep.add(cur.parent_id)
        cur = byId.get(cur.parent_id)
      }
    }
    return keep
  }, [search, locations])

  function toggleExpand(id: string) {
    setExpanded(prev => ({ ...prev, [id]: !prev[id] }))
  }

  async function beginRename(loc: LocationRow) {
    setRenamingId(loc.id)
    setRenameValue(loc.name)
  }

  async function commitRename(id: string) {
    const name = renameValue.trim()
    setRenamingId(null)
    if (!name) return
    const { error } = await supabase.from('locations').update({ name }).eq('id', id)
    if (error) {
      alert(error.message)
      return
    }
    setLocations(prev => prev.map(l => (l.id === id ? { ...l, name } : l)))
  }

  async function createLocation() {
    if (!propertyId) return
    const name = newName.trim()
    if (!name) return

    // place at end of siblings
    const siblings = (childrenByParent.get(newParent ?? null) ?? []).slice()
    const maxSort = siblings.reduce((m, s) => Math.max(m, s.sort_order ?? 0), 0)
    const sort_order = maxSort + 1

    const { data, error } = await supabase
      .from('locations')
      .insert({
        property_id: propertyId,
        parent_id: newParent ?? null,
        name,
        sort_order
      })
      .select('id, property_id, parent_id, name, sort_order')
      .single()

    if (error) {
      alert(error.message)
      return
    }

    setLocations(prev => [...prev, data as LocationRow])
    setExpanded(prev => {
      const next = { ...prev }
      if (newParent) next[newParent] = true
      return next
    })

    setShowAdd(false)
    setNewName('')
    setNewParent(null)
  }

  async function deleteLocation(id: string) {
    const agg = aggregateCountByLocation.get(id) ?? 0
    if (agg > 0) {
      alert('Cannot delete: inventory items exist in this location (or its sub-locations).')
      return
    }
    if (hasChildren(id)) {
      alert('Cannot delete: this location has child locations. Move/delete children first.')
      return
    }
    if (!confirm('Delete this location?')) return

    const { error } = await supabase.from('locations').delete().eq('id', id)
    if (error) {
      alert(error.message)
      return
    }
    setLocations(prev => prev.filter(l => l.id !== id))
  }

  function renderTree(parent: string | null, depth: number) {
    const rows = childrenByParent.get(parent) ?? []
    const out: any[] = []
    for (const loc of rows) {
      if (filteredIds && !filteredIds.has(loc.id)) continue

      const kids = childrenByParent.get(loc.id) ?? []
      const isExpanded = expanded[loc.id] ?? false
      const agg = aggregateCountByLocation.get(loc.id) ?? 0

      out.push(
        <div key={loc.id} className="relative">
          <div
            className={cx(
              'group flex items-center gap-2 rounded-lg border-l-4 px-3 py-2 mb-1',
              depthColor(depth),
              'hover:bg-indigo-50/60 transition-colors'
            )}
            style={{ marginLeft: depth * 14 }}
            title="Double-click to rename. Right-click for menu."
            onContextMenu={(e) => {
              e.preventDefault()
              setMenu({ id: loc.id, x: e.clientX, y: e.clientY })
            }}
          >
            {/* chevron */}
            <button
              type="button"
              className={cx(
                'h-7 w-7 flex items-center justify-center rounded-md',
                kids.length ? 'hover:bg-slate-200/70' : 'opacity-30 cursor-default'
              )}
              onClick={() => kids.length && toggleExpand(loc.id)}
              aria-label={kids.length ? (isExpanded ? 'Collapse' : 'Expand') : 'No children'}
            >
              {kids.length ? (isExpanded ? '▾' : '▸') : '•'}
            </button>

            {/* name */}
            <div className="flex-1 min-w-0">
              {renamingId === loc.id ? (
                <input
                  className="w-full rounded-md border px-2 py-1 text-slate-900"
                  value={renameValue}
                  onChange={(e) => setRenameValue(e.target.value)}
                  autoFocus
                  onBlur={() => commitRename(loc.id)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') commitRename(loc.id)
                    if (e.key === 'Escape') setRenamingId(null)
                  }}
                />
              ) : (
                <div
                  className="font-medium text-slate-900 truncate"
                  onDoubleClick={() => beginRename(loc)}
                >
                  {loc.name}{' '}
                  <span className="text-slate-500 font-normal">({agg})</span>
                </div>
              )}
              <div className="text-xs text-slate-500">
                {loc.parent_id ? 'Child location' : 'Root location'}
              </div>
            </div>

            {/* inline delete */}
            <button
              type="button"
              className={cx(
                'text-sm px-2 py-1 rounded-md border',
                (agg > 0 || hasChildren(loc.id))
                  ? 'opacity-40 cursor-not-allowed'
                  : 'hover:bg-red-50 hover:border-red-200 hover:text-red-700'
              )}
              disabled={agg > 0 || hasChildren(loc.id)}
              onClick={() => deleteLocation(loc.id)}
              title={
                agg > 0
                  ? 'Cannot delete: items exist'
                  : hasChildren(loc.id)
                    ? 'Cannot delete: has child locations'
                    : 'Delete location'
              }
            >
              Delete
            </button>
          </div>

          {/* subtle connector line */}
          {depth > 0 && (
            <div
              className="absolute left-1 top-0 bottom-0 w-px bg-slate-200"
              style={{ marginLeft: depth * 14 }}
              aria-hidden
            />
          )}

          {kids.length > 0 && isExpanded && (
            <div className="pl-2">{renderTree(loc.id, depth + 1)}</div>
          )}
        </div>
      )
    }
    return out
  }

  const parentOptions = useMemo(() => {
    // show all locations as potential parent
    return locations
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [locations])

  return (
    <div className="max-w-5xl mx-auto px-6 py-10">
      <div className="flex items-start justify-between gap-6">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Locations</h1>
          <p className="text-slate-600 mt-1">
            Manage your location hierarchy here. Inventory locations can be re-used in Inventory.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <input
            className="w-64 rounded-xl border px-3 py-2"
            placeholder="Search locations..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <button
            className="rounded-xl bg-indigo-600 text-white px-4 py-2 font-medium hover:bg-indigo-700"
            onClick={() => setShowAdd(true)}
          >
            + New Location
          </button>
        </div>
      </div>

      <div className="mt-8 rounded-2xl bg-white shadow-sm border p-5">
        {loading ? (
          <div className="text-slate-600">Loading…</div>
        ) : !userId ? (
          <div className="text-slate-600">Not logged in.</div>
        ) : !propertyId ? (
          <div className="text-slate-600">
            No property found for this user. (property_members missing)
          </div>
        ) : (
          <>
            <div className="text-sm text-slate-500 mb-3">
              Tip: Double-click a name to rename. Right-click a row for actions.
            </div>
            <div>{renderTree(null, 0)}</div>
            {locations.length === 0 && (
              <div className="text-slate-600">No locations yet. Add your first location.</div>
            )}
          </>
        )}
      </div>

      {/* context menu */}
      {menu && (
        <div
          className="fixed z-50 min-w-44 rounded-xl border bg-white shadow-lg overflow-hidden"
          style={{ left: menu.x, top: menu.y }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            className="w-full text-left px-3 py-2 hover:bg-slate-50"
            onClick={() => {
              const loc = locations.find(l => l.id === menu.id)
              if (loc) beginRename(loc)
              hideMenu()
            }}
          >
            Rename
          </button>
          <button
            className="w-full text-left px-3 py-2 hover:bg-slate-50"
            onClick={() => {
              setShowAdd(true)
              setNewParent(menu.id)
              hideMenu()
            }}
          >
            Add child location
          </button>
          <button
            className="w-full text-left px-3 py-2 hover:bg-red-50 text-red-700"
            onClick={() => {
              deleteLocation(menu.id)
              hideMenu()
            }}
          >
            Delete
          </button>
        </div>
      )}

      {/* add modal */}
      {showAdd && (
        <div className="fixed inset-0 z-40 bg-black/30 flex items-center justify-center px-4">
          <div className="w-full max-w-lg rounded-2xl bg-white shadow-xl border p-6">
            <div className="flex items-start justify-between">
              <div>
                <div className="text-xl font-bold text-slate-900">Add New Location</div>
                <div className="text-slate-600 text-sm mt-1">
                  Enter a name and optionally choose a parent.
                </div>
              </div>
              <button
                className="rounded-lg border px-3 py-1 hover:bg-slate-50"
                onClick={() => {
                  setShowAdd(false)
                  setNewName('')
                  setNewParent(null)
                }}
              >
                Close
              </button>
            </div>

            <div className="mt-4 space-y-3">
              <div>
                <label className="text-sm font-medium text-slate-700">Location name</label>
                <input
                  className="mt-1 w-full rounded-xl border px-3 py-2"
                  placeholder="e.g., First Floor"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                />
              </div>

              <div>
                <label className="text-sm font-medium text-slate-700">Parent location</label>
                <select
                  className="mt-1 w-full rounded-xl border px-3 py-2"
                  value={newParent ?? ''}
                  onChange={(e) => setNewParent(e.target.value || null)}
                >
                  <option value="">(Root)</option>
                  {parentOptions.map(p => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
                <div className="text-xs text-slate-500 mt-1">
                  If you pick a parent, this becomes a child location.
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  className="rounded-xl border px-4 py-2 hover:bg-slate-50"
                  onClick={() => {
                    setShowAdd(false)
                    setNewName('')
                    setNewParent(null)
                  }}
                >
                  Cancel
                </button>
                <button
                  className="rounded-xl bg-indigo-600 text-white px-4 py-2 font-medium hover:bg-indigo-700"
                  onClick={createLocation}
                >
                  Add
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
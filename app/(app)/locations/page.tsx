'use client'

import { useEffect, useMemo, useState } from 'react'
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

type DisplayRow = {
  id: string
  name: string
  parent_id: string | null
  depth: number
  hasChildren: boolean
  aggCount: number
  cycle: boolean
}

function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(' ')
}

function depthStyle(depth: number) {
  // Simple, readable hierarchy colors
  if (depth === 0) return 'border-indigo-600 bg-indigo-50/40'
  if (depth === 1) return 'border-slate-500 bg-slate-50'
  if (depth === 2) return 'border-indigo-400 bg-indigo-50/20'
  return 'border-slate-300 bg-white'
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

  // Cycle warnings
  const [cycleIds, setCycleIds] = useState<string[]>([])

  useEffect(() => {
    loadAll()
    const { data: sub } = supabase.auth.onAuthStateChange(() => loadAll())
    return () => sub?.subscription?.unsubscribe()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function loadAll() {
    setLoading(true)
    try {
      const { data: sessionData } = await supabase.auth.getSession()
      const uid = sessionData?.session?.user?.id ?? null
      setUserId(uid)

      if (!uid) {
        setPropertyId(null)
        setLocations([])
        setItems([])
        return
      }

      const { data: pm, error: pmErr } = await supabase
        .from('property_members')
        .select('property_id')
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

      const [locRes, itemRes] = await Promise.all([
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

      if (locRes.error) throw locRes.error
      if (itemRes.error) throw itemRes.error

      const locs = (locRes.data as LocationRow[]) ?? []
      const its = (itemRes.data as ItemRow[]) ?? []

      setLocations(locs)
      setItems(its)

      // Expand roots by default (only set if not already decided)
      setExpanded(prev => {
        const next = { ...prev }
        for (const l of locs) {
          if (l.parent_id === null && next[l.id] === undefined) next[l.id] = true
        }
        return next
      })
    } finally {
      setLoading(false)
    }
  }

  const byId = useMemo(() => new Map(locations.map(l => [l.id, l])), [locations])

  const childrenByParent = useMemo(() => {
    const map = new Map<string | null, LocationRow[]>()
    for (const l of locations) {
      const key = l.parent_id ?? null
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(l)
    }
    for (const [k, arr] of map.entries()) {
      arr.sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
      map.set(k, arr)
    }
    return map
  }, [locations])

  const directCountByLoc = useMemo(() => {
    const m = new Map<string, number>()
    for (const it of items) m.set(it.location_id, (m.get(it.location_id) ?? 0) + 1)
    return m
  }, [items])

  // Compute aggregate counts with cycle protection (DFS with visiting/visited)
  const aggCountByLoc = useMemo(() => {
    const memo = new Map<string, number>()
    const visiting = new Set<string>()
    const cycles = new Set<string>()

    function dfs(id: string): number {
      if (memo.has(id)) return memo.get(id)!
      if (visiting.has(id)) {
        cycles.add(id)
        // Break the cycle: treat as leaf for counting to prevent recursion loop
        const direct = directCountByLoc.get(id) ?? 0
        memo.set(id, direct)
        return direct
      }
      visiting.add(id)
      const direct = directCountByLoc.get(id) ?? 0
      const kids = childrenByParent.get(id) ?? []
      let sum = direct
      for (const k of kids) sum += dfs(k.id)
      visiting.delete(id)
      memo.set(id, sum)
      return sum
    }

    for (const l of locations) dfs(l.id)

    setCycleIds(Array.from(cycles))
    return memo
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locations, childrenByParent, directCountByLoc])

  const filteredKeep = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return null as Set<string> | null

    const keep = new Set<string>()
    for (const l of locations) {
      if (l.name.toLowerCase().includes(q)) keep.add(l.id)
    }

    // Add ancestors, but cap traversal and detect cycles
    for (const id of Array.from(keep)) {
      const seen = new Set<string>()
      let cur = byId.get(id)
      while (cur?.parent_id) {
        if (seen.has(cur.parent_id)) {
          // cycle
          break
        }
        seen.add(cur.parent_id)
        keep.add(cur.parent_id)
        cur = byId.get(cur.parent_id)
      }
    }

    return keep
  }, [search, locations, byId])

  function toggleExpand(id: string) {
    setExpanded(prev => ({ ...prev, [id]: !prev[id] }))
  }

  // Build a flattened list for rendering WITHOUT recursion
  const displayRows: DisplayRow[] = useMemo(() => {
    const out: DisplayRow[] = []
    const roots = (childrenByParent.get(null) ?? []).slice()

    // If a cycle exists, some nodes may not be reachable from roots.
    // We'll render roots normally; unreachable nodes will be shown at bottom.
    const visited = new Set<string>()

    const stack: Array<{ id: string; depth: number }> = []
    // push roots in reverse so first root renders first (stack LIFO)
    for (let i = roots.length - 1; i >= 0; i--) {
      stack.push({ id: roots[i].id, depth: 0 })
    }

    while (stack.length) {
      const { id, depth } = stack.pop()!
      if (visited.has(id)) continue
      visited.add(id)

      const loc = byId.get(id)
      if (!loc) continue

      if (filteredKeep && !filteredKeep.has(id)) {
        // Skip this node entirely when searching
        continue
      }

      const kids = childrenByParent.get(id) ?? []
      const hasChildren = kids.length > 0
      const isExpanded = expanded[id] ?? false
      const agg = aggCountByLoc.get(id) ?? 0
      const isCycle = cycleIds.includes(id)

      out.push({
        id,
        name: loc.name,
        parent_id: loc.parent_id,
        depth,
        hasChildren,
        aggCount: agg,
        cycle: isCycle
      })

      if (hasChildren && isExpanded) {
        // push children in reverse
        for (let i = kids.length - 1; i >= 0; i--) {
          const child = kids[i]
          stack.push({ id: child.id, depth: depth + 1 })
        }
      }
    }

    // Add unreachable nodes (often caused by cycles or broken parent refs)
    const allIds = new Set(locations.map(l => l.id))
    const unreachable = Array.from(allIds).filter(id => !visited.has(id))

    if (unreachable.length) {
      // show a divider
      out.push({
        id: '__divider__',
        name: 'Unlinked / Cycle Locations',
        parent_id: null,
        depth: 0,
        hasChildren: false,
        aggCount: 0,
        cycle: false
      } as any)

      // list unreachable at depth 0
      for (const id of unreachable) {
        const loc = byId.get(id)
        if (!loc) continue
        if (filteredKeep && !filteredKeep.has(id)) continue

        out.push({
          id,
          name: loc.name,
          parent_id: loc.parent_id,
          depth: 0,
          hasChildren: (childrenByParent.get(id)?.length ?? 0) > 0,
          aggCount: aggCountByLoc.get(id) ?? 0,
          cycle: true // treat as warning
        })
      }
    }

    return out
  }, [childrenByParent, byId, locations, expanded, filteredKeep, aggCountByLoc, cycleIds])

  async function beginRename(id: string, current: string) {
    setRenamingId(id)
    setRenameValue(current)
  }

  async function commitRename(id: string) {
    const name = renameValue.trim()
    setRenamingId(null)
    if (!name) return

    const { error } = await supabase.from('locations').update({ name }).eq('id', id)
    if (error) return alert(error.message)

    setLocations(prev => prev.map(l => (l.id === id ? { ...l, name } : l)))
  }

  async function createLocation() {
    if (!propertyId) return
    const name = newName.trim()
    if (!name) return

    // Prevent creating a cycle on insert by allowing only existing parent selection; OK.
    const siblings = childrenByParent.get(newParent ?? null) ?? []
    const maxSort = siblings.reduce((m, s) => Math.max(m, s.sort_order ?? 0), 0)

    const { data, error } = await supabase
      .from('locations')
      .insert({
        property_id: propertyId,
        parent_id: newParent ?? null,
        name,
        sort_order: maxSort + 1
      })
      .select('id, property_id, parent_id, name, sort_order')
      .single()

    if (error) return alert(error.message)

    setLocations(prev => [...prev, data as LocationRow])
    if (newParent) setExpanded(prev => ({ ...prev, [newParent]: true }))

    setShowAdd(false)
    setNewName('')
    setNewParent(null)
  }

  async function deleteLocation(id: string) {
    const agg = aggCountByLoc.get(id) ?? 0
    const hasChildren = (childrenByParent.get(id)?.length ?? 0) > 0

    if (agg > 0) return alert('Cannot delete: items exist in this location or sub-locations.')
    if (hasChildren) return alert('Cannot delete: this location has child locations.')

    if (!confirm('Delete this location?')) return

    const { error } = await supabase.from('locations').delete().eq('id', id)
    if (error) return alert(error.message)

    setLocations(prev => prev.filter(l => l.id !== id))
  }

  const parentOptions = useMemo(() => {
    return locations.slice().sort((a, b) => a.name.localeCompare(b.name))
  }, [locations])

  return (
    <div className="max-w-6xl mx-auto px-6 py-10">
      <div className="flex items-start justify-between gap-6">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Locations</h1>
          <p className="text-slate-600 mt-1">
            Manage your hierarchy. Counts show total items in a location including its sub-locations.
          </p>
          {cycleIds.length > 0 && (
            <div className="mt-2 text-sm text-red-700">
              Warning: Detected a cycle in locations. UI is protected, but please fix the hierarchy (see SQL below).
            </div>
          )}
        </div>

        <div className="flex items-center gap-3">
          <input
            className="w-72 rounded-xl border px-3 py-2"
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
          <div className="text-slate-600">No property found for this user (property_members).</div>
        ) : (
          <>
            <div className="text-sm text-slate-500 mb-3">
              Tip: Double-click a name to rename. Expand/collapse with the chevron.
            </div>

            {displayRows.length === 0 ? (
              <div className="text-slate-600">No locations yet. Add your first location.</div>
            ) : (
              <div className="space-y-1">
                {displayRows.map((r: any) => {
                  if (r.id === '__divider__') {
                    return (
                      <div key="__divider__" className="mt-4 mb-2 text-sm font-semibold text-slate-700">
                        {r.name}
                      </div>
                    )
                  }

                  const isExpanded = expanded[r.id] ?? false
                  return (
                    <div
                      key={r.id}
                      className={cx(
                        'group flex items-center gap-2 rounded-lg border-l-4 px-3 py-2',
                        depthStyle(r.depth),
                        r.cycle ? 'ring-1 ring-red-200' : '',
                        'hover:bg-indigo-50/60 transition-colors'
                      )}
                      style={{ marginLeft: r.depth * 14 }}
                    >
                      <button
                        type="button"
                        className={cx(
                          'h-7 w-7 flex items-center justify-center rounded-md',
                          r.hasChildren ? 'hover:bg-slate-200/70' : 'opacity-30 cursor-default'
                        )}
                        onClick={() => r.hasChildren && toggleExpand(r.id)}
                        aria-label={r.hasChildren ? (isExpanded ? 'Collapse' : 'Expand') : 'No children'}
                      >
                        {r.hasChildren ? (isExpanded ? '▾' : '▸') : '•'}
                      </button>

                      <div className="flex-1 min-w-0">
                        {renamingId === r.id ? (
                          <input
                            className="w-full rounded-md border px-2 py-1 text-slate-900"
                            value={renameValue}
                            onChange={(e) => setRenameValue(e.target.value)}
                            autoFocus
                            onBlur={() => commitRename(r.id)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') commitRename(r.id)
                              if (e.key === 'Escape') setRenamingId(null)
                            }}
                          />
                        ) : (
                          <div
                            className="font-medium text-slate-900 truncate"
                            onDoubleClick={() => beginRename(r.id, r.name)}
                            title={r.cycle ? 'Cycle detected here. Fix parent_id chain.' : undefined}
                          >
                            {r.name}{' '}
                            <span className="text-slate-500 font-normal">({r.aggCount})</span>
                            {r.cycle && <span className="ml-2 text-xs text-red-700">cycle</span>}
                          </div>
                        )}
                      </div>

                      <button
                        type="button"
                        className={cx(
                          'text-sm px-2 py-1 rounded-md border',
                          (r.aggCount > 0 || r.hasChildren)
                            ? 'opacity-40 cursor-not-allowed'
                            : 'hover:bg-red-50 hover:border-red-200 hover:text-red-700'
                        )}
                        disabled={r.aggCount > 0 || r.hasChildren}
                        onClick={() => deleteLocation(r.id)}
                      >
                        Delete
                      </button>
                    </div>
                  )
                })}
              </div>
            )}
          </>
        )}
      </div>

      {/* Add modal */}
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
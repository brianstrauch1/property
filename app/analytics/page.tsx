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
  purchase_price: number | null
  purchase_date: string | null
  warranty_expires_on: string | null
  depreciation_method: string | null
  useful_life_months: number | null
  salvage_value: number | null
}

function daysBetween(a: Date, b: Date) {
  const ms = b.getTime() - a.getTime()
  return Math.floor(ms / (1000 * 60 * 60 * 24))
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n))
}

// Straight-line depreciation (monthly)
function currentBookValue(item: ItemRow, asOf = new Date()) {
  const cost = item.purchase_price ?? 0
  const salvage = Number(item.salvage_value ?? 0)
  const life = item.useful_life_months ?? null
  const purchaseDate = item.purchase_date ? new Date(item.purchase_date) : null

  if (!purchaseDate || !life || life <= 0) return null
  const monthsElapsed = clamp(
    Math.floor(daysBetween(purchaseDate, asOf) / 30.4375),
    0,
    life
  )
  const depreciableBase = Math.max(cost - salvage, 0)
  const monthly = depreciableBase / life
  const accumulated = monthly * monthsElapsed
  return Math.max(cost - accumulated, salvage)
}

export default function AnalyticsPage() {
  const supabase = supabaseBrowser()
  const router = useRouter()

  const [property, setProperty] = useState<any>(null)
  const [locations, setLocations] = useState<LocationRow[]>([])
  const [items, setItems] = useState<ItemRow[]>([])
  const [selectedLocations, setSelectedLocations] = useState<string[]>([])

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
        .select('id,name,parent_id')
        .eq('property_id', prop.id)

      setLocations((locs ?? []) as LocationRow[])

      const { data: its } = await supabase
        .from('items')
        .select('id,property_id,location_id,name,category,purchase_price,purchase_date,warranty_expires_on,depreciation_method,useful_life_months,salvage_value')
        .eq('property_id', prop.id)

      setItems((its ?? []) as ItemRow[])
    }

    init()
  }, [])

  const validLocations = useMemo(() => locations.filter(l => l.parent_id !== null), [locations])

  const toggleLocation = (id: string) => {
    setSelectedLocations(prev => (prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]))
  }

  const scopedItems = useMemo(() => {
    if (selectedLocations.length === 0) return []
    return items.filter(i => i.location_id && selectedLocations.includes(i.location_id))
  }, [items, selectedLocations])

  const valueTotal = useMemo(() => scopedItems.reduce((s, i) => s + (i.purchase_price ?? 0), 0), [scopedItems])

  const perLocation = useMemo(() => {
    const map = new Map<string, { locationId: string; count: number; value: number }>()
    for (const item of scopedItems) {
      if (!item.location_id) continue
      const rec = map.get(item.location_id) ?? { locationId: item.location_id, count: 0, value: 0 }
      rec.count += 1
      rec.value += item.purchase_price ?? 0
      map.set(item.location_id, rec)
    }
    const arr = Array.from(map.values())
    arr.sort((a, b) => b.value - a.value)
    return arr
  }, [scopedItems])

  const locationName = useMemo(() => {
    const m = new Map<string, string>()
    locations.forEach(l => m.set(l.id, l.name))
    return m
  }, [locations])

  const warrantyStats = useMemo(() => {
    const now = new Date()
    const soonDays = 60

    let expired = 0
    let expiringSoon = 0
    let withWarranty = 0

    for (const i of scopedItems) {
      if (!i.warranty_expires_on) continue
      withWarranty++
      const d = new Date(i.warranty_expires_on)
      const delta = daysBetween(now, d)
      if (delta < 0) expired++
      else if (delta <= soonDays) expiringSoon++
    }

    return { withWarranty, expiringSoon, expired }
  }, [scopedItems])

  const depreciationStats = useMemo(() => {
    const vals = scopedItems
      .map(i => currentBookValue(i))
      .filter(v => v !== null) as number[]
    const bookTotal = vals.reduce((s, v) => s + v, 0)
    const trackedCount = vals.length
    return { trackedCount, bookTotal }
  }, [scopedItems])

  // Simple bar “chart” without dependencies (CSS bars)
  const maxLocValue = perLocation.length ? perLocation[0].value : 0

  if (!property) return <div className="p-8">Loading...</div>

  return (
    <main className="min-h-screen bg-slate-100 p-8">
      <TopNav />

      <div className="bg-white p-6 rounded-xl shadow-md mb-6">
        <h1 className="text-2xl font-bold mb-4">Analytics</h1>

        <div className="mb-3">
          <div className="font-semibold mb-2">Select Location(s)</div>
          <div className="flex flex-wrap gap-2">
            {validLocations.map(l => (
              <button
                key={l.id}
                onClick={() => toggleLocation(l.id)}
                className={`px-3 py-1 rounded border ${
                  selectedLocations.includes(l.id) ? 'bg-indigo-600 text-white' : 'bg-white'
                }`}
              >
                {l.name}
              </button>
            ))}
          </div>
        </div>

        {selectedLocations.length === 0 ? (
          <div className="text-slate-500">Select one or more locations to see analytics.</div>
        ) : (
          <div className="grid gap-4 md:grid-cols-3">
            <Kpi title="Items" value={scopedItems.length} />
            <Kpi title="Total Purchase Value" value={`$${valueTotal.toFixed(2)}`} />
            <Kpi title="Book Value (Tracked)" value={`$${depreciationStats.bookTotal.toFixed(2)}`} subtitle={`${depreciationStats.trackedCount} items`} />
          </div>
        )}
      </div>

      {selectedLocations.length > 0 && (
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="bg-white p-6 rounded-xl shadow-md">
            <h2 className="text-xl font-semibold mb-3">Per-Location Value Breakdown</h2>

            {perLocation.length === 0 ? (
              <div className="text-slate-500">No items in selected locations.</div>
            ) : (
              <div className="space-y-3">
                {perLocation.map(r => {
                  const pct = maxLocValue ? (r.value / maxLocValue) * 100 : 0
                  return (
                    <div key={r.locationId}>
                      <div className="flex justify-between text-sm mb-1">
                        <div className="font-medium">{locationName.get(r.locationId) ?? r.locationId}</div>
                        <div className="text-slate-600">
                          ${r.value.toFixed(2)} • {r.count} items
                        </div>
                      </div>
                      <div className="h-3 bg-slate-100 rounded">
                        <div className="h-3 bg-indigo-600 rounded" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          <div className="bg-white p-6 rounded-xl shadow-md">
            <h2 className="text-xl font-semibold mb-3">Warranty Overview</h2>
            <div className="grid gap-4 md:grid-cols-3">
              <Kpi title="With Warranty Date" value={warrantyStats.withWarranty} />
              <Kpi title="Expiring ≤ 60 days" value={warrantyStats.expiringSoon} />
              <Kpi title="Expired" value={warrantyStats.expired} />
            </div>

            <div className="text-xs text-slate-500 mt-3">
              “Expiring soon” is calculated using today + 60 days.
            </div>
          </div>
        </div>
      )}
    </main>
  )
}

function Kpi({ title, value, subtitle }: { title: string; value: any; subtitle?: string }) {
  return (
    <div className="border rounded-xl p-4 bg-slate-50">
      <div className="text-xs text-slate-600">{title}</div>
      <div className="text-2xl font-bold">{value}</div>
      {subtitle && <div className="text-xs text-slate-500">{subtitle}</div>}
    </div>
  )
}

function TopNav() {
  return (
    <div className="flex gap-4 mb-6">
      <Link href="/dashboard">Locations</Link>
      <Link href="/inventory">Inventory</Link>
      <Link href="/analytics" className="font-semibold">Analytics</Link>
      <Link href="/settings">Settings</Link>
    </div>
  )
}
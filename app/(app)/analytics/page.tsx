'use client'

import { useEffect, useState } from 'react'
import { supabaseBrowser } from '@/lib/supabase-browser'
import { InventoryItem } from '@/components/inventory/EditItemModal'

export default function AnalyticsPage() {
  const supabase = supabaseBrowser()

  const [items, setItems] = useState<InventoryItem[]>([])
  const [totalValue, setTotalValue] = useState(0)

  useEffect(() => {
    const load = async () => {
      const { data } = await supabase
        .from('inventory_items')
        .select('*')

      const rows = data ?? []
      setItems(rows)

      const total = rows.reduce(
        (sum, i) => sum + (typeof i.price === 'number' ? i.price : 0),
        0
      )

      setTotalValue(total)
    }

    load()
  }, [])

  return (
    <main className="bg-white p-6 rounded-xl shadow-md">
      <h1 className="text-2xl font-bold mb-6">Analytics</h1>

      <div className="grid grid-cols-3 gap-6">
        <div className="bg-slate-50 p-4 rounded-lg">
          <div className="text-sm text-slate-500">Total Items</div>
          <div className="text-2xl font-bold">{items.length}</div>
        </div>

        <div className="bg-slate-50 p-4 rounded-lg">
          <div className="text-sm text-slate-500">Total Value</div>
          <div className="text-2xl font-bold">
            ${totalValue.toFixed(2)}
          </div>
        </div>
      </div>
    </main>
  )
}
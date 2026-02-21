'use client'

import { useEffect, useState } from 'react'
import { supabaseBrowser } from '@/lib/supabase-browser'

export type InventoryItem = {
  id: string
  property_id: string
  location_id: string | null
  name: string
  description: string | null
  vendor: string | null
  price: number | null
  category_id: string | null
  warranty_expiration: string | null
  depreciation_years: number | null
  photos: string[] | null
}

type Category = {
  id: string
  name: string
}

interface Props {
  item: InventoryItem
  onClose: () => void
  onUpdated: (updated: InventoryItem) => void
}

export default function EditItemModal({
  item,
  onClose,
  onUpdated
}: Props) {
  const supabase = supabaseBrowser()

  const [form, setForm] = useState<InventoryItem>(item)
  const [categories, setCategories] = useState<Category[]>([])

  useEffect(() => {
    loadCategories()
  }, [])

  async function loadCategories() {
    const { data } = await supabase
      .from('categories')
      .select('id,name')
      .order('name')

    if (data) setCategories(data)
  }

  async function handleSave() {
    const { data } = await supabase
      .from('items')
      .update(form)
      .eq('id', form.id)
      .select()
      .single()

    if (data) {
      onUpdated(data)
      onClose()
    }
  }

  async function handleDelete() {
    if (!confirm('Delete this item?')) return

    await supabase.from('items').delete().eq('id', form.id)
    onClose()
    window.location.reload()
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl w-full max-w-2xl p-6 shadow-lg max-h-[90vh] overflow-y-auto">

        <h2 className="text-xl font-semibold mb-4">
          Edit Inventory Item
        </h2>

        <div className="space-y-4">

          <input
            value={form.name}
            onChange={e =>
              setForm({ ...form, name: e.target.value })
            }
            className="w-full border rounded p-2"
            placeholder="Item Name"
          />

          <textarea
            value={form.description || ''}
            onChange={e =>
              setForm({
                ...form,
                description: e.target.value
              })
            }
            className="w-full border rounded p-2"
            placeholder="Description"
          />

          <input
            value={form.vendor || ''}
            onChange={e =>
              setForm({ ...form, vendor: e.target.value })
            }
            className="w-full border rounded p-2"
            placeholder="Vendor"
          />

          <input
            type="number"
            value={form.price ?? ''}
            onChange={e =>
              setForm({
                ...form,
                price: Number(e.target.value)
              })
            }
            className="w-full border rounded p-2"
            placeholder="Price"
          />

          <select
            value={form.category_id || ''}
            onChange={e =>
              setForm({
                ...form,
                category_id: e.target.value
              })
            }
            className="w-full border rounded p-2"
          >
            <option value="">Select Category</option>
            {categories.map(cat => (
              <option key={cat.id} value={cat.id}>
                {cat.name}
              </option>
            ))}
          </select>

        </div>

        <div className="flex justify-between mt-6">
          <button
            onClick={handleDelete}
            className="text-red-600 font-semibold"
          >
            Delete
          </button>

          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="border px-4 py-2 rounded"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              className="bg-indigo-600 text-white px-4 py-2 rounded"
            >
              Save
            </button>
          </div>
        </div>

      </div>
    </div>
  )
}
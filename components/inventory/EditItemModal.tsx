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
  const [saving, setSaving] = useState(false)

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
    setSaving(true)

    const { data, error } = await supabase
      .from('items')
      .update({
        name: form.name,
        description: form.description,
        vendor: form.vendor,
        price: form.price,
        category_id: form.category_id,
        warranty_expiration: form.warranty_expiration,
        depreciation_years: form.depreciation_years,
        photos: form.photos
      })
      .eq('id', form.id)
      .select()
      .single()

    setSaving(false)

    if (!error && data) {
      onUpdated(data as InventoryItem)
      onClose()
    }
  }

  async function handlePhotoUpload(files: FileList | null) {
    if (!files) return

    const uploadedUrls: string[] = []

    for (let i = 0; i < files.length; i++) {
      const file = files[i]
      const filePath = `${form.id}/${Date.now()}-${file.name}`

      const { error } = await supabase.storage
        .from('item-photos')
        .upload(filePath, file)

      if (!error) {
        const { data } = supabase.storage
          .from('item-photos')
          .getPublicUrl(filePath)

        uploadedUrls.push(data.publicUrl)
      }
    }

    setForm(prev => ({
      ...prev,
      photos: [...(prev.photos || []), ...uploadedUrls]
    }))
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl w-full max-w-2xl p-6 shadow-lg overflow-y-auto max-h-[90vh]">

        <h2 className="text-xl font-semibold mb-4 text-slate-800">
          Edit Inventory Item
        </h2>

        <div className="space-y-4">

          <div>
            <label className="block text-sm font-medium">Name</label>
            <input
              value={form.name}
              onChange={e => setForm({ ...form, name: e.target.value })}
              className="w-full border rounded p-2"
            />
          </div>

          <div>
            <label className="block text-sm font-medium">Description</label>
            <textarea
              value={form.description || ''}
              onChange={e => setForm({ ...form, description: e.target.value })}
              className="w-full border rounded p-2"
            />
          </div>

          <div>
            <label className="block text-sm font-medium">Vendor</label>
            <input
              value={form.vendor || ''}
              onChange={e => setForm({ ...form, vendor: e.target.value })}
              className="w-full border rounded p-2"
            />
          </div>

          <div>
            <label className="block text-sm font-medium">Price</label>
            <input
              type="number"
              value={form.price ?? ''}
              onChange={e =>
                setForm({ ...form, price: Number(e.target.value) })
              }
              className="w-full border rounded p-2"
            />
          </div>

          <div>
            <label className="block text-sm font-medium">Category</label>
            <select
              value={form.category_id || ''}
              onChange={e =>
                setForm({ ...form, category_id: e.target.value })
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

          <div>
            <label className="block text-sm font-medium">Warranty Expiration</label>
            <input
              type="date"
              value={form.warranty_expiration || ''}
              onChange={e =>
                setForm({
                  ...form,
                  warranty_expiration: e.target.value
                })
              }
              className="w-full border rounded p-2"
            />
          </div>

          <div>
            <label className="block text-sm font-medium">Depreciation (Years)</label>
            <input
              type="number"
              value={form.depreciation_years ?? ''}
              onChange={e =>
                setForm({
                  ...form,
                  depreciation_years: Number(e.target.value)
                })
              }
              className="w-full border rounded p-2"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">Photos</label>
            <input
              type="file"
              multiple
              onChange={e => handlePhotoUpload(e.target.files)}
            />

            <div className="flex flex-wrap gap-2 mt-3">
              {form.photos?.map((url, idx) => (
                <img
                  key={idx}
                  src={url}
                  className="w-20 h-20 object-cover rounded border"
                />
              ))}
            </div>
          </div>

        </div>

        <div className="flex justify-end gap-3 mt-6">
          <button
            onClick={onClose}
            className="px-4 py-2 border rounded"
          >
            Cancel
          </button>

          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-2 bg-indigo-600 text-white rounded"
          >
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>

      </div>
    </div>
  )
}
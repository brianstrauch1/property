'use client'

import { useEffect, useState } from 'react'
import { supabaseBrowser } from '@/lib/supabase-browser'

export type InventoryItem = {
  id: string
  name: string
  property_id: string
  location_id: string | null

  description?: string | null
  vendor?: string | null
  price?: number | null

  category?: string | null
  category_id?: string | null

  photos?: string[] | null

  created_at?: string
  updated_at?: string
}

type Category = { id: string; name: string }

interface Props {
  item: InventoryItem
  onClose: () => void
  onUpdated: (updated: InventoryItem) => void
  onDeleted?: (id: string) => void
}

export default function EditItemModal({ item, onClose, onUpdated, onDeleted }: Props) {
  const supabase = supabaseBrowser()

  const [form, setForm] = useState<InventoryItem>(item)
  const [categories, setCategories] = useState<Category[]>([])
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    loadCategories()
  }, [])

  async function loadCategories() {
    const { data } = await supabase.from('categories').select('id,name').order('name')
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
        purchase_date: form.purchase_date,
        warranty_expiration: form.warranty_expiration,
        depreciation_years: form.depreciation_years,
        photos: form.photos
      })
      .eq('id', form.id)
      .select()
      .single()

    setSaving(false)

    if (error) {
      alert(error.message)
      return
    }

    if (data) {
      onUpdated(data as InventoryItem)
      onClose()
    }
  }

  async function handleDelete() {
    if (!confirm('Delete this item? This cannot be undone.')) return

    setDeleting(true)
    const { error } = await supabase.from('items').delete().eq('id', form.id)
    setDeleting(false)

    if (error) {
      alert(error.message)
      return
    }

    onDeleted?.(form.id)
    onClose()
  }

  async function handlePhotoUpload(files: FileList | null) {
    if (!files) return

    const uploadedUrls: string[] = []

    for (const file of Array.from(files)) {
      const filePath = `${form.id}/${Date.now()}-${file.name}`
      const { error } = await supabase.storage.from('item-photos').upload(filePath, file)
      if (error) {
        alert(error.message)
        return
      }
      const { data } = supabase.storage.from('item-photos').getPublicUrl(filePath)
      uploadedUrls.push(data.publicUrl)
    }

    setForm(prev => ({
      ...prev,
      photos: [...(prev.photos || []), ...uploadedUrls]
    }))
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl w-full max-w-2xl p-6 shadow-lg overflow-y-auto max-h-[90vh]">
        <h2 className="text-xl font-semibold mb-4 text-slate-800">Edit Inventory Item</h2>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium">Name</label>
            <input
              value={form.name}
              onChange={e => setForm({ ...form, name: e.target.value })}
              className="w-full border rounded p-2"
              placeholder="Item name"
            />
          </div>

          <div>
            <label className="block text-sm font-medium">Description</label>
            <textarea
              value={form.description || ''}
              onChange={e => setForm({ ...form, description: e.target.value })}
              className="w-full border rounded p-2"
              placeholder="Notes / details"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium">Vendor</label>
              <input
                value={form.vendor || ''}
                onChange={e => setForm({ ...form, vendor: e.target.value })}
                className="w-full border rounded p-2"
                placeholder="Vendor"
              />
            </div>

            <div>
              <label className="block text-sm font-medium">Price</label>
              <input
                type="number"
                value={form.price ?? ''}
                onChange={e => setForm({ ...form, price: Number(e.target.value) })}
                className="w-full border rounded p-2"
                placeholder="0.00"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium">Category</label>
            <select
              value={form.category_id || ''}
              onChange={e => setForm({ ...form, category_id: e.target.value })}
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

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="block text-sm font-medium">Purchase Date</label>
              <input
                type="date"
                value={form.purchase_date || ''}
                onChange={e => setForm({ ...form, purchase_date: e.target.value })}
                className="w-full border rounded p-2"
              />
            </div>

            <div>
              <label className="block text-sm font-medium">Warranty Expiration</label>
              <input
                type="date"
                value={form.warranty_expiration || ''}
                onChange={e => setForm({ ...form, warranty_expiration: e.target.value })}
                className="w-full border rounded p-2"
              />
            </div>

            <div>
              <label className="block text-sm font-medium">Depreciation (Years)</label>
              <input
                type="number"
                value={form.depreciation_years ?? ''}
                onChange={e => setForm({ ...form, depreciation_years: Number(e.target.value) })}
                className="w-full border rounded p-2"
                placeholder="e.g. 5"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">Photos</label>
            <input type="file" multiple accept="image/*" onChange={e => handlePhotoUpload(e.target.files)} />

            <div className="flex flex-wrap gap-2 mt-3">
              {form.photos?.map((url, idx) => (
                <img key={idx} src={url} className="w-20 h-20 object-cover rounded border" />
              ))}
            </div>
          </div>
        </div>

        <div className="flex justify-between gap-3 mt-6">
          <button
            onClick={handleDelete}
            disabled={deleting}
            className="text-red-600 font-semibold"
          >
            {deleting ? 'Deleting...' : 'Delete'}
          </button>

          <div className="flex gap-3">
            <button onClick={onClose} className="px-4 py-2 border rounded">
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
    </div>
  )
}
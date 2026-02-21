'use client'

import { useEffect, useState } from 'react'
import { supabaseBrowser } from '@/lib/supabase-browser'

type Category = {
  id: string
  name: string
  property_id: string
}

export default function SettingsPage() {
  const supabase = supabaseBrowser()

  const [propertyId, setPropertyId] = useState<string | null>(null)
  const [categories, setCategories] = useState<Category[]>([])
  const [newCategory, setNewCategory] = useState('')

  useEffect(() => {
    const init = async () => {
      const { data: prop } = await supabase
        .from('properties')
        .select('id')
        .limit(1)
        .single()

      if (!prop?.id) return
      setPropertyId(prop.id)

      const { data } = await supabase
        .from('categories')
        .select('*')
        .eq('property_id', prop.id)

      setCategories(data ?? [])
    }

    init()
  }, [])

  const addCategory = async () => {
    if (!propertyId || !newCategory.trim()) return

    const { data, error } = await supabase
      .from('categories')
      .insert({
        name: newCategory.trim(),
        property_id: propertyId
      })
      .select('*')
      .single()

    if (error) return alert(error.message)

    setCategories(prev => [...prev, data])
    setNewCategory('')
  }

  const deleteCategory = async (id: string) => {
    await supabase.from('categories').delete().eq('id', id)
    setCategories(prev => prev.filter(c => c.id !== id))
  }

  return (
    <main className="bg-white p-6 rounded-xl shadow-md">
      <h1 className="text-2xl font-bold mb-6">Settings</h1>

      <h2 className="font-semibold mb-3">Categories</h2>

      <div className="flex gap-2 mb-4">
        <input
          value={newCategory}
          onChange={(e) => setNewCategory(e.target.value)}
          placeholder="New category"
          className="border rounded px-3 py-2"
        />
        <button
          onClick={addCategory}
          className="bg-indigo-600 text-white px-3 py-2 rounded"
        >
          Add
        </button>
      </div>

      <div className="space-y-2">
        {categories.map(cat => (
          <div
            key={cat.id}
            className="flex justify-between items-center border p-2 rounded"
          >
            <span>{cat.name}</span>
            <button
              onClick={() => deleteCategory(cat.id)}
              className="text-red-600 text-sm"
            >
              Delete
            </button>
          </div>
        ))}
      </div>
    </main>
  )
}
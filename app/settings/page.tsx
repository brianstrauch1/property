'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabaseBrowser } from '@/lib/supabase-browser'

type Category = {
  id: string
  name: string
}

export default function SettingsPage() {
  const supabase = supabaseBrowser()
  const router = useRouter()

  const [property, setProperty] = useState<any>(null)
  const [name, setName] = useState('')
  const [address, setAddress] = useState('')
  const [status, setStatus] = useState('')

  const [categories, setCategories] = useState<Category[]>([])
  const [newCategory, setNewCategory] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingValue, setEditingValue] = useState('')

  useEffect(() => {
    const init = async () => {
      const { data: userData } = await supabase.auth.getUser()
      if (!userData.user) {
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
      setName(prop.name)
      setAddress(prop.address)

      const { data: cats } = await supabase
        .from('categories')
        .select('*')
        .eq('property_id', prop.id)
        .order('name')

      setCategories(cats ?? [])
    }

    init()
  }, [])

  const saveProperty = async () => {
    if (!property) return

    setStatus('Saving...')

    const { error } = await supabase
      .from('properties')
      .update({
        name: name.trim(),
        address: address.trim()
      })
      .eq('id', property.id)

    if (error) {
      setStatus(error.message)
      return
    }

    setStatus('Saved ✓')
    setTimeout(() => setStatus(''), 1500)
  }

  const createCategory = async () => {
    if (!newCategory.trim() || !property) return

    const { data, error } = await supabase
      .from('categories')
      .insert([
        {
          property_id: property.id,
          name: newCategory.trim()
        }
      ])
      .select()
      .single()

    if (error) {
      alert(error.message)
      return
    }

    setCategories(prev => [...prev, data])
    setNewCategory('')
  }

  const updateCategory = async (id: string) => {
    const { error } = await supabase
      .from('categories')
      .update({ name: editingValue.trim() })
      .eq('id', id)

    if (error) {
      alert(error.message)
      return
    }

    setCategories(prev =>
      prev.map(c => (c.id === id ? { ...c, name: editingValue } : c))
    )

    setEditingId(null)
    setEditingValue('')
  }

  const deleteCategory = async (id: string) => {
    const { count } = await supabase
      .from('items')
      .select('*', { count: 'exact', head: true })
      .eq('category', categories.find(c => c.id === id)?.name)

    if (count && count > 0) {
      alert('Cannot delete category in use.')
      return
    }

    if (!confirm('Delete category?')) return

    await supabase.from('categories').delete().eq('id', id)
    setCategories(prev => prev.filter(c => c.id !== id))
  }

  if (!property) return <div className="p-8">Loading...</div>

  return (
    <main className="min-h-screen bg-slate-100 p-8">
      <TopNav />

      {/* Property Info */}
      <div className="bg-white p-6 rounded-xl shadow-md mb-6">
        <h1 className="text-2xl font-bold mb-4">Property Settings</h1>

        <div className="space-y-3">
          <input
            className="border p-2 rounded w-full"
            value={name}
            onChange={e => setName(e.target.value)}
          />

          <input
            className="border p-2 rounded w-full"
            value={address}
            onChange={e => setAddress(e.target.value)}
          />

          <button
            onClick={saveProperty}
            className="bg-indigo-600 text-white px-4 py-2 rounded"
          >
            Save
          </button>

          {status && (
            <div className="text-sm text-slate-600">{status}</div>
          )}
        </div>
      </div>

      {/* Category Management */}
      <div className="bg-white p-6 rounded-xl shadow-md">
        <h2 className="text-xl font-semibold mb-4">Inventory Categories</h2>

        <div className="flex gap-2 mb-4">
          <input
            className="border p-2 rounded w-full"
            placeholder="New category"
            value={newCategory}
            onChange={e => setNewCategory(e.target.value)}
          />
          <button
            onClick={createCategory}
            className="bg-indigo-600 text-white px-4 py-2 rounded"
          >
            Add
          </button>
        </div>

        <div className="space-y-2">
          {categories.map(cat => (
            <div
              key={cat.id}
              className="border rounded p-3 flex justify-between items-center"
            >
              {editingId === cat.id ? (
                <>
                  <input
                    className="border p-2 rounded w-full mr-3"
                    value={editingValue}
                    onChange={e => setEditingValue(e.target.value)}
                  />
                  <button
                    onClick={() => updateCategory(cat.id)}
                    className="text-indigo-600 mr-3"
                  >
                    Save
                  </button>
                </>
              ) : (
                <>
                  <span>{cat.name}</span>
                  <div className="flex gap-3 text-sm">
                    <button
                      onClick={() => {
                        setEditingId(cat.id)
                        setEditingValue(cat.name)
                      }}
                      className="text-indigo-600"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => deleteCategory(cat.id)}
                      className="text-red-600"
                    >
                      Delete
                    </button>
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      </div>
    </main>
  )
}

function TopNav() {
  return (
    <div className="flex gap-4 mb-6">
      <Link href="/dashboard">Locations</Link>
      <Link href="/inventory">Inventory</Link>
      <Link href="/settings" className="font-semibold">Settings</Link>
    </div>
  )
}
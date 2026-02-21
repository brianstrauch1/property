'use client'

import { useEffect, useMemo, useState } from 'react'
import { supabaseBrowser } from '@/lib/supabase-browser'

type PropertyRow = {
  id: string
  name?: string | null
  address?: string | null
}

type Category = {
  id: string
  name: string
  property_id: string
}

export default function SettingsPage() {
  const supabase = supabaseBrowser()

  const [property, setProperty] = useState<PropertyRow | null>(null)

  // property details form
  const [propName, setPropName] = useState('')
  const [propAddress, setPropAddress] = useState('')
  const [savingProp, setSavingProp] = useState(false)

  // categories
  const [categories, setCategories] = useState<Category[]>([])
  const [newCategory, setNewCategory] = useState('')
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null)
  const [editingCategoryName, setEditingCategoryName] = useState('')

  const loadAll = async () => {
    const { data: prop } = await supabase
      .from('properties')
      .select('id, name, address')
      .limit(1)
      .single()

    if (!prop?.id) return
    setProperty(prop as PropertyRow)
    setPropName((prop as any).name ?? '')
    setPropAddress((prop as any).address ?? '')

    const { data: cats } = await supabase
      .from('categories')
      .select('*')
      .eq('property_id', prop.id)
      .order('name', { ascending: true })

    setCategories((cats ?? []) as Category[])
  }

  useEffect(() => {
    loadAll()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /* ---------------- PROPERTY DETAILS ---------------- */

  const saveProperty = async () => {
    if (!property?.id) return
    setSavingProp(true)
    try {
      const { error } = await supabase
        .from('properties')
        .update({
          name: propName.trim() || null,
          address: propAddress.trim() || null
        })
        .eq('id', property.id)

      if (error) return alert(error.message)
      await loadAll()
    } finally {
      setSavingProp(false)
    }
  }

  /* ---------------- CATEGORIES ---------------- */

  const addCategory = async () => {
    if (!property?.id) return
    const name = newCategory.trim()
    if (!name) return

    const { data, error } = await supabase
      .from('categories')
      .insert({ name, property_id: property.id })
      .select('*')
      .single()

    if (error) return alert(error.message)

    setCategories(prev => [...prev, data as Category].sort((a, b) => a.name.localeCompare(b.name)))
    setNewCategory('')
  }

  const beginRenameCategory = (cat: Category) => {
    setEditingCategoryId(cat.id)
    setEditingCategoryName(cat.name)
  }

  const commitRenameCategory = async () => {
    if (!editingCategoryId) return
    const name = editingCategoryName.trim()
    if (!name) return

    const { error } = await supabase.from('categories').update({ name }).eq('id', editingCategoryId)
    if (error) return alert(error.message)

    setCategories(prev => prev.map(c => (c.id === editingCategoryId ? { ...c, name } : c)).sort((a, b) => a.name.localeCompare(b.name)))
    setEditingCategoryId(null)
    setEditingCategoryName('')
  }

  const deleteCategory = async (cat: Category) => {
    if (!property?.id) return

    // block delete if category is referenced by any items
    const { count, error: countErr } = await supabase
      .from('items')
      .select('id', { count: 'exact', head: true })
      .eq('property_id', property.id)
      .eq('category_id', cat.id)

    if (countErr) return alert(countErr.message)
    if ((count ?? 0) > 0) {
      return alert(`Cannot delete category. It is used by ${count} inventory item(s).`)
    }

    if (!confirm(`Delete category "${cat.name}"?`)) return

    const { error } = await supabase.from('categories').delete().eq('id', cat.id)
    if (error) return alert(error.message)

    setCategories(prev => prev.filter(c => c.id !== cat.id))
  }

  const sections = useMemo(
    () => [
      { key: 'property', title: 'Property Details' },
      { key: 'categories', title: 'Item Categories' },
      { key: 'financial', title: 'Financial Defaults' },
      { key: 'access', title: 'Access & Roles' }
    ],
    []
  )

  if (!property) return <div className="p-8">Loading...</div>

  return (
    <main className="space-y-6">
      <div className="bg-white p-6 rounded-xl shadow-md">
        <h1 className="text-2xl font-bold text-slate-900 mb-2">Settings</h1>
        <div className="text-sm text-slate-500">Enterprise-style sections for configuration and governance.</div>

        <div className="mt-4 flex flex-wrap gap-2">
          {sections.map(s => (
            <span key={s.key} className="text-xs bg-slate-100 text-slate-700 px-2 py-1 rounded-full">
              {s.title}
            </span>
          ))}
        </div>
      </div>

      {/* Property Details */}
      <div className="bg-white p-6 rounded-xl shadow-md">
        <h2 className="text-lg font-bold text-slate-900 mb-4">Property Details</h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Property Name</label>
            <input
              value={propName}
              onChange={(e) => setPropName(e.target.value)}
              className="w-full border rounded-lg px-3 py-2"
              placeholder="e.g., Household"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Address</label>
            <input
              value={propAddress}
              onChange={(e) => setPropAddress(e.target.value)}
              className="w-full border rounded-lg px-3 py-2"
              placeholder="Street, City, State Zip"
            />
          </div>
        </div>

        <div className="mt-4 flex justify-end">
          <button
            className={[
              'px-3 py-2 rounded-lg text-sm',
              savingProp ? 'bg-slate-200 text-slate-500' : 'bg-indigo-600 text-white hover:bg-indigo-700'
            ].join(' ')}
            onClick={saveProperty}
            disabled={savingProp}
          >
            Save Property Details
          </button>
        </div>
      </div>

      {/* Item Categories */}
      <div className="bg-white p-6 rounded-xl shadow-md">
        <h2 className="text-lg font-bold text-slate-900 mb-4">Item Categories</h2>

        <div className="flex flex-col md:flex-row gap-2 mb-4">
          <input
            value={newCategory}
            onChange={(e) => setNewCategory(e.target.value)}
            className="border rounded-lg px-3 py-2 flex-1"
            placeholder="Add a new category (e.g., Appliances)"
          />
          <button className="bg-indigo-600 text-white px-3 py-2 rounded-lg" onClick={addCategory}>
            Add Category
          </button>
        </div>

        <div className="space-y-2">
          {categories.map(cat => {
            const editing = editingCategoryId === cat.id
            return (
              <div key={cat.id} className="flex items-center justify-between border rounded-lg px-3 py-2">
                {!editing ? (
                  <div className="font-medium text-slate-900">{cat.name}</div>
                ) : (
                  <input
                    autoFocus
                    value={editingCategoryName}
                    onChange={(e) => setEditingCategoryName(e.target.value)}
                    onBlur={commitRenameCategory}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') commitRenameCategory()
                      if (e.key === 'Escape') {
                        setEditingCategoryId(null)
                        setEditingCategoryName('')
                      }
                    }}
                    className="border rounded px-2 py-1 w-64"
                  />
                )}

                <div className="flex items-center gap-2">
                  {!editing ? (
                    <button className="text-indigo-700 text-sm font-semibold" onClick={() => beginRenameCategory(cat)}>
                      Rename
                    </button>
                  ) : (
                    <button className="text-indigo-700 text-sm font-semibold" onClick={commitRenameCategory}>
                      Save
                    </button>
                  )}

                  <button className="text-red-600 text-sm font-semibold" onClick={() => deleteCategory(cat)}>
                    Delete
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Financial Defaults (placeholder-ready) */}
      <div className="bg-white p-6 rounded-xl shadow-md">
        <h2 className="text-lg font-bold text-slate-900 mb-2">Financial Defaults</h2>
        <div className="text-sm text-slate-600 mb-4">
          Coming next: default depreciation years, warranty default months, currency display rules.
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Default Depreciation (years)</label>
            <input className="w-full border rounded-lg px-3 py-2" placeholder="e.g., 5" disabled />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Default Warranty (months)</label>
            <input className="w-full border rounded-lg px-3 py-2" placeholder="e.g., 12" disabled />
          </div>
        </div>
      </div>

      {/* Access & Roles (placeholder-ready) */}
      <div className="bg-white p-6 rounded-xl shadow-md">
        <h2 className="text-lg font-bold text-slate-900 mb-2">Access & Roles</h2>
        <div className="text-sm text-slate-600">
          Coming next: property members, invitations, role-based access (Owner/Admin/Editor/Viewer).
        </div>
      </div>
    </main>
  )
}
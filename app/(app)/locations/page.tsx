'use client'

import React, { useEffect, useMemo, useState } from 'react'
import { supabaseBrowser } from '@/lib/supabase-browser'

import {
  DndContext,
  DragEndEvent,
  DragOverEvent,
  PointerSensor,
  useSensor,
  useSensors,
  closestCenter,
  useDroppable
} from '@dnd-kit/core'

import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  arrayMove
} from '@dnd-kit/sortable'

import { CSS } from '@dnd-kit/utilities'

type LocationRow = {
  id: string
  name: string
  parent_id: string | null
  sort_order: number | null
  property_id: string
}

type ItemRow = {
  id: string
  location_id: string
}

function cx(...c: (string | false | undefined)[]) {
  return c.filter(Boolean).join(' ')
}

export default function LocationsPage() {
  const supabase = supabaseBrowser()

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } })
  )

  const [propertyId, setPropertyId] = useState<string | null>(null)
  const [locations, setLocations] = useState<LocationRow[]>([])
  const [items, setItems] = useState<ItemRow[]>([])
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const [dragOverId, setDragOverId] = useState<string | null>(null)

  useEffect(() => {
    init()
  }, [])

  async function init() {
    const { data: prop } = await supabase
      .from('properties')
      .select('id')
      .limit(1)
      .single()

    if (!prop?.id) return
    setPropertyId(prop.id)

    const { data: locs } = await supabase
      .from('locations')
      .select('*')
      .eq('property_id', prop.id)
      .order('parent_id')
      .order('sort_order')

    const { data: inv } = await supabase
      .from('items')
      .select('id,location_id')
      .eq('property_id', prop.id)

    setLocations((locs ?? []) as LocationRow[])
    setItems((inv ?? []) as ItemRow[])
  }

  const childrenMap = useMemo(() => {
    const map = new Map<string | null, LocationRow[]>()
    for (const l of locations) {
      const key = l.parent_id ?? null
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(l)
    }
    for (const arr of map.values()) {
      arr.sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
    }
    return map
  }, [locations])

  function getChildren(parentId: string | null) {
    return childrenMap.get(parentId ?? null) ?? []
  }

  function getAllDescendants(id: string): string[] {
    const result: string[] = []
    const stack = [id]
    while (stack.length) {
      const cur = stack.pop()!
      const kids = getChildren(cur)
      for (const k of kids) {
        result.push(k.id)
        stack.push(k.id)
      }
    }
    return result
  }

  const itemCounts = useMemo(() => {
    const map = new Map<string, number>()
    for (const loc of locations) {
      const ids = [loc.id, ...getAllDescendants(loc.id)]
      const count = items.filter(i => ids.includes(i.location_id)).length
      map.set(loc.id, count)
    }
    return map
  }, [locations, items])

  async function reorder(parentId: string | null, activeId: string, overId: string) {
    if (!propertyId) return

    const siblings = getChildren(parentId)
    const oldIndex = siblings.findIndex(s => s.id === activeId)
    const newIndex = siblings.findIndex(s => s.id === overId)
    if (oldIndex < 0 || newIndex < 0) return

    const moved = arrayMove(siblings, oldIndex, newIndex)

    for (let i = 0; i < moved.length; i++) {
      await supabase
        .from('locations')
        .update({ sort_order: i + 1 })
        .eq('id', moved[i].id)
    }

    await init()
  }

  async function reparent(activeId: string, newParentId: string | null) {
    if (!propertyId) return

    const siblings = getChildren(newParentId)
    const maxSort = siblings.reduce((m, s) => Math.max(m, s.sort_order ?? 0), 0)

    await supabase
      .from('locations')
      .update({
        parent_id: newParentId,
        sort_order: maxSort + 1
      })
      .eq('id', activeId)

    await init()
  }

  function onDragOver(e: DragOverEvent) {
    setDragOverId((e.over?.id as string) ?? null)
  }

  async function onDragEnd(e: DragEndEvent) {
    setDragOverId(null)
    const activeId = e.active.id as string
    const overId = e.over?.id as string | undefined
    if (!overId) return

    const active = locations.find(l => l.id === activeId)
    const over = locations.find(l => l.id === overId)
    if (!active || !over) return

    if (active.parent_id === over.parent_id) {
      await reorder(active.parent_id ?? null, activeId, overId)
    } else {
      await reparent(activeId, overId)
    }
  }

  function toggle(id: string) {
    setExpanded(prev => ({ ...prev, [id]: !prev[id] }))
  }

  if (!propertyId) return null

  return (
    <main className="max-w-5xl mx-auto p-6">
      <h1 className="text-2xl font-semibold mb-6">Locations</h1>

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragOver={onDragOver}
        onDragEnd={onDragEnd}
      >
        <SortableContext
          items={locations.map(l => l.id)}
          strategy={verticalListSortingStrategy}
        >
          {getChildren(null).map(loc => (
            <TreeNode
              key={loc.id}
              node={loc}
              depth={0}
              expanded={expanded}
              toggle={toggle}
              getChildren={getChildren}
              itemCounts={itemCounts}
              dragOverId={dragOverId}
            />
          ))}
        </SortableContext>
      </DndContext>
    </main>
  )
}

function TreeNode({
  node,
  depth,
  expanded,
  toggle,
  getChildren,
  itemCounts,
  dragOverId
}: any) {
  const { attributes, listeners, setNodeRef, transform, transition } =
    useSortable({ id: node.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition
  }

  const children = getChildren(node.id)

  return (
    <div ref={setNodeRef} style={style}>
      <div
        className={cx(
          'flex items-center justify-between px-3 py-2 rounded-lg border-l-4',
          depth === 0 && 'border-indigo-600',
          depth === 1 && 'border-indigo-400 bg-indigo-50',
          depth === 2 && 'border-sky-400 bg-sky-50',
          depth >= 3 && 'border-slate-300 bg-slate-50',
          dragOverId === node.id && 'ring-2 ring-indigo-300'
        )}
        style={{ marginLeft: depth * 16 }}
      >
        <div className="flex items-center gap-2">
          <button onClick={() => toggle(node.id)}>
            {children.length ? (expanded[node.id] ? '▾' : '▸') : '•'}
          </button>

          <span className="font-medium">
            {node.name}{' '}
            <span className="text-slate-500">({itemCounts.get(node.id) ?? 0})</span>
          </span>
        </div>

        <div
          {...attributes}
          {...listeners}
          className="cursor-grab text-slate-400"
        >
          ☰
        </div>
      </div>

      {expanded[node.id] &&
        children.map((child: any) => (
          <TreeNode
            key={child.id}
            node={child}
            depth={depth + 1}
            expanded={expanded}
            toggle={toggle}
            getChildren={getChildren}
            itemCounts={itemCounts}
            dragOverId={dragOverId}
          />
        ))}
    </div>
  )
}
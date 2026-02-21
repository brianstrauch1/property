'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ReactNode } from 'react'

export default function AppLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname()

  const navItems = [
    { label: 'Locations', href: '/locations' },
    { label: 'Inventory', href: '/inventory' },
    { label: 'Analytics', href: '/analytics' },
    { label: 'Settings', href: '/settings' }
  ]

  return (
    <div className="min-h-screen bg-slate-100">
      {/* Top Nav */}
      <div className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-8 py-4 flex items-center justify-between">
          <div className="text-xl font-bold text-slate-900">
            Property
          </div>

          <nav className="flex gap-6">
            {navItems.map(item => {
              const active = pathname.startsWith(item.href)
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={[
                    'text-sm font-medium transition-colors',
                    active
                      ? 'text-indigo-600 border-b-2 border-indigo-600 pb-1'
                      : 'text-slate-600 hover:text-slate-900'
                  ].join(' ')}
                >
                  {item.label}
                </Link>
              )
            })}
          </nav>
        </div>
      </div>

      {/* Page Content */}
      <div className="max-w-7xl mx-auto px-8 py-8">
        {children}
      </div>
    </div>
  )
}
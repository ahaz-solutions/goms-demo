import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { useAuthStore } from '../store/authStore'
import { useEffect, useState } from 'react'
import api from '../lib/api'
import {
  LayoutDashboard, ClipboardList, Plus, Users, BookOpen,
  LogOut, DollarSign, CreditCard
} from 'lucide-react'

export default function Layout() {
  const { user, logout } = useAuthStore()
  const navigate = useNavigate()
  const [pendingPayments, setPendingPayments] = useState(0)

  const canSeePricing = user?.role === 'admin' || user?.role === 'manager'
  const canSeePayments = user?.role === 'admin' || user?.role === 'manager'

  // Poll pending payment count every 60s for the badge
  useEffect(() => {
    if (!canSeePayments) return
    const fetch = () => {
      api.get('/payments/?status=pending')
        .then(res => {
          const data = res.data.results ?? res.data
          setPendingPayments(Array.isArray(data) ? data.length : 0)
        })
        .catch(() => {})
    }
    fetch()
    const interval = setInterval(fetch, 60_000)
    return () => clearInterval(interval)
  }, [canSeePayments])

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  const roleColors: Record<string, string> = {
    admin:      'bg-purple-100 text-purple-700',
    manager:    'bg-blue-100 text-blue-700',
    staff:      'bg-green-100 text-green-700',
    production: 'bg-orange-100 text-orange-700',
  }

  const navItems = [
    { to: '/staff/dashboard',  icon: LayoutDashboard, label: 'Dashboard'    },
    { to: '/staff/orders',     icon: ClipboardList,   label: 'Orders'       },
    { to: '/staff/orders/new', icon: Plus,            label: 'New Order'    },
    { to: '/staff/customers',  icon: Users,           label: 'Customers'    },
    { to: '/staff/catalog',    icon: BookOpen,        label: 'Glass Catalog'},
    { to: '/staff/pricing',    icon: DollarSign,      label: 'Pricing',     hideFor: ['production'] },
    { to: '/staff/payments',   icon: CreditCard,      label: 'Payments',    hideFor: ['production', 'staff'] },
  ]

  return (
    <div className="flex h-screen bg-gray-50">
      {/* Sidebar */}
      <aside className="w-64 bg-blue-900 text-white flex flex-col shadow-xl">
        {/* Logo */}
        <div className="p-6 border-b border-blue-800">
          <div className="flex items-center gap-3">
            <div>
              <h1 className="font-bold text-lg leading-tight">GOM System — Demo</h1>
              <p className="text-blue-400 text-xs">Glass Order Management</p>
            </div>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 p-4 space-y-1">
          {navItems.map(({ to, icon: Icon, label, hideFor }) => {
            if (hideFor?.includes(user?.role ?? '')) return null
            return (
              <NavLink
                key={to}
                to={to}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-all
                  ${isActive
                    ? 'bg-blue-500 text-white shadow-md'
                    : 'text-blue-200 hover:bg-blue-800 hover:text-white'
                  }`
                }
              >
                <Icon size={18} />
                <span className="flex-1">{label}</span>

                {/* Pending payments badge */}
                {to === '/staff/payments' && pendingPayments > 0 && (
                  <span className="bg-yellow-400 text-yellow-900 text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center">
                    {pendingPayments > 9 ? '9+' : pendingPayments}
                  </span>
                )}

                {/* View-only badge for staff on pricing */}
                {to === '/staff/pricing' && !canSeePricing && (
                  <span className="text-xs bg-blue-800 text-blue-300 px-1.5 py-0.5 rounded font-normal">
                    view
                  </span>
                )}
              </NavLink>
            )
          })}
        </nav>

        {/* User */}
        <div className="p-4 border-t border-blue-800">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-9 h-9 rounded-full bg-blue-500 flex items-center justify-center text-sm font-bold">
              {user?.full_name?.charAt(0).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{user?.full_name}</p>
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${roleColors[user?.role || 'staff']}`}>
                {user?.role}
              </span>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="flex items-center gap-2 text-blue-300 hover:text-white text-sm w-full px-2 py-1.5 rounded hover:bg-blue-800 transition-colors"
          >
            <LogOut size={16} />
            Sign Out
          </button>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
  )
}

import { useEffect, useState, useCallback } from 'react'
import { Link } from 'react-router-dom'
import api from '../lib/api'
import type { DashboardStats, Order, OrderStatus } from '../types'
import { statusLabel, statusColor, deadlineColor } from '../lib/orderUtils'
import { Plus, AlertTriangle, Clock, TrendingUp, CheckCircle, Zap, GripVertical, Lock, CreditCard } from 'lucide-react'
import { format, isAfter, parseISO, differenceInHours } from 'date-fns'
import toast from 'react-hot-toast'
import { useAuthStore } from '../store/authStore'

import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  useDroppable,
  useDraggable,
  type DragStartEvent,
  type DragEndEvent,
  type DragOverEvent,
} from '@dnd-kit/core'

// ── Role → which transitions they can perform ─────────────────────────────────
// Mirrors the backend TRANSITION_ROLES map exactly

type Role = 'admin' | 'manager' | 'staff' | 'production'

const ROLE_ALLOWED_TRANSITIONS: Record<Role, Partial<Record<OrderStatus, OrderStatus[]>>> = {
  admin: {
    confirmed:      ['cutting', 'on_hold', 'cancelled'],
    cutting:        ['tempering', 'qc', 'cancelled'],
    tempering:      ['qc', 'cancelled'],
    qc:             ['ready_dispatch', 'cutting', 'cancelled'],
    ready_dispatch: ['delivered'],
    on_hold:        ['confirmed', 'cancelled'],
  },
  manager: {
    confirmed:      ['cutting', 'on_hold', 'cancelled'],
    cutting:        ['tempering', 'qc', 'cancelled'],
    tempering:      ['qc', 'cancelled'],
    qc:             ['ready_dispatch', 'cutting', 'cancelled'],
    ready_dispatch: ['delivered'],
    on_hold:        ['confirmed', 'cancelled'],
  },
  production: {
    confirmed:  ['cutting'],
    cutting:    ['tempering', 'qc'],
    tempering:  ['qc'],
    qc:         ['ready_dispatch', 'cutting'],
  },
  staff: {}, // read-only — cannot move anything
}

function getAllowedTargets(role: Role, currentStatus: OrderStatus): OrderStatus[] {
  return ROLE_ALLOWED_TRANSITIONS[role]?.[currentStatus] ?? []
}

// ── Column config ────────────────────────────────────────────────────────────

const PIPELINE_COLS: { status: OrderStatus; color: string; dot: string }[] = [
  { status: 'confirmed',     color: 'border-t-blue-400',   dot: 'bg-blue-400'   },
  { status: 'cutting',       color: 'border-t-orange-400', dot: 'bg-orange-400' },
  { status: 'tempering',     color: 'border-t-purple-400', dot: 'bg-purple-400' },
  { status: 'qc',            color: 'border-t-indigo-400', dot: 'bg-indigo-400' },
  { status: 'ready_dispatch',color: 'border-t-cyan-400',   dot: 'bg-cyan-400'   },
]

// ── Draggable Order Card ──────────────────────────────────────────────────────

function OrderCard({
  order,
  isDragging = false,
  isOverlay = false,
  canDrag = true,
}: {
  order: Order
  isDragging?: boolean
  isOverlay?: boolean
  canDrag?: boolean
}) {
  const dl = parseISO(order.delivery_deadline)
  const now = new Date()
  const hoursLeft = differenceInHours(dl, now)
  const isOverdue = !isAfter(dl, now)
  const isApproaching = hoursLeft <= 48 && !isOverdue

  return (
    <div
      className={`bg-white rounded-lg border p-2.5 transition-all select-none
        ${isOverlay
          ? 'shadow-2xl ring-2 ring-blue-400 rotate-2 scale-105 border-blue-300'
          : isDragging
            ? 'opacity-40 border-dashed border-blue-300 bg-blue-50'
            : canDrag
              ? 'border-gray-200 hover:border-blue-300 hover:shadow-sm'
              : 'border-gray-200'
        }`}
    >
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs font-bold text-blue-700">{order.order_number}</span>
        <div className="flex items-center gap-1">
          {order.rush_flag && <Zap size={11} className="text-yellow-500" />}
          {canDrag
            ? <GripVertical size={12} className="text-gray-300" />
            : <Lock size={11} className="text-gray-200" />
          }
        </div>
      </div>
      <div className="text-xs text-gray-600 truncate font-medium">{order.customer_name}</div>
      <div className={`text-xs mt-1.5 font-semibold ${deadlineColor(order.delivery_deadline)}`}>
        {isOverdue ? '⚠ Overdue' : isApproaching ? '⏰ Due soon' : format(dl, 'MMM d')}
      </div>
    </div>
  )
}

// ── Draggable wrapper ─────────────────────────────────────────────────────────

function DraggableCard({
  order,
  validTargets,
  canDrag,
}: {
  order: Order
  validTargets: OrderStatus[]
  canDrag: boolean
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: String(order.id),
    data: { order, validTargets },
    disabled: !canDrag,
  })

  return (
    <div
      ref={setNodeRef}
      {...(canDrag ? listeners : {})}
      {...(canDrag ? attributes : {})}
      className={canDrag ? 'cursor-grab active:cursor-grabbing' : 'cursor-default'}
    >
      <OrderCard order={order} isDragging={isDragging} canDrag={canDrag} />
    </div>
  )
}

// ── Droppable Column ──────────────────────────────────────────────────────────

function KanbanColumn({
  status,
  color,
  dot,
  orders,
  isValidTarget,
  isOver,
  role,
}: {
  status: OrderStatus
  color: string
  dot: string
  orders: Order[]
  isValidTarget: boolean
  isOver: boolean
  role: Role
}) {
  const { setNodeRef } = useDroppable({ id: status })

  return (
    <div
      ref={setNodeRef}
      className={`flex flex-col rounded-xl border-t-4 bg-white shadow-sm transition-all
        ${color}
        ${isOver && isValidTarget ? 'ring-2 ring-blue-400 shadow-lg scale-[1.01]' : ''}
        ${isOver && !isValidTarget ? 'ring-2 ring-red-300' : ''}
      `}
    >
      {/* Column header */}
      <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full ${dot}`} />
          <span className="text-xs font-semibold text-gray-700 uppercase tracking-wide">
            {statusLabel(status)}
          </span>
        </div>
        <span className="bg-gray-100 text-gray-600 text-xs font-bold rounded-full w-6 h-6 flex items-center justify-center">
          {orders.length}
        </span>
      </div>

      {/* Drop zone */}
      <div
        className={`p-2.5 space-y-2 min-h-32 flex-1 rounded-b-xl transition-colors
          ${isOver && isValidTarget ? 'bg-blue-50' : ''}
          ${isOver && !isValidTarget ? 'bg-red-50' : ''}
        `}
      >
        {orders.map(order => {
          const allowedForThisCard = getAllowedTargets(role, order.status)
          const canDrag = allowedForThisCard.length > 0
          return (
            <DraggableCard
              key={order.id}
              order={order}
              validTargets={allowedForThisCard}
              canDrag={canDrag}
            />
          )
        })}
        {orders.length === 0 && !isOver && (
          <p className="text-xs text-gray-300 text-center py-6 select-none">Drop here</p>
        )}
        {isOver && isValidTarget && (
          <div className="border-2 border-dashed border-blue-300 rounded-lg h-14 flex items-center justify-center">
            <span className="text-xs text-blue-400 font-medium">Move to {statusLabel(status)}</span>
          </div>
        )}
        {isOver && !isValidTarget && (
          <div className="border-2 border-dashed border-red-300 rounded-lg h-14 flex items-center justify-center">
            <span className="text-xs text-red-400 font-medium">Not permitted</span>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Main Dashboard ────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const user = useAuthStore(s => s.user)
  const role = (user?.role ?? 'staff') as Role

  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [orders, setOrders] = useState<Order[]>([])
  const [loading, setLoading] = useState(true)
  const [activeOrder, setActiveOrder] = useState<Order | null>(null)
  const [overId, setOverId] = useState<string | null>(null)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } })
  )

  const loadData = useCallback(() => {
    Promise.all([
      api.get('/orders/dashboard_stats/'),
      api.get('/orders/?ordering=-created_at'),
    ]).then(([statsRes, ordersRes]) => {
      setStats(statsRes.data)
      const ordersData = ordersRes.data
      setOrders(Array.isArray(ordersData) ? ordersData : (ordersData?.results ?? []))
    }).finally(() => setLoading(false))
  }, [])

  useEffect(() => { loadData() }, [loadData])

  const handleDragStart = (event: DragStartEvent) => {
    const order = orders.find(o => String(o.id) === event.active.id)
    if (order) setActiveOrder(order)
  }

  const handleDragOver = (event: DragOverEvent) => {
    setOverId(event.over?.id ? String(event.over.id) : null)
  }

  const handleDragEnd = async (event: DragEndEvent) => {
    setActiveOrder(null)
    setOverId(null)

    const { active, over } = event
    if (!over) return

    const order = orders.find(o => String(o.id) === active.id)
    const targetStatus = String(over.id) as OrderStatus
    if (!order || order.status === targetStatus) return

    const allowed = getAllowedTargets(role, order.status)
    if (!allowed.includes(targetStatus)) {
      toast.error(`Your role cannot move orders from ${statusLabel(order.status)} → ${statusLabel(targetStatus)}`)
      return
    }

    // Optimistic update
    setOrders(prev =>
      prev.map(o => o.id === order.id ? { ...o, status: targetStatus } : o)
    )

    try {
      await api.post(`/orders/${order.id}/update_status/`, {
        status: targetStatus,
        remarks: `Status updated via dashboard pipeline`,
      })
      toast.success(`${order.order_number} → ${statusLabel(targetStatus)}`)
      api.get('/orders/dashboard_stats/').then(r => setStats(r.data))
    } catch (e: unknown) {
      setOrders(prev =>
        prev.map(o => o.id === order.id ? { ...o, status: order.status } : o)
      )
      const err = e as { response?: { data?: { error?: string } } }
      toast.error(err.response?.data?.error || 'Failed to update status')
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600" />
      </div>
    )
  }

  const statCards = [
    { label: 'Total Orders',       value: stats?.total_orders ?? 0,                    icon: TrendingUp,   color: 'text-blue-600',   bg: 'bg-blue-50'   },
    { label: 'In Cutting',         value: stats?.cutting ?? 0,                         icon: Clock,        color: 'text-orange-600', bg: 'bg-orange-50' },
    { label: 'In Tempering',       value: stats?.tempering ?? 0,                       icon: Clock,        color: 'text-purple-600', bg: 'bg-purple-50' },
    { label: 'Delivered',          value: stats?.delivered ?? 0,                       icon: CheckCircle,  color: 'text-green-600',  bg: 'bg-green-50'  },
    { label: 'Rush Orders',        value: stats?.rush_orders ?? 0,                     icon: Zap,          color: 'text-yellow-600', bg: 'bg-yellow-50' },
    { label: 'Overdue',            value: stats?.overdue ?? 0,                         icon: AlertTriangle,color: 'text-red-600',    bg: 'bg-red-50'    },
    { label: 'Pending Payments',   value: stats?.pending_payment_verifications ?? 0,   icon: CreditCard,   color: 'text-pink-600',   bg: 'bg-pink-50',  link: '/staff/payments' },
  ]

  const activeValidTargets = activeOrder
    ? getAllowedTargets(role, activeOrder.status)
    : []

  // Staff see a read-only notice above the pipeline
  const isDragEnabled = role !== 'staff'

  return (
    <div className="p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
          <p className="text-gray-500 text-sm mt-1">{format(new Date(), 'EEEE, MMMM d, yyyy')}</p>
        </div>
        <Link
          to="/staff/orders/new"
          className="flex items-center gap-2 bg-blue-600 text-white px-5 py-2.5 rounded-lg font-medium hover:bg-blue-700 transition-colors shadow-sm"
        >
          <Plus size={18} />
          New Order
        </Link>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4 mb-8">
        {statCards.map(({ label, value, icon: Icon, color, bg, link }) => {
          const card = (
            <div className={`bg-white rounded-xl p-4 shadow-sm border transition-all ${link ? 'hover:shadow-md hover:border-blue-200 cursor-pointer' : 'border-gray-100'}`}>
              <div className={`inline-flex p-2 rounded-lg ${bg} mb-3`}>
                <Icon size={18} className={color} />
              </div>
              <div className="text-2xl font-bold text-gray-900">{value}</div>
              <div className="text-xs text-gray-500 mt-0.5">{label}</div>
            </div>
          )
          return link
            ? <Link key={label} to={link}>{card}</Link>
            : <div key={label}>{card}</div>
        })}
      </div>

      {/* Drag & Drop Pipeline */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-800">Order Pipeline</h2>
          {isDragEnabled ? (
            <span className="text-xs text-gray-400 flex items-center gap-1.5">
              <GripVertical size={13} />
              Drag cards to advance order status
            </span>
          ) : (
            <span className="text-xs text-amber-600 bg-amber-50 border border-amber-200 px-3 py-1.5 rounded-lg flex items-center gap-1.5 font-medium">
              <Lock size={12} />
              Counter Staff — view only. Status changes are handled by Production and Management.
            </span>
          )}
        </div>

        <DndContext
          sensors={sensors}
          onDragStart={handleDragStart}
          onDragOver={handleDragOver}
          onDragEnd={handleDragEnd}
        >
          <div className="grid grid-cols-5 gap-3">
            {PIPELINE_COLS.map(({ status, color, dot }) => {
              const colOrders = orders.filter(o => o.status === status)
              const isOver = overId === status
              const isValidTarget = activeOrder
                ? activeValidTargets.includes(status)
                : true

              return (
                <KanbanColumn
                  key={status}
                  status={status}
                  color={color}
                  dot={dot}
                  orders={colOrders}
                  isValidTarget={isValidTarget}
                  isOver={isOver}
                  role={role}
                />
              )
            })}
          </div>

          {/* Drag overlay — floating card following the cursor */}
          <DragOverlay dropAnimation={{
            duration: 150,
            easing: 'cubic-bezier(0.18, 0.67, 0.6, 1.22)',
          }}>
            {activeOrder && (
              <div className="w-44">
                <OrderCard order={activeOrder} isOverlay />
              </div>
            )}
          </DragOverlay>
        </DndContext>
      </div>

      {/* Recent Orders Table */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-800">Recent Orders</h2>
          <Link to="/staff/orders" className="text-blue-600 text-sm hover:underline">View all →</Link>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Order #</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Customer</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Deadline</th>
                <th className="px-6 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {orders.slice(0, 8).map(order => (
                <tr key={order.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-6 py-4">
                    <Link to={`/staff/orders/${order.id}`} className="font-medium text-blue-700 hover:underline flex items-center gap-1">
                      {order.order_number}
                      {order.rush_flag && <Zap size={12} className="text-yellow-500" />}
                    </Link>
                  </td>
                  <td className="px-6 py-4 text-gray-700">{order.customer_name}</td>
                  <td className="px-6 py-4">
                    <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${statusColor(order.status)}`}>
                      {statusLabel(order.status)}
                    </span>
                  </td>
                  <td className={`px-6 py-4 text-sm font-medium ${deadlineColor(order.delivery_deadline)}`}>
                    {format(parseISO(order.delivery_deadline), 'MMM d, yyyy')}
                  </td>
                  <td className="px-6 py-4 text-right font-semibold text-gray-900">
                    ETB {parseFloat(order.total_price).toLocaleString('en', { minimumFractionDigits: 2 })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

import type { OrderStatus } from '../types'
import { isAfter, differenceInHours, parseISO } from 'date-fns'

export const statusLabel = (status: string): string => {
  const labels: Record<string, string> = {
    draft: 'Draft',
    pending_approval: 'Pending Approval',
    pending_payment: 'Pending Payment',
    confirmed: 'Confirmed',
    cutting: 'Cutting',
    tempering: 'Tempering',
    qc: 'QC Check',
    ready_dispatch: 'Ready to Dispatch',
    delivered: 'Delivered',
    cancelled: 'Cancelled',
    on_hold: 'On Hold',
  }
  return labels[status] ?? status
}

export const statusColor = (status: string): string => {
  const colors: Record<string, string> = {
    draft: 'bg-gray-100 text-gray-600',
    pending_approval: 'bg-yellow-100 text-yellow-700',
    pending_payment: 'bg-pink-100 text-pink-700',
    confirmed: 'bg-blue-100 text-blue-700',
    cutting: 'bg-orange-100 text-orange-700',
    tempering: 'bg-purple-100 text-purple-700',
    qc: 'bg-indigo-100 text-indigo-700',
    ready_dispatch: 'bg-cyan-100 text-cyan-700',
    delivered: 'bg-green-100 text-green-700',
    cancelled: 'bg-red-100 text-red-700',
    on_hold: 'bg-gray-100 text-gray-500',
  }
  return colors[status] ?? 'bg-gray-100 text-gray-600'
}

export const deadlineColor = (deadline: string): string => {
  const dl = parseISO(deadline)
  const now = new Date()
  if (!isAfter(dl, now)) return 'text-red-600'
  const hours = differenceInHours(dl, now)
  if (hours <= 48) return 'text-yellow-600'
  return 'text-green-600'
}

export const nextStatuses = (current: OrderStatus): OrderStatus[] => {
  const map: Record<string, OrderStatus[]> = {
    confirmed: ['cutting', 'cancelled', 'on_hold'],
    cutting: ['tempering', 'qc', 'cancelled'],
    tempering: ['qc', 'cancelled'],
    qc: ['ready_dispatch', 'cutting'],
    ready_dispatch: ['delivered'],
    on_hold: ['confirmed', 'cancelled'],
  }
  return map[current] ?? []
}

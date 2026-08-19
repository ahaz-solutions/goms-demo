import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import api from '../lib/api'
import type { Order, OrderStatus } from '../types'
import { statusLabel, statusColor, nextStatuses } from '../lib/orderUtils'
import { format, parseISO } from 'date-fns'
import toast from 'react-hot-toast'
import { ArrowLeft, FileDown, Zap, CheckCircle, ChevronRight } from 'lucide-react'

const STATUS_STEPS = ['confirmed', 'cutting', 'tempering', 'qc', 'ready_dispatch', 'delivered']

export default function OrderDetailPage() {
  const { id } = useParams()
  const [order, setOrder] = useState<Order | null>(null)
  const [loading, setLoading] = useState(true)
  const [updating, setUpdating] = useState(false)
  const [showStatusModal, setShowStatusModal] = useState(false)
  const [nextStatus, setNextStatus] = useState<OrderStatus | ''>('')
  const [remarks, setRemarks] = useState('')

  const fetchOrder = () => {
    api.get(`/orders/${id}/`).then(res => setOrder(res.data)).finally(() => setLoading(false))
  }

  useEffect(() => { fetchOrder() }, [id])

  const handleStatusUpdate = async () => {
    if (!nextStatus) return
    setUpdating(true)
    try {
      const res = await api.post(`/orders/${id}/update_status/`, { status: nextStatus, remarks })
      setOrder(res.data)
      toast.success(`Order moved to ${statusLabel(nextStatus)}`)
      setShowStatusModal(false)
      setRemarks('')
    } catch {
      toast.error('Failed to update status')
    } finally {
      setUpdating(false)
    }
  }

  const downloadPdf = async () => {
    try {
      const res = await api.get(`/orders/${id}/pdf/`, { responseType: 'blob' })
      const url = URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }))
      const a = document.createElement('a')
      a.href = url
      a.download = `${order?.order_number}.pdf`
      a.click()
      URL.revokeObjectURL(url)
      toast.success('PDF downloaded')
    } catch {
      toast.error('Failed to generate PDF')
    }
  }

  if (loading) {
    return <div className="flex items-center justify-center h-full"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600" /></div>
  }

  if (!order) return <div className="p-8 text-gray-500">Order not found</div>

  const possibleNext = nextStatuses(order.status)
  const currentStepIdx = STATUS_STEPS.indexOf(order.status)

  return (
    <div className="p-8 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <Link to="/staff/orders" className="text-gray-400 hover:text-gray-600"><ArrowLeft size={20} /></Link>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-gray-900">{order.order_number}</h1>
            {order.rush_flag && (
              <span className="flex items-center gap-1 bg-yellow-100 text-yellow-700 text-xs font-bold px-2.5 py-1 rounded-full">
                <Zap size={12} /> RUSH
              </span>
            )}
            <span className={`px-3 py-1 rounded-full text-sm font-medium ${statusColor(order.status)}`}>
              {statusLabel(order.status)}
            </span>
          </div>
          <p className="text-gray-500 text-sm mt-1">
            Created {format(parseISO(order.order_date), 'MMM d, yyyy')} · by {order.created_by_name}
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={downloadPdf} className="flex items-center gap-2 border border-gray-300 text-gray-700 px-4 py-2.5 rounded-lg text-sm font-medium hover:bg-gray-50">
            <FileDown size={16} /> PDF
          </button>
          {possibleNext.length > 0 && (
            <button
              onClick={() => setShowStatusModal(true)}
              className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2.5 rounded-lg text-sm font-medium hover:bg-blue-700"
            >
              Update Status <ChevronRight size={16} />
            </button>
          )}
        </div>
      </div>

      {/* Progress Bar */}
      <div className="bg-white rounded-xl border border-gray-100 p-6 shadow-sm mb-6">
        <div className="flex items-center">
          {STATUS_STEPS.map((step, idx) => {
            const isCompleted = currentStepIdx > idx
            const isCurrent = currentStepIdx === idx
            const isCancel = ['cancelled', 'on_hold'].includes(order.status)
            return (
              <div key={step} className="flex-1 flex items-center">
                <div className="flex flex-col items-center">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all
                    ${isCancel && isCurrent ? 'bg-red-500 text-white' :
                      isCompleted ? 'bg-green-500 text-white' :
                      isCurrent ? 'bg-blue-600 text-white ring-4 ring-blue-100' :
                      'bg-gray-100 text-gray-400'}`}>
                    {isCompleted ? <CheckCircle size={16} /> : idx + 1}
                  </div>
                  <span className={`text-xs mt-1 whitespace-nowrap font-medium
                    ${isCurrent ? 'text-blue-600' : isCompleted ? 'text-green-600' : 'text-gray-400'}`}>
                    {statusLabel(step)}
                  </span>
                </div>
                {idx < STATUS_STEPS.length - 1 && (
                  <div className={`flex-1 h-0.5 mx-1 mb-4 ${isCompleted ? 'bg-green-400' : 'bg-gray-200'}`} />
                )}
              </div>
            )
          })}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-6">
        {/* Left Column */}
        <div className="col-span-2 space-y-6">
          {/* Order Items */}
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100">
              <h2 className="font-semibold text-gray-800">Order Items</h2>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Glass Type</th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase">Thick.</th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase">W×H (mm)</th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase">Qty</th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase">Rough Cut</th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase">Tempered</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {order.items.map(item => (
                  <tr key={item.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-gray-800">{item.catalog_name}</td>
                    <td className="px-4 py-3 text-center text-gray-600">{item.thickness_mm}mm</td>
                    <td className="px-4 py-3 text-center text-gray-600">{item.width_mm}×{item.height_mm}</td>
                    <td className="px-4 py-3 text-center text-gray-600">{item.quantity}</td>
                    <td className="px-4 py-3 text-center text-xs text-yellow-700 bg-yellow-50 font-mono">
                      {item.rough_width_mm}×{item.rough_height_mm}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {item.tempering_required
                        ? <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-medium">Yes</span>
                        : <span className="text-xs text-gray-400">No</span>}
                    </td>
                    <td className="px-4 py-3 text-right font-semibold text-gray-900">
                      ETB {parseFloat(item.line_total_price).toLocaleString('en', { minimumFractionDigits: 2 })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Status History */}
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
            <h2 className="font-semibold text-gray-800 mb-4">Activity Log</h2>
            <div className="space-y-3">
              {order.status_logs.slice().reverse().map(log => (
                <div key={log.id} className="flex gap-3 text-sm">
                  <div className="w-2 h-2 rounded-full bg-blue-400 mt-1.5 flex-shrink-0" />
                  <div>
                    <span className="font-medium text-gray-700">{log.changed_by_name}</span>
                    <span className="text-gray-500"> moved order from </span>
                    <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${statusColor(log.status_from)}`}>{statusLabel(log.status_from)}</span>
                    <span className="text-gray-500"> → </span>
                    <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${statusColor(log.status_to)}`}>{statusLabel(log.status_to)}</span>
                    {log.remarks && <p className="text-gray-500 text-xs mt-0.5">"{log.remarks}"</p>}
                    <p className="text-gray-400 text-xs">{format(parseISO(log.timestamp), 'MMM d, yyyy · h:mm a')}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right Column */}
        <div className="space-y-6">
          {/* Customer */}
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
            <h3 className="font-semibold text-gray-700 text-sm mb-3">Customer</h3>
            <p className="font-bold text-gray-900">{order.customer_name}</p>
          </div>

          {/* Delivery */}
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
            <h3 className="font-semibold text-gray-700 text-sm mb-3">Delivery Deadline</h3>
            <p className="font-bold text-gray-900 text-lg">{format(parseISO(order.delivery_deadline), 'MMM d, yyyy')}</p>
          </div>

          {/* Pricing */}
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
            <h3 className="font-semibold text-gray-700 text-sm mb-3">Pricing</h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between text-gray-600">
                <span>Subtotal</span>
                <span>ETB {parseFloat(order.subtotal).toLocaleString('en', { minimumFractionDigits: 2 })}</span>
              </div>
              {parseFloat(order.tempering_charge) > 0 && (
                <div className="flex justify-between text-gray-600">
                  <span>Tempering</span>
                  <span>ETB {parseFloat(order.tempering_charge).toLocaleString('en', { minimumFractionDigits: 2 })}</span>
                </div>
              )}
              {parseFloat(order.rush_charge) > 0 && (
                <div className="flex justify-between text-yellow-700 font-medium">
                  <span className="flex items-center gap-1"><Zap size={12} /> Rush (25%)</span>
                  <span>ETB {parseFloat(order.rush_charge).toLocaleString('en', { minimumFractionDigits: 2 })}</span>
                </div>
              )}
              <div className="flex justify-between text-gray-600">
                <span>Tax (15%)</span>
                <span>ETB {parseFloat(order.tax_amount).toLocaleString('en', { minimumFractionDigits: 2 })}</span>
              </div>
              <div className="border-t border-gray-200 pt-2 flex justify-between font-bold text-gray-900">
                <span>TOTAL</span>
                <span>ETB {parseFloat(order.total_price).toLocaleString('en', { minimumFractionDigits: 2 })}</span>
              </div>
            </div>
          </div>

          {order.notes && (
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
              <h3 className="font-semibold text-gray-700 text-sm mb-2">Notes</h3>
              <p className="text-sm text-gray-600">{order.notes}</p>
            </div>
          )}
        </div>
      </div>

      {/* Status Modal */}
      {showStatusModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-6">
            <h3 className="font-semibold text-gray-800 text-lg mb-4">Update Order Status</h3>
            <div className="space-y-3 mb-4">
              {possibleNext.map(s => (
                <button
                  key={s}
                  onClick={() => setNextStatus(s)}
                  className={`w-full text-left px-4 py-3 rounded-lg border-2 transition-all ${
                    nextStatus === s ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <span className={`px-2.5 py-1 rounded-full text-sm font-medium ${statusColor(s)}`}>
                    {statusLabel(s)}
                  </span>
                </button>
              ))}
            </div>
            <textarea
              placeholder="Remarks (optional)..."
              value={remarks}
              onChange={e => setRemarks(e.target.value)}
              rows={2}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none mb-4"
            />
            <div className="flex gap-3">
              <button onClick={() => setShowStatusModal(false)} className="flex-1 border border-gray-300 rounded-lg py-2.5 text-sm text-gray-700 hover:bg-gray-50">
                Cancel
              </button>
              <button
                onClick={handleStatusUpdate}
                disabled={!nextStatus || updating}
                className="flex-1 bg-blue-600 text-white rounded-lg py-2.5 text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
              >
                {updating ? 'Updating...' : 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

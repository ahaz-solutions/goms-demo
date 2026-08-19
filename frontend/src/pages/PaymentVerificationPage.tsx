import { useEffect, useState } from 'react'
import api from '../lib/api'
import type { Payment } from '../types'
import { CheckCircle, XCircle, Clock, ExternalLink, RefreshCw, CreditCard, X } from 'lucide-react'
import { format, parseISO } from 'date-fns'
import toast from 'react-hot-toast'
import { useAuthStore } from '../store/authStore'

type FilterStatus = 'pending' | 'approved' | 'rejected' | ''

const statusConfig = {
  pending:  { label: 'Pending',  color: 'bg-yellow-100 text-yellow-700', icon: Clock         },
  approved: { label: 'Approved', color: 'bg-green-100 text-green-700',   icon: CheckCircle   },
  rejected: { label: 'Rejected', color: 'bg-red-100 text-red-700',       icon: XCircle       },
}

export default function PaymentVerificationPage() {
  const user = useAuthStore(s => s.user)
  const canVerify = user?.role === 'admin' || user?.role === 'manager'

  const [payments, setPayments] = useState<Payment[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<FilterStatus>('pending')
  const [selectedPayment, setSelectedPayment] = useState<Payment | null>(null)
  const [confirmAmount, setConfirmAmount] = useState('')
  const [rejectReason, setRejectReason] = useState('')
  const [action, setAction] = useState<'approve' | 'reject' | null>(null)
  const [processing, setProcessing] = useState(false)
  const [showConfirmDialog, setShowConfirmDialog] = useState(false)

  const fetchPayments = () => {
    setLoading(true)
    const params = filter ? `?status=${filter}` : ''
    api.get(`/payments/${params}`)
      .then(res => setPayments(res.data.results || res.data))
      .finally(() => setLoading(false))
  }

  useEffect(() => { fetchPayments() }, [filter])

  const openPayment = (p: Payment) => {
    setSelectedPayment(p)
    setConfirmAmount(p.downpayment_amount)
    setRejectReason('')
    setAction(null)
    setShowConfirmDialog(false)
  }

  const handleApprove = async () => {
    if (!selectedPayment) return
    setProcessing(true)
    try {
      await api.post(`/payments/${selectedPayment.id}/approve/`, {
        amount_confirmed: confirmAmount,
      })
      toast.success(`Payment approved — Order ${selectedPayment.order_number} confirmed`)
      setSelectedPayment(null)
      setShowConfirmDialog(false)
      setAction(null)
      fetchPayments()
    } catch (e: unknown) {
      const err = e as { response?: { data?: { error?: string } } }
      toast.error(err.response?.data?.error || 'Failed to approve')
    } finally {
      setProcessing(false)
    }
  }

  const handleReject = async () => {
    if (!selectedPayment || !rejectReason.trim()) {
      toast.error('Please provide a rejection reason')
      return
    }
    setProcessing(true)
    try {
      await api.post(`/payments/${selectedPayment.id}/reject/`, {
        reason: rejectReason,
      })
      toast.success(`Payment rejected — customer can re-upload`)
      setSelectedPayment(null)
      setShowConfirmDialog(false)
      setAction(null)
      fetchPayments()
    } catch (e: unknown) {
      const err = e as { response?: { data?: { error?: string } } }
      toast.error(err.response?.data?.error || 'Failed to reject')
    } finally {
      setProcessing(false)
    }
  }

  const pendingCount = payments.filter(p => p.status === 'pending').length

  return (
    <div className="p-8 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <CreditCard size={24} className="text-blue-600" />
            Payment Verification
          </h1>
          <p className="text-gray-500 text-sm mt-1">
            Review and verify downpayment proofs from walk-in customers
          </p>
        </div>
        <div className="flex items-center gap-3">
          {pendingCount > 0 && filter !== 'pending' && (
            <span className="bg-yellow-100 text-yellow-700 text-sm font-semibold px-3 py-1.5 rounded-full border border-yellow-200">
              {pendingCount} pending
            </span>
          )}
          <button onClick={fetchPayments} className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors" title="Refresh">
            <RefreshCw size={16} />
          </button>
        </div>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-2 mb-6">
        {([
          { value: 'pending',  label: 'Pending' },
          { value: 'approved', label: 'Approved' },
          { value: 'rejected', label: 'Rejected' },
          { value: '',         label: 'All'      },
        ] as { value: FilterStatus; label: string }[]).map(f => (
          <button
            key={f.value}
            onClick={() => setFilter(f.value)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              filter === f.value
                ? 'bg-blue-600 text-white'
                : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
          </div>
        ) : payments.length === 0 ? (
          <div className="text-center py-20 text-gray-400">
            <CreditCard size={40} className="mx-auto mb-3 opacity-30" />
            <p className="font-medium">No {filter || ''} payments</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="px-5 py-3.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Order</th>
                <th className="px-5 py-3.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Customer</th>
                <th className="px-5 py-3.5 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">Order Total</th>
                <th className="px-5 py-3.5 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">Claimed Amount</th>
                <th className="px-5 py-3.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Submitted</th>
                <th className="px-5 py-3.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</th>
                <th className="px-5 py-3.5 w-24" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {payments.map(p => {
                const cfg = statusConfig[p.status]
                const Icon = cfg.icon
                return (
                  <tr key={p.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-5 py-4">
                      <span className="font-bold text-blue-700">{p.order_number}</span>
                    </td>
                    <td className="px-5 py-4">
                      <p className="font-medium text-gray-900">{p.customer_name}</p>
                      {p.customer_phone && <p className="text-xs text-gray-400">{p.customer_phone}</p>}
                    </td>
                    <td className="px-5 py-4 text-right font-semibold text-gray-900">
                      ETB {parseFloat(p.total_price).toLocaleString('en', { minimumFractionDigits: 2 })}
                      <p className="text-xs text-gray-400 font-normal">50% = ETB {parseFloat(p.downpayment_amount).toLocaleString('en', { minimumFractionDigits: 2 })}</p>
                    </td>
                    <td className="px-5 py-4 text-right font-semibold text-gray-800">
                      ETB {parseFloat(p.amount_claimed).toLocaleString('en', { minimumFractionDigits: 2 })}
                      {p.amount_confirmed && (
                        <p className="text-xs text-green-600 font-normal">Confirmed: ETB {parseFloat(p.amount_confirmed).toLocaleString()}</p>
                      )}
                    </td>
                    <td className="px-5 py-4 text-gray-500 text-xs">
                      {format(parseISO(p.submitted_at), 'MMM d, yyyy')}
                      <br />{format(parseISO(p.submitted_at), 'h:mm a')}
                    </td>
                    <td className="px-5 py-4">
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${cfg.color}`}>
                        <Icon size={12} />{cfg.label}
                      </span>
                      {p.status === 'rejected' && p.rejection_reason && (
                        <p className="text-xs text-red-500 mt-1 max-w-32 truncate" title={p.rejection_reason}>{p.rejection_reason}</p>
                      )}
                    </td>
                    <td className="px-5 py-4">
                      <button
                        onClick={() => openPayment(p)}
                        className="flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-800 font-medium border border-blue-200 rounded-lg px-3 py-1.5 hover:bg-blue-50 transition-colors"
                      >
                        <ExternalLink size={12} /> Review
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* ── Review Modal ──────────────────────────────────────────────────── */}
      {selectedPayment && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            {/* Modal header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 sticky top-0 bg-white rounded-t-2xl">
              <div>
                <h3 className="font-bold text-gray-900 text-lg">Payment Review</h3>
                <p className="text-sm text-gray-500">{selectedPayment.order_number} · {selectedPayment.customer_name}</p>
              </div>
              <button onClick={() => setSelectedPayment(null)} className="text-gray-400 hover:text-gray-600">
                <X size={20} />
              </button>
            </div>

            <div className="p-6 grid grid-cols-2 gap-6">
              {/* Left — proof image */}
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Payment Proof</p>
                {selectedPayment.proof_image_url ? (
                  <div className="rounded-xl overflow-hidden border border-gray-200 bg-gray-50">
                    <img
                      src={selectedPayment.proof_image_url}
                      alt="Payment proof"
                      className="w-full object-contain max-h-80"
                    />
                    <div className="p-2 text-center">
                      <a href={selectedPayment.proof_image_url} target="_blank" rel="noopener noreferrer"
                        className="text-xs text-blue-600 hover:underline flex items-center justify-center gap-1">
                        <ExternalLink size={11} /> Open full size
                      </a>
                    </div>
                  </div>
                ) : (
                  <div className="rounded-xl border border-gray-200 bg-gray-50 h-48 flex items-center justify-center text-gray-400 text-sm">
                    No image uploaded
                  </div>
                )}
                {selectedPayment.notes && (
                  <div className="mt-3 bg-gray-50 rounded-xl p-3 text-xs text-gray-600">
                    <p className="font-semibold text-gray-700 mb-1">Customer Notes</p>
                    {selectedPayment.notes}
                  </div>
                )}
              </div>

              {/* Right — details + action */}
              <div className="space-y-4">
                <div className="space-y-2.5 text-sm">
                  <div className="flex justify-between py-2 border-b border-gray-100">
                    <span className="text-gray-500">Order Total</span>
                    <span className="font-bold text-gray-900">ETB {parseFloat(selectedPayment.total_price).toLocaleString('en', { minimumFractionDigits: 2 })}</span>
                  </div>
                  <div className="flex justify-between py-2 border-b border-gray-100">
                    <span className="text-gray-500">Expected 50%</span>
                    <span className="font-semibold text-green-700">ETB {parseFloat(selectedPayment.downpayment_amount).toLocaleString('en', { minimumFractionDigits: 2 })}</span>
                  </div>
                  <div className="flex justify-between py-2 border-b border-gray-100">
                    <span className="text-gray-500">Customer Claimed</span>
                    <span className="font-semibold text-gray-800">ETB {parseFloat(selectedPayment.amount_claimed).toLocaleString('en', { minimumFractionDigits: 2 })}</span>
                  </div>
                  <div className="flex justify-between py-2 border-b border-gray-100">
                    <span className="text-gray-500">Payment Type</span>
                    <span className="font-medium text-gray-700 capitalize">{selectedPayment.payment_type}</span>
                  </div>
                  <div className="flex justify-between py-2 border-b border-gray-100">
                    <span className="text-gray-500">Submitted</span>
                    <span className="text-gray-700">{format(parseISO(selectedPayment.submitted_at), 'MMM d, yyyy · h:mm a')}</span>
                  </div>
                  <div className="flex justify-between py-2">
                    <span className="text-gray-500">Current Status</span>
                    <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${statusConfig[selectedPayment.status].color}`}>
                      {statusConfig[selectedPayment.status].label}
                    </span>
                  </div>
                </div>

                {/* Action panel — only for pending, only for admins/managers */}
                {selectedPayment.status === 'pending' && canVerify && (
                  <div className="border-t border-gray-200 pt-4 space-y-3">

                    {/* Confirmed amount always visible for context */}
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Confirmed Amount (ETB)</label>
                      <input
                        type="number"
                        value={confirmAmount}
                        onChange={e => setConfirmAmount(e.target.value)}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                      />
                    </div>

                    {action === 'reject' && (
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Rejection Reason *</label>
                        <textarea
                          rows={3}
                          value={rejectReason}
                          onChange={e => setRejectReason(e.target.value)}
                          placeholder="e.g. Amount doesn't match, unclear screenshot, wrong reference..."
                          className="w-full border border-red-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-400 resize-none"
                        />
                      </div>
                    )}

                    {/* Primary action buttons */}
                    {!action && (
                      <div className="flex gap-2">
                        <button onClick={() => setAction('approve')}
                          className="flex-1 flex items-center justify-center gap-1.5 bg-green-600 text-white py-2.5 rounded-xl text-sm font-semibold hover:bg-green-700 transition-colors">
                          <CheckCircle size={15} /> Approve
                        </button>
                        <button onClick={() => setAction('reject')}
                          className="flex-1 flex items-center justify-center gap-1.5 bg-red-500 text-white py-2.5 rounded-xl text-sm font-semibold hover:bg-red-600 transition-colors">
                          <XCircle size={15} /> Reject
                        </button>
                      </div>
                    )}

                    {action === 'reject' && (
                      <div className="flex gap-2">
                        <button onClick={() => { setAction(null); setRejectReason('') }}
                          className="flex-1 border border-gray-300 py-2.5 rounded-xl text-sm text-gray-600 hover:bg-gray-50">
                          Cancel
                        </button>
                        <button onClick={() => setShowConfirmDialog(true)} disabled={!rejectReason.trim()}
                          className="flex-1 bg-red-500 text-white py-2.5 rounded-xl text-sm font-bold hover:bg-red-600 disabled:opacity-50 flex items-center justify-center gap-1.5">
                          <XCircle size={15} /> Continue
                        </button>
                      </div>
                    )}

                    {action === 'approve' && (
                      <div className="flex gap-2">
                        <button onClick={() => setAction(null)}
                          className="flex-1 border border-gray-300 py-2.5 rounded-xl text-sm text-gray-600 hover:bg-gray-50">
                          Cancel
                        </button>
                        <button onClick={() => setShowConfirmDialog(true)}
                          className="flex-1 bg-green-600 text-white py-2.5 rounded-xl text-sm font-bold hover:bg-green-700 flex items-center justify-center gap-1.5">
                          <CheckCircle size={15} /> Continue
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {selectedPayment.status === 'pending' && !canVerify && (
                  <div className="border-t border-gray-200 pt-4 text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-xl p-3">
                    Only Managers and Admins can approve or reject payments.
                  </div>
                )}

                {selectedPayment.status !== 'pending' && selectedPayment.verified_by_name && (
                  <div className={`border-t border-gray-200 pt-4 text-sm rounded-xl p-3 ${selectedPayment.status === 'approved' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                    <p className="font-semibold">{selectedPayment.status === 'approved' ? '✓ Approved' : '✗ Rejected'} by {selectedPayment.verified_by_name}</p>
                    {selectedPayment.verified_at && <p className="text-xs mt-0.5 opacity-80">{format(parseISO(selectedPayment.verified_at), 'MMM d, yyyy · h:mm a')}</p>}
                    {selectedPayment.rejection_reason && <p className="text-xs mt-1">Reason: {selectedPayment.rejection_reason}</p>}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Are You Sure Dialog ───────────────────────────────────────────── */}
      {showConfirmDialog && selectedPayment && action && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[60] p-4">
          <div className={`bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 border-t-4 ${
            action === 'approve' ? 'border-green-500' : 'border-red-500'
          }`}>
            {/* Icon */}
            <div className={`w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-4 ${
              action === 'approve' ? 'bg-green-100' : 'bg-red-100'
            }`}>
              {action === 'approve'
                ? <CheckCircle size={28} className="text-green-600" />
                : <XCircle size={28} className="text-red-500" />
              }
            </div>

            {/* Title */}
            <h3 className="text-lg font-bold text-gray-900 text-center mb-1">
              {action === 'approve' ? 'Approve this payment?' : 'Reject this payment?'}
            </h3>
            <p className="text-sm text-gray-500 text-center mb-5">
              {action === 'approve'
                ? 'This will confirm the downpayment and move the order into the production queue. This action cannot be undone.'
                : 'The customer will be notified and can re-upload their proof. Make sure your rejection reason is clear.'
              }
            </p>

            {/* Summary */}
            <div className={`rounded-xl p-4 mb-5 text-sm space-y-2 ${
              action === 'approve' ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'
            }`}>
              <div className="flex justify-between">
                <span className="text-gray-500">Order</span>
                <span className="font-bold text-gray-800">{selectedPayment.order_number}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Customer</span>
                <span className="font-medium text-gray-700">{selectedPayment.customer_name}</span>
              </div>
              {action === 'approve' && (
                <div className="flex justify-between">
                  <span className="text-gray-500">Amount Confirming</span>
                  <span className="font-bold text-green-700">
                    ETB {parseFloat(confirmAmount).toLocaleString('en', { minimumFractionDigits: 2 })}
                  </span>
                </div>
              )}
              {action === 'reject' && rejectReason && (
                <div>
                  <span className="text-gray-500 block mb-1">Rejection Reason</span>
                  <span className="text-red-700 font-medium text-xs">{rejectReason}</span>
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="flex gap-3">
              <button
                onClick={() => setShowConfirmDialog(false)}
                disabled={processing}
                className="flex-1 border border-gray-300 py-3 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 transition-colors"
              >
                Go Back
              </button>
              <button
                onClick={action === 'approve' ? handleApprove : handleReject}
                disabled={processing}
                className={`flex-1 py-3 rounded-xl text-sm font-bold disabled:opacity-60 transition-colors flex items-center justify-center gap-2 ${
                  action === 'approve'
                    ? 'bg-green-600 hover:bg-green-700 text-white'
                    : 'bg-red-500 hover:bg-red-600 text-white'
                }`}
              >
                {processing
                  ? <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                  : action === 'approve'
                    ? <><CheckCircle size={16} /> Yes, Approve</>
                    : <><XCircle size={16} /> Yes, Reject</>
                }
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

import { useEffect, useRef, useState } from 'react'
import axios from 'axios'
import type { GlassCatalog, ThicknessOption } from '../types'
import {
  Layers, Plus, Trash2, AlertTriangle, Zap, CheckCircle,
  ChevronRight, Phone, User, Upload, CreditCard, Search, Copy
} from 'lucide-react'
import { format, addDays } from 'date-fns'

const BASE_URL = import.meta.env.VITE_API_BASE_URL
  ? `${import.meta.env.VITE_API_BASE_URL}/api`
  : '/api'

const api = axios.create({ baseURL: BASE_URL })

// ── Types ─────────────────────────────────────────────────────────────────────

interface LineItem {
  id: string
  catalog_id: number | ''
  thickness_mm: number | ''
  width_mm: number | ''
  height_mm: number | ''
  quantity: number
  tempering_required: boolean
  cutting_allowance_mm: number
}

interface Confirmation {
  order_number: string
  order_id: number
  total_price: string
  subtotal: string
  tempering_charge: string
  rush_charge: string
  tax_amount: string
  rush_flag: boolean
  delivery_deadline: string
  customer_name: string
  payment_status: string
  downpayment_amount: string
  bank_details: {
    bank_name: string
    account_number: string
    account_name: string
    reference: string
  }
}

interface LookupResult {
  order_number: string
  customer_name: string
  status: string
  payment_status: string
  total_price: string
  downpayment_amount: string
  delivery_deadline: string
  rush_flag: boolean
  latest_payment: {
    status: string
    amount_claimed: string
    submitted_at: string
    rejection_reason: string
  } | null
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const defaultLine = (): LineItem => ({
  id: Math.random().toString(36).slice(2),
  catalog_id: '', thickness_mm: '', width_mm: '', height_mm: '',
  quantity: 1, tempering_required: false, cutting_allowance_mm: 3,
})

const TEMPERING_RATE = 150
const TAX_RATE = 0.15
const RUSH_RATE = 0.25
const LEAD_DAYS = 3

const paymentStatusLabel: Record<string, { label: string; color: string }> = {
  unpaid:                { label: 'Awaiting Payment',          color: 'text-red-600 bg-red-50 border-red-200'       },
  downpayment_pending:   { label: 'Proof Submitted — Pending', color: 'text-yellow-700 bg-yellow-50 border-yellow-200' },
  downpayment_verified:  { label: 'Downpayment Verified ✓',    color: 'text-green-700 bg-green-50 border-green-200'  },
  balance_due:           { label: 'Balance Due',               color: 'text-orange-700 bg-orange-50 border-orange-200' },
  fully_paid:            { label: 'Fully Paid ✓',              color: 'text-green-700 bg-green-50 border-green-200'  },
}

const orderStatusLabel: Record<string, string> = {
  pending_payment:      'Pending Payment',
  confirmed:            'Confirmed — In Production Queue',
  cutting:              'Being Cut',
  tempering:            'Tempering',
  qc:                   'Quality Check',
  ready_dispatch:       'Ready for Collection',
  delivered:            'Delivered',
  cancelled:            'Cancelled',
  on_hold:              'On Hold',
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function WalkInPage() {
  const [catalog, setCatalog] = useState<GlassCatalog[]>([])
  const [customerName, setCustomerName] = useState('')
  const [customerPhone, setCustomerPhone] = useState('')
  const [lines, setLines] = useState<LineItem[]>([defaultLine()])
  const [deliveryDate, setDeliveryDate] = useState(format(addDays(new Date(), LEAD_DAYS), 'yyyy-MM-dd'))
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null)
  const [step, setStep] = useState<'form' | 'review' | 'payment' | 'payment_done'>('form')

  // Payment upload state
  const [paymentFile, setPaymentFile] = useState<File | null>(null)
  const [paymentPreview, setPaymentPreview] = useState<string | null>(null)
  const [paymentAmount, setPaymentAmount] = useState('')
  const [paymentNotes, setPaymentNotes] = useState('')
  const [uploadingPayment, setUploadingPayment] = useState(false)
  const [paymentError, setPaymentError] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Order lookup state
  const [showLookup, setShowLookup] = useState(false)
  const [lookupOrder, setLookupOrder] = useState('')
  const [lookupPhone, setLookupPhone] = useState('')
  const [lookupResult, setLookupResult] = useState<LookupResult | null>(null)
  const [lookupError, setLookupError] = useState('')
  const [lookupLoading, setLookupLoading] = useState(false)

  const suggestedDate = format(addDays(new Date(), LEAD_DAYS), 'yyyy-MM-dd')
  const isRush = deliveryDate < suggestedDate

  useEffect(() => {
    api.get('/walkin/catalog/').then(res => setCatalog(res.data))
  }, [])

  const getCat = (id: number | '') => catalog.find(c => c.id === id)
  const getThicknesses = (id: number | ''): ThicknessOption[] => getCat(id)?.thickness_options ?? []

  const calcLine = (line: LineItem) => {
    const cat = getCat(line.catalog_id)
    if (!cat || !line.width_mm || !line.height_mm || !line.thickness_mm) return null
    const sqm = (Number(line.width_mm) * Number(line.height_mm)) / 1_000_000 * line.quantity
    const thickOpt = cat.thickness_options.find(t => t.thickness_mm === line.thickness_mm)
    const surcharge = thickOpt ? parseFloat(thickOpt.surcharge_multiplier) : 1
    const material = sqm * parseFloat(cat.base_price_per_sqm) * surcharge
    const cutting = sqm * parseFloat(cat.cutting_rate_per_sqm)
    const tempering = line.tempering_required ? sqm * TEMPERING_RATE : 0
    return { sqm, material, cutting, tempering, lineTotal: material + cutting + tempering }
  }

  const totals = lines.reduce((acc, l) => {
    const c = calcLine(l)
    if (!c) return acc
    return { sqm: acc.sqm + c.sqm, subtotal: acc.subtotal + c.material + c.cutting, tempering: acc.tempering + c.tempering }
  }, { sqm: 0, subtotal: 0, tempering: 0 })

  const rushCharge = isRush ? (totals.subtotal + totals.tempering) * RUSH_RATE : 0
  const preTax = totals.subtotal + totals.tempering + rushCharge
  const taxAmount = preTax * TAX_RATE
  const grandTotal = preTax + taxAmount

  const updateLine = (id: string, field: keyof LineItem, value: unknown) => {
    setLines(prev => prev.map(l => {
      if (l.id !== id) return l
      const updated = { ...l, [field]: value }
      if (field === 'catalog_id') updated.thickness_mm = ''
      if (field === 'thickness_mm') {
        const cat = getCat(updated.catalog_id)
        const opt = cat?.thickness_options.find(t => t.thickness_mm === value)
        if (opt && !opt.tempering_allowed) updated.tempering_required = false
      }
      return updated
    }))
  }

  const canReview = customerName.trim() &&
    lines.every(l => l.catalog_id && l.thickness_mm && l.width_mm && l.height_mm) &&
    grandTotal > 0

  // ── Submit Order ────────────────────────────────────────────────────────────

  const handleSubmit = async () => {
    setSubmitting(true)
    setError('')
    try {
      const res = await api.post('/walkin/order/', {
        customer_name: customerName.trim(),
        customer_phone: customerPhone.trim(),
        delivery_deadline: deliveryDate,
        notes,
        items: lines.map(l => ({
          catalog: l.catalog_id, thickness_mm: l.thickness_mm,
          width_mm: l.width_mm, height_mm: l.height_mm,
          quantity: l.quantity, tempering_required: l.tempering_required,
          cutting_allowance_mm: l.cutting_allowance_mm,
        })),
      })
      setConfirmation(res.data)
      setPaymentAmount(res.data.downpayment_amount)
      setStep('payment')
    } catch (e: unknown) {
      const err = e as { response?: { data?: { error?: string } } }
      setError(err.response?.data?.error || 'Something went wrong. Please try again.')
      setStep('form')
    } finally {
      setSubmitting(false)
    }
  }

  // ── Submit Payment ──────────────────────────────────────────────────────────

  const handlePaymentUpload = async () => {
    if (!paymentFile || !confirmation) return
    setUploadingPayment(true)
    setPaymentError('')
    try {
      const fd = new FormData()
      fd.append('order_number', confirmation.order_number)
      fd.append('customer_phone', customerPhone)
      fd.append('amount_claimed', paymentAmount)
      fd.append('proof_image', paymentFile)
      fd.append('notes', paymentNotes)
      await api.post('/walkin/payment/', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      setStep('payment_done')
    } catch (e: unknown) {
      const err = e as { response?: { data?: { error?: string } } }
      setPaymentError(err.response?.data?.error || 'Upload failed. Please try again.')
    } finally {
      setUploadingPayment(false)
    }
  }

  // ── Order Lookup ────────────────────────────────────────────────────────────

  const handleLookup = async () => {
    if (!lookupOrder.trim()) return
    setLookupLoading(true)
    setLookupError('')
    setLookupResult(null)
    try {
      const res = await api.get(`/walkin/lookup/?order_number=${lookupOrder.trim()}&phone=${lookupPhone.trim()}`)
      setLookupResult(res.data)
    } catch {
      setLookupError('Order not found. Check your order number and try again.')
    } finally {
      setLookupLoading(false)
    }
  }

  const resetForm = () => {
    setCustomerName(''); setCustomerPhone(''); setLines([defaultLine()])
    setDeliveryDate(format(addDays(new Date(), LEAD_DAYS), 'yyyy-MM-dd'))
    setNotes(''); setConfirmation(null); setStep('form'); setError('')
    setPaymentFile(null); setPaymentPreview(null); setPaymentAmount(''); setPaymentNotes('')
  }

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text)
  }

  // ── Payment Done Screen ───────────────────────────────────────────────────

  if (step === 'payment_done' && confirmation) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-950 via-blue-900 to-blue-800 flex items-center justify-center p-4">
        <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl p-8 text-center">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <CheckCircle size={32} className="text-green-600" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-1">Payment Submitted!</h1>
          <p className="text-gray-500 mb-6 text-sm">
            Your proof of payment has been sent. Our team will verify it within 1 business day and your order will move to production.
          </p>
          <div className="bg-gray-50 rounded-xl p-4 text-left space-y-2 mb-6 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-500">Order Number</span>
              <span className="font-bold text-blue-700">{confirmation.order_number}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Amount Submitted</span>
              <span className="font-semibold text-gray-800">ETB {parseFloat(paymentAmount).toLocaleString('en', { minimumFractionDigits: 2 })}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Status</span>
              <span className="font-medium text-yellow-700">Pending Verification</span>
            </div>
          </div>
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-sm text-blue-700 mb-6 text-left">
            <p className="font-semibold mb-1">Track your order anytime</p>
            <p className="text-xs text-blue-600">Use your order number <strong>{confirmation.order_number}</strong> on the "Track Order" button to check your payment and order status.</p>
          </div>
          <button onClick={resetForm} className="w-full bg-blue-600 text-white py-3 rounded-xl font-semibold hover:bg-blue-700 transition-colors">
            Place Another Order
          </button>
        </div>
      </div>
    )
  }

  // ── Payment Upload Screen ─────────────────────────────────────────────────

  if (step === 'payment' && confirmation) {
    const downpayment = parseFloat(confirmation.downpayment_amount)
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-950 via-blue-900 to-blue-800 py-8 px-4">
        <div className="max-w-lg mx-auto">
          <div className="text-center mb-6">
            <div className="inline-flex items-center justify-center w-12 h-12 bg-green-500 rounded-2xl mb-3">
              <CheckCircle size={24} className="text-white" />
            </div>
            <h1 className="text-2xl font-bold text-white">Order Placed!</h1>
            <p className="text-blue-300 text-sm mt-1">Complete your order with a 50% downpayment</p>
          </div>

          {/* Order summary card */}
          <div className="bg-white rounded-2xl shadow-xl p-5 mb-4">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Order Confirmed</span>
              <span className="font-bold text-blue-700 text-lg">{confirmation.order_number}</span>
            </div>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="bg-gray-50 rounded-xl p-3">
                <p className="text-xs text-gray-400 mb-0.5">Total Amount</p>
                <p className="font-bold text-gray-900">ETB {parseFloat(confirmation.total_price).toLocaleString('en', { minimumFractionDigits: 2 })}</p>
              </div>
              <div className="bg-green-50 border border-green-200 rounded-xl p-3">
                <p className="text-xs text-green-600 mb-0.5 font-medium">Pay Now (50%)</p>
                <p className="font-bold text-green-700 text-lg">ETB {downpayment.toLocaleString('en', { minimumFractionDigits: 2 })}</p>
              </div>
            </div>
          </div>

          {/* Bank details */}
          <div className="bg-white rounded-2xl shadow-xl p-5 mb-4">
            <h3 className="font-semibold text-gray-800 mb-3 flex items-center gap-2">
              <CreditCard size={16} className="text-blue-600" /> Bank Transfer Details
            </h3>
            <div className="space-y-2.5 text-sm">
              {[
                { label: 'Bank', value: confirmation.bank_details.bank_name },
                { label: 'Account Number', value: confirmation.bank_details.account_number, copy: true },
                { label: 'Account Name', value: confirmation.bank_details.account_name },
                { label: 'Reference / Remark', value: confirmation.bank_details.reference, copy: true, highlight: true },
              ].map(({ label, value, copy, highlight }) => (
                <div key={label} className={`flex items-center justify-between rounded-lg px-3 py-2.5 ${highlight ? 'bg-yellow-50 border border-yellow-200' : 'bg-gray-50'}`}>
                  <div>
                    <p className="text-xs text-gray-400">{label}</p>
                    <p className={`font-semibold ${highlight ? 'text-yellow-800' : 'text-gray-800'}`}>{value}</p>
                  </div>
                  {copy && (
                    <button onClick={() => copyToClipboard(value)} className="text-gray-400 hover:text-blue-600 transition-colors p-1" title="Copy">
                      <Copy size={14} />
                    </button>
                  )}
                </div>
              ))}
            </div>
            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mt-3">
              ⚠ Please use your order number <strong>{confirmation.order_number}</strong> as the payment reference/remark.
            </p>
          </div>

          {/* Upload proof */}
          <div className="bg-white rounded-2xl shadow-xl p-5 mb-4">
            <h3 className="font-semibold text-gray-800 mb-4 flex items-center gap-2">
              <Upload size={16} className="text-blue-600" /> Upload Payment Proof
            </h3>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Amount You Paid (ETB) *</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={paymentAmount}
                  onChange={e => setPaymentAmount(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder={String(downpayment)}
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-600 mb-2">Payment Screenshot / Receipt *</label>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={e => {
                    const f = e.target.files?.[0]
                    if (!f) return
                    setPaymentFile(f)
                    setPaymentPreview(URL.createObjectURL(f))
                  }}
                />
                {paymentPreview ? (
                  <div className="relative rounded-xl overflow-hidden border border-gray-200">
                    <img src={paymentPreview} alt="proof" className="w-full max-h-48 object-contain bg-gray-50" />
                    <button
                      onClick={() => { setPaymentFile(null); setPaymentPreview(null) }}
                      className="absolute top-2 right-2 bg-white border border-gray-200 rounded-lg px-2 py-1 text-xs text-gray-600 hover:bg-red-50 hover:text-red-600"
                    >
                      Change
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="w-full border-2 border-dashed border-blue-300 rounded-xl py-8 flex flex-col items-center justify-center gap-2 hover:bg-blue-50 transition-colors"
                  >
                    <Upload size={24} className="text-blue-400" />
                    <span className="text-sm text-blue-600 font-medium">Tap to upload screenshot</span>
                    <span className="text-xs text-gray-400">JPG, PNG — screenshot from your banking app</span>
                  </button>
                )}
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Transaction Reference / Notes (optional)</label>
                <input
                  type="text"
                  value={paymentNotes}
                  onChange={e => setPaymentNotes(e.target.value)}
                  placeholder="e.g. CBE transaction ref: FT123456"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {paymentError && (
                <div className="flex items-center gap-2 text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-sm">
                  <AlertTriangle size={14} /> {paymentError}
                </div>
              )}

              <button
                onClick={handlePaymentUpload}
                disabled={!paymentFile || !paymentAmount || uploadingPayment}
                className="w-full bg-green-600 text-white py-3.5 rounded-xl font-bold hover:bg-green-700 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
              >
                {uploadingPayment
                  ? <><div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" /> Submitting...</>
                  : <><CheckCircle size={18} /> Submit Payment Proof</>
                }
              </button>

              <button
                onClick={() => setStep('payment_done')}
                className="w-full text-gray-400 text-sm py-2 hover:text-gray-600 transition-colors"
              >
                Skip for now — I'll pay later
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // ── Review Screen ─────────────────────────────────────────────────────────

  if (step === 'review') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-950 via-blue-900 to-blue-800 flex items-center justify-center p-4">
        <div className="w-full max-w-lg bg-white rounded-2xl shadow-2xl overflow-hidden">
          <div className="bg-blue-600 px-6 py-4 flex items-center gap-3">
            <div className="bg-white/20 rounded-lg p-1.5"><Layers size={18} className="text-white" /></div>
            <div>
              <h1 className="font-bold text-white">Review Your Order</h1>
              <p className="text-blue-200 text-xs">Confirm before submitting</p>
            </div>
          </div>
          <div className="p-6 space-y-4">
            <div className="bg-gray-50 rounded-xl p-4">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Customer</p>
              <p className="font-semibold text-gray-900">{customerName}</p>
              {customerPhone && <p className="text-sm text-gray-500">{customerPhone}</p>}
            </div>
            <div className="bg-gray-50 rounded-xl p-4">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Glass Items</p>
              <div className="space-y-2">
                {lines.map((line, i) => {
                  const cat = getCat(line.catalog_id)
                  const c = calcLine(line)
                  return (
                    <div key={line.id} className="text-sm border-b border-gray-200 pb-2 last:border-0 last:pb-0">
                      <div className="flex justify-between font-medium text-gray-800">
                        <span>{i + 1}. {cat?.name} {line.thickness_mm}mm</span>
                        <span>ETB {c?.lineTotal.toFixed(2)}</span>
                      </div>
                      <div className="text-gray-500 text-xs mt-0.5">
                        {line.width_mm} × {line.height_mm} mm · {line.quantity} pcs
                        {line.tempering_required && ' · 🔥 Tempered'}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
            <div className="bg-gray-50 rounded-xl p-4">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Delivery</p>
              <p className="font-semibold text-gray-900">{format(new Date(deliveryDate + 'T00:00:00'), 'MMMM d, yyyy')}</p>
              {isRush && <p className="text-xs text-yellow-700 mt-1 flex items-center gap-1"><Zap size={11} /> Rush — 25% surcharge</p>}
            </div>
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 space-y-2 text-sm">
              {totals.tempering > 0 && <div className="flex justify-between text-gray-600"><span>Tempering</span><span>ETB {totals.tempering.toFixed(2)}</span></div>}
              {isRush && <div className="flex justify-between text-yellow-700 font-medium"><span>Rush (25%)</span><span>ETB {rushCharge.toFixed(2)}</span></div>}
              <div className="flex justify-between text-gray-600"><span>Tax (15%)</span><span>ETB {taxAmount.toFixed(2)}</span></div>
              <div className="flex justify-between font-bold text-gray-900 text-lg pt-2 border-t border-blue-200">
                <span>TOTAL</span><span>ETB {grandTotal.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-green-700 font-semibold text-sm">
                <span>50% Downpayment Due</span>
                <span>ETB {(grandTotal * 0.5).toFixed(2)}</span>
              </div>
            </div>
            {error && (
              <div className="flex items-center gap-2 text-red-700 bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm">
                <AlertTriangle size={16} />{error}
              </div>
            )}
            <div className="flex gap-3 pt-2">
              <button onClick={() => setStep('form')} className="flex-1 border border-gray-300 text-gray-700 py-3 rounded-xl font-medium hover:bg-gray-50">
                Edit Order
              </button>
              <button
                onClick={handleSubmit}
                disabled={submitting}
                className="flex-1 bg-blue-600 text-white py-3 rounded-xl font-semibold hover:bg-blue-700 disabled:opacity-60 flex items-center justify-center gap-2"
              >
                {submitting
                  ? <><div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" /> Placing...</>
                  : <><CheckCircle size={18} /> Confirm & Place Order</>
                }
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // ── Order Lookup Modal ────────────────────────────────────────────────────

  const LookupModal = () => (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-bold text-gray-900 text-lg flex items-center gap-2"><Search size={18} className="text-blue-600" /> Track Your Order</h3>
          <button onClick={() => { setShowLookup(false); setLookupResult(null); setLookupError('') }} className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
        </div>
        <div className="space-y-3 mb-4">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Order Number *</label>
            <input
              type="text"
              placeholder="e.g. GOMS-2026-0001"
              value={lookupOrder}
              onChange={e => setLookupOrder(e.target.value.toUpperCase())}
              className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Phone Number (optional)</label>
            <input
              type="tel"
              placeholder="e.g. 0911 234 567"
              value={lookupPhone}
              onChange={e => setLookupPhone(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>
        <button
          onClick={handleLookup}
          disabled={lookupLoading || !lookupOrder.trim()}
          className="w-full bg-blue-600 text-white py-3 rounded-xl font-semibold hover:bg-blue-700 disabled:opacity-60 mb-4"
        >
          {lookupLoading ? 'Searching...' : 'Track Order'}
        </button>

        {lookupError && <p className="text-sm text-red-600 text-center mb-3">{lookupError}</p>}

        {lookupResult && (() => {
          const ps = paymentStatusLabel[lookupResult.payment_status] ?? { label: lookupResult.payment_status, color: 'text-gray-600 bg-gray-50 border-gray-200' }
          const os = orderStatusLabel[lookupResult.status] ?? lookupResult.status
          return (
            <div className="border border-gray-200 rounded-xl p-4 space-y-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="font-bold text-blue-700 text-base">{lookupResult.order_number}</span>
                <span className="text-gray-500 text-xs">{lookupResult.customer_name}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-gray-500">Order Status</span>
                <span className="font-semibold text-gray-800">{os}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-gray-500">Payment</span>
                <span className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${ps.color}`}>{ps.label}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-gray-500">Delivery Date</span>
                <span className="font-medium">{format(new Date(lookupResult.delivery_deadline + 'T00:00:00'), 'MMM d, yyyy')}</span>
              </div>
              <div className="border-t border-gray-100 pt-3 flex justify-between">
                <span className="text-gray-500">Total</span>
                <span className="font-bold">ETB {parseFloat(lookupResult.total_price).toLocaleString('en', { minimumFractionDigits: 2 })}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Downpayment (50%)</span>
                <span className="font-semibold text-green-700">ETB {parseFloat(lookupResult.downpayment_amount).toLocaleString('en', { minimumFractionDigits: 2 })}</span>
              </div>
              {lookupResult.latest_payment && (
                <div className={`rounded-lg px-3 py-2 text-xs ${
                  lookupResult.latest_payment.status === 'approved' ? 'bg-green-50 text-green-700' :
                  lookupResult.latest_payment.status === 'rejected' ? 'bg-red-50 text-red-700' :
                  'bg-yellow-50 text-yellow-700'
                }`}>
                  {lookupResult.latest_payment.status === 'pending' && '⏳ Payment proof is being reviewed by our team.'}
                  {lookupResult.latest_payment.status === 'approved' && '✓ Downpayment verified. Your order is in production.'}
                  {lookupResult.latest_payment.status === 'rejected' && `✗ Payment rejected: ${lookupResult.latest_payment.rejection_reason}`}
                </div>
              )}
            </div>
          )
        })()}
      </div>
    </div>
  )

  // ── Main Order Form ───────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-950 via-blue-900 to-blue-800 py-8 px-4">
      {showLookup && <LookupModal />}
      <div className="max-w-2xl mx-auto">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 bg-blue-500 rounded-2xl mb-4 shadow-lg">
            <Layers size={28} className="text-white" />
          </div>
          <h1 className="text-3xl font-bold text-white">Order Glass</h1>
          <p className="text-blue-300 mt-1 text-sm">Fill in your details and get an instant quote</p>
          <button
            onClick={() => setShowLookup(true)}
            className="mt-3 flex items-center gap-1.5 text-blue-300 hover:text-white text-sm mx-auto transition-colors"
          >
            <Search size={14} /> Track an existing order
          </button>
        </div>

        <div className="space-y-5">
          {/* Step 1 — Customer */}
          <div className="bg-white rounded-2xl shadow-xl p-6">
            <h2 className="font-semibold text-gray-800 mb-4 flex items-center gap-2">
              <span className="w-6 h-6 bg-blue-600 text-white rounded-full text-xs flex items-center justify-center font-bold">1</span>
              Your Details
            </h2>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Your Name *</label>
                <div className="relative">
                  <User size={15} className="absolute left-3 top-3 text-gray-400" />
                  <input type="text" placeholder="e.g. Abebe Girma" value={customerName}
                    onChange={e => setCustomerName(e.target.value)}
                    className="w-full pl-9 pr-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Phone (optional)</label>
                <div className="relative">
                  <Phone size={15} className="absolute left-3 top-3 text-gray-400" />
                  <input type="tel" placeholder="e.g. 0911 234 567" value={customerPhone}
                    onChange={e => setCustomerPhone(e.target.value)}
                    className="w-full pl-9 pr-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
              </div>
            </div>
          </div>

          {/* Step 2 — Glass Items */}
          <div className="bg-white rounded-2xl shadow-xl p-6">
            <h2 className="font-semibold text-gray-800 mb-4 flex items-center gap-2">
              <span className="w-6 h-6 bg-blue-600 text-white rounded-full text-xs flex items-center justify-center font-bold">2</span>
              Glass Items
            </h2>
            <div className="space-y-4">
              {lines.map((line, idx) => {
                const cat = getCat(line.catalog_id)
                const calcs = calcLine(line)
                const thickOpts = getThicknesses(line.catalog_id)
                const selectedThick = thickOpts.find(t => t.thickness_mm === line.thickness_mm)
                const temperingEligible = selectedThick?.tempering_allowed ?? false
                const widthExceeds = cat && line.width_mm && Number(line.width_mm) > cat.max_width_mm
                const heightExceeds = cat && line.height_mm && Number(line.height_mm) > cat.max_height_mm
                const furnaceWarn = line.tempering_required && line.width_mm && line.height_mm &&
                  (Number(line.width_mm) > 2400 || Number(line.height_mm) > 3600)
                return (
                  <div key={line.id} className={`rounded-xl border p-4 ${widthExceeds || heightExceeds ? 'border-red-300 bg-red-50' : 'border-gray-200 bg-gray-50'}`}>
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Item {idx + 1}</span>
                      {lines.length > 1 && (
                        <button onClick={() => setLines(l => l.filter(x => x.id !== line.id))} className="text-red-400 hover:text-red-600 p-1"><Trash2 size={14} /></button>
                      )}
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="col-span-2">
                        <label className="block text-xs font-medium text-gray-600 mb-2">Glass Type</label>
                        {catalog.length === 0 ? <div className="text-xs text-gray-400 py-2">Loading...</div> : (
                          <div className="grid grid-cols-2 gap-2">
                            {catalog.map(c => (
                              <button key={c.id} type="button" onClick={() => updateLine(line.id, 'catalog_id', c.id)}
                                className={`relative rounded-xl overflow-hidden border-2 text-left transition-all ${line.catalog_id === c.id ? 'border-blue-500 ring-2 ring-blue-200' : 'border-gray-200 hover:border-blue-300'}`}>
                                <div className="h-20 bg-gray-100 overflow-hidden">
                                  {c.image_url
                                    ? <img src={c.image_url} alt={c.name} className="w-full h-full object-cover" />
                                    : <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-blue-50 to-blue-100"><span className="text-3xl">🪟</span></div>
                                  }
                                </div>
                                <div className="px-2.5 py-2">
                                  <p className="text-xs font-semibold text-gray-800 leading-tight">{c.name}</p>
                                  <p className="text-xs text-gray-400 mt-0.5">ETB {parseFloat(c.base_price_per_sqm).toLocaleString()}/m²</p>
                                </div>
                                {line.catalog_id === c.id && (
                                  <div className="absolute top-1.5 right-1.5 w-5 h-5 bg-blue-500 rounded-full flex items-center justify-center">
                                    <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                                  </div>
                                )}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Thickness</label>
                        <select value={line.thickness_mm} onChange={e => updateLine(line.id, 'thickness_mm', Number(e.target.value) || '')}
                          disabled={!line.catalog_id}
                          className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white disabled:bg-gray-100">
                          <option value="">Select...</option>
                          {thickOpts.map(t => <option key={t.id} value={t.thickness_mm}>{t.thickness_mm}mm</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Quantity (pcs)</label>
                        <input type="number" min={1} value={line.quantity}
                          onChange={e => updateLine(line.id, 'quantity', Math.max(1, parseInt(e.target.value) || 1))}
                          className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Width (mm){cat && <span className="text-gray-400 ml-1">max {cat.max_width_mm}</span>}</label>
                        <input type="number" min={1} value={line.width_mm}
                          onChange={e => updateLine(line.id, 'width_mm', parseInt(e.target.value) || '')}
                          className={`w-full border rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${widthExceeds ? 'border-red-400 bg-red-50' : 'border-gray-300'}`} />
                        {widthExceeds && <p className="text-xs text-red-600 mt-0.5">Exceeds maximum!</p>}
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Height (mm){cat && <span className="text-gray-400 ml-1">max {cat.max_height_mm}</span>}</label>
                        <input type="number" min={1} value={line.height_mm}
                          onChange={e => updateLine(line.id, 'height_mm', parseInt(e.target.value) || '')}
                          className={`w-full border rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${heightExceeds ? 'border-red-400 bg-red-50' : 'border-gray-300'}`} />
                        {heightExceeds && <p className="text-xs text-red-600 mt-0.5">Exceeds maximum!</p>}
                      </div>
                      <div className="col-span-2 flex items-center gap-3 pt-1">
                        <button type="button"
                          onClick={() => temperingEligible && updateLine(line.id, 'tempering_required', !line.tempering_required)}
                          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors flex-shrink-0 ${line.tempering_required ? 'bg-blue-600' : 'bg-gray-300'} ${!temperingEligible ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}`}>
                          <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${line.tempering_required ? 'translate-x-6' : 'translate-x-1'}`} />
                        </button>
                        <span className="text-sm text-gray-700 font-medium">🔥 Tempering Required
                          {!temperingEligible && line.thickness_mm && <span className="text-xs text-orange-500 ml-2 font-normal">Not available</span>}
                        </span>
                      </div>
                    </div>
                    {furnaceWarn && (
                      <div className="mt-3 flex items-center gap-2 text-sm text-orange-700 bg-orange-50 border border-orange-200 rounded-lg px-3 py-2">
                        <AlertTriangle size={14} /> This size may require special confirmation from production.
                      </div>
                    )}
                    {calcs && (
                      <div className="mt-3 pt-3 border-t border-gray-200 flex flex-wrap gap-3 text-xs text-gray-600">
                        <span>Area: <strong>{calcs.sqm.toFixed(3)} m²</strong></span>
                        <span>Material: <strong>ETB {calcs.material.toFixed(2)}</strong></span>
                        {calcs.tempering > 0 && <span>Tempering: <strong>ETB {calcs.tempering.toFixed(2)}</strong></span>}
                        <span className="ml-auto font-bold text-gray-900">ETB {calcs.lineTotal.toFixed(2)}</span>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
            <button onClick={() => setLines(l => [...l, defaultLine()])}
              className="mt-4 flex items-center gap-2 text-blue-600 text-sm font-medium hover:text-blue-800 border border-blue-200 rounded-lg px-4 py-2.5 hover:bg-blue-50 transition-colors w-full justify-center">
              <Plus size={15} /> Add Another Item
            </button>
          </div>

          {/* Step 3 — Delivery */}
          <div className="bg-white rounded-2xl shadow-xl p-6">
            <h2 className="font-semibold text-gray-800 mb-4 flex items-center gap-2">
              <span className="w-6 h-6 bg-blue-600 text-white rounded-full text-xs flex items-center justify-center font-bold">3</span>
              Delivery Date
            </h2>
            <div className="flex items-center justify-between mb-1">
              <label className="text-sm font-medium text-gray-700">When do you need it?</label>
              <span className="text-xs text-gray-400">Earliest: {format(addDays(new Date(), LEAD_DAYS), 'MMM d, yyyy')}</span>
            </div>
            <input type="date" value={deliveryDate} min={format(new Date(), 'yyyy-MM-dd')}
              onChange={e => setDeliveryDate(e.target.value)}
              className={`w-full border rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${isRush ? 'border-yellow-400 bg-yellow-50' : 'border-gray-300'}`} />
            {isRush && (
              <div className="flex items-center gap-1.5 mt-2 text-sm text-yellow-700 bg-yellow-50 border border-yellow-200 rounded-lg px-3 py-2 font-medium">
                <Zap size={14} /> Rush order — a 25% expediting surcharge will be added
              </div>
            )}
            <div className="mt-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">Special Instructions (optional)</label>
              <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2}
                placeholder="Any special notes..." className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
            </div>
          </div>

          {/* Price Summary */}
          {grandTotal > 0 && (
            <div className="bg-white rounded-2xl shadow-xl p-6">
              <h2 className="font-semibold text-gray-800 mb-4">Price Estimate</h2>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between text-gray-600"><span>Total Area</span><span className="font-medium">{totals.sqm.toFixed(3)} m²</span></div>
                <div className="flex justify-between text-gray-600"><span>Material &amp; Cutting</span><span>ETB {totals.subtotal.toFixed(2)}</span></div>
                {totals.tempering > 0 && <div className="flex justify-between text-gray-600"><span>Tempering</span><span>ETB {totals.tempering.toFixed(2)}</span></div>}
                {isRush && <div className="flex justify-between text-yellow-700 font-medium"><span className="flex items-center gap-1"><Zap size={12} /> Rush Surcharge</span><span>ETB {rushCharge.toFixed(2)}</span></div>}
                <div className="flex justify-between text-gray-600"><span>Tax (15%)</span><span>ETB {taxAmount.toFixed(2)}</span></div>
                <div className="border-t border-gray-200 pt-3 flex justify-between font-bold text-gray-900 text-xl">
                  <span>TOTAL</span><span>ETB {grandTotal.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-green-700 font-semibold text-sm bg-green-50 border border-green-200 rounded-lg px-3 py-2 mt-2">
                  <span>50% Downpayment Due Now</span>
                  <span>ETB {(grandTotal * 0.5).toFixed(2)}</span>
                </div>
              </div>
            </div>
          )}

          {error && (
            <div className="flex items-center gap-2 text-red-700 bg-red-100 border border-red-300 rounded-xl px-4 py-3 text-sm">
              <AlertTriangle size={16} />{error}
            </div>
          )}

          <button onClick={() => canReview && setStep('review')} disabled={!canReview}
            className="w-full bg-blue-600 text-white py-4 rounded-2xl font-bold text-lg hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-lg flex items-center justify-center gap-2">
            Review My Order <ChevronRight size={20} />
          </button>

          <p className="text-center text-blue-300 text-xs pb-4">
            Already have an account? <a href="/login" className="text-blue-200 underline hover:text-white">Staff login</a>
          </p>
        </div>
      </div>
    </div>
  )
}

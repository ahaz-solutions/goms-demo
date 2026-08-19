import { useEffect, useState } from 'react'
import api from '../lib/api'
import { useAuthStore } from '../store/authStore'
import type { GlassCatalog } from '../types'
import { Pencil, Check, X, Lock, Flame, Info, AlertTriangle } from 'lucide-react'
import toast from 'react-hot-toast'

interface EditingRow {
  id: number
  name: string
  base_price_per_sqm: string
  cutting_rate_per_sqm: string
  original_base: string
  original_cutting: string
}

export default function PricingPage() {
  const user = useAuthStore(s => s.user)
  const canEdit = user?.role === 'admin' || user?.role === 'manager'

  const [catalog, setCatalog] = useState<GlassCatalog[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<EditingRow | null>(null)
  const [showConfirm, setShowConfirm] = useState(false)
  const [saving, setSaving] = useState(false)

  const fetchCatalog = () => {
    setLoading(true)
    api.get('/glass-catalog/?show_inactive=true')
      .then(res => setCatalog(res.data.results || res.data))
      .finally(() => setLoading(false))
  }

  useEffect(() => { fetchCatalog() }, [])

  const startEdit = (glass: GlassCatalog) => {
    setEditing({
      id: glass.id,
      name: glass.name,
      base_price_per_sqm: glass.base_price_per_sqm,
      cutting_rate_per_sqm: glass.cutting_rate_per_sqm,
      original_base: glass.base_price_per_sqm,
      original_cutting: glass.cutting_rate_per_sqm,
    })
  }

  const cancelEdit = () => { setEditing(null); setShowConfirm(false) }

  const requestSave = () => {
    if (!editing) return
    const base = parseFloat(editing.base_price_per_sqm)
    const cutting = parseFloat(editing.cutting_rate_per_sqm)
    if (isNaN(base) || base <= 0 || isNaN(cutting) || cutting < 0) {
      toast.error('Enter valid positive prices')
      return
    }
    setShowConfirm(true)
  }

  const confirmSave = async () => {
    if (!editing) return
    setSaving(true)
    try {
      await api.patch(`/glass-catalog/${editing.id}/`, {
        base_price_per_sqm: parseFloat(editing.base_price_per_sqm),
        cutting_rate_per_sqm: parseFloat(editing.cutting_rate_per_sqm),
      })
      toast.success(`${editing.name} prices updated`)
      setEditing(null)
      setShowConfirm(false)
      fetchCatalog()
    } catch (e: unknown) {
      const err = e as { response?: { data?: { error?: string } } }
      toast.error(err.response?.data?.error || 'Failed to update prices')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="p-8 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Pricing Configuration</h1>
          <p className="text-gray-500 text-sm mt-1">
            Base material and cutting rates per square metre for each glass type
          </p>
        </div>
        {!canEdit && (
          <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 text-amber-700 px-4 py-2.5 rounded-xl text-sm font-medium">
            <Lock size={15} />
            View only — pricing changes require Manager or Admin access
          </div>
        )}
      </div>

      {/* Role notice */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl px-5 py-4 mb-6 flex items-start gap-3">
        <Info size={17} className="text-blue-500 mt-0.5 flex-shrink-0" />
        <div className="text-sm text-blue-700">
          <p className="font-medium mb-0.5">Access Control</p>
          <p>
            <span className="font-semibold">Admin &amp; Manager</span> — can edit all prices. &nbsp;
            <span className="font-semibold">Counter Staff</span> — read-only view. &nbsp;
            <span className="font-semibold">Production Staff</span> — no access to this page.
          </p>
          <p className="mt-1 text-blue-600 text-xs">
            Price changes take effect on new orders immediately. Confirmed orders retain their price snapshot and are not affected.
          </p>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="px-6 py-3.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Glass Type</th>
                <th className="px-6 py-3.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Available Thicknesses</th>
                <th className="px-6 py-3.5 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">Base Price / m²</th>
                <th className="px-6 py-3.5 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">Cutting Rate / m²</th>
                <th className="px-6 py-3.5 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">Effective Total / m²</th>
                {canEdit && <th className="px-6 py-3.5 w-24" />}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {catalog.map(glass => {
                const isEditingThis = editing?.id === glass.id
                const base = isEditingThis
                  ? parseFloat(editing.base_price_per_sqm) || 0
                  : parseFloat(glass.base_price_per_sqm)
                const cutting = isEditingThis
                  ? parseFloat(editing.cutting_rate_per_sqm) || 0
                  : parseFloat(glass.cutting_rate_per_sqm)

                return (
                  <tr
                    key={glass.id}
                    className={`transition-colors ${isEditingThis ? 'bg-blue-50' : 'hover:bg-gray-50'} ${!glass.is_active ? 'opacity-50' : ''}`}
                  >
                    {/* Name */}
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        {glass.image_url ? (
                          <img src={glass.image_url} alt={glass.name} className="w-10 h-10 rounded-lg object-cover border border-gray-200 flex-shrink-0" />
                        ) : (
                          <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-blue-50 to-blue-100 flex items-center justify-center flex-shrink-0 border border-gray-200">
                            <span className="text-lg">🪟</span>
                          </div>
                        )}
                        <div>
                          <p className="font-semibold text-gray-900">{glass.name}</p>
                          {!glass.is_active && (
                            <span className="text-xs text-gray-400">Inactive</span>
                          )}
                        </div>
                      </div>
                    </td>

                    {/* Thicknesses */}
                    <td className="px-6 py-4">
                      <div className="flex flex-wrap gap-1">
                        {glass.thickness_options
                          .slice()
                          .sort((a, b) => a.thickness_mm - b.thickness_mm)
                          .map(t => (
                            <span
                              key={t.id}
                              className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                                t.tempering_allowed ? 'bg-orange-100 text-orange-700' : 'bg-gray-100 text-gray-600'
                              }`}
                              title={t.tempering_allowed ? 'Tempering allowed' : 'No tempering'}
                            >
                              {t.thickness_mm}mm
                              {t.tempering_allowed && <Flame size={9} className="inline ml-0.5 mb-0.5" />}
                              {parseFloat(t.surcharge_multiplier) !== 1 && (
                                <span className="ml-1 opacity-70">×{parseFloat(t.surcharge_multiplier).toFixed(2)}</span>
                              )}
                            </span>
                          ))}
                        {glass.thickness_options.length === 0 && (
                          <span className="text-xs text-gray-400 italic">None configured</span>
                        )}
                      </div>
                    </td>

                    {/* Base Price */}
                    <td className="px-6 py-4 text-right">
                      {isEditingThis ? (
                        <div className="flex items-center justify-end gap-1">
                          <span className="text-xs text-gray-400">ETB</span>
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={editing.base_price_per_sqm}
                            onChange={e => setEditing(p => p ? { ...p, base_price_per_sqm: e.target.value } : p)}
                            className="w-28 border-2 border-blue-400 rounded-lg px-2 py-1.5 text-sm text-right font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500"
                            autoFocus
                          />
                        </div>
                      ) : (
                        <span className="font-semibold text-gray-900">
                          ETB {parseFloat(glass.base_price_per_sqm).toLocaleString('en', { minimumFractionDigits: 2 })}
                        </span>
                      )}
                    </td>

                    {/* Cutting Rate */}
                    <td className="px-6 py-4 text-right">
                      {isEditingThis ? (
                        <div className="flex items-center justify-end gap-1">
                          <span className="text-xs text-gray-400">ETB</span>
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={editing.cutting_rate_per_sqm}
                            onChange={e => setEditing(p => p ? { ...p, cutting_rate_per_sqm: e.target.value } : p)}
                            className="w-28 border-2 border-blue-400 rounded-lg px-2 py-1.5 text-sm text-right font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500"
                          />
                        </div>
                      ) : (
                        <span className="font-medium text-gray-700">
                          ETB {parseFloat(glass.cutting_rate_per_sqm).toLocaleString('en', { minimumFractionDigits: 2 })}
                        </span>
                      )}
                    </td>

                    {/* Effective Total */}
                    <td className="px-6 py-4 text-right">
                      <span className={`font-bold text-base ${isEditingThis ? 'text-blue-700' : 'text-gray-900'}`}>
                        ETB {(base + cutting).toLocaleString('en', { minimumFractionDigits: 2 })}
                      </span>
                      {isEditingThis && (
                        <p className="text-xs text-blue-500 mt-0.5">preview</p>
                      )}
                    </td>

                    {/* Actions */}
                    {canEdit && (
                      <td className="px-6 py-4 text-right">
                        {isEditingThis ? (
                          <div className="flex items-center justify-end gap-1">
                            <button
                              onClick={requestSave}
                              disabled={saving}
                              title="Save"
                              className="p-2 bg-green-500 hover:bg-green-600 text-white rounded-lg transition-colors disabled:opacity-60"
                            >
                              <Check size={15} />
                            </button>
                            <button
                              onClick={cancelEdit}
                              title="Cancel"
                              className="p-2 bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-lg transition-colors"
                            >
                              <X size={15} />
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => startEdit(glass)}
                            title="Edit prices"
                            className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                          >
                            <Pencil size={15} />
                          </button>
                        )}
                      </td>
                    )}
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Tempering rate note */}
      <div className="mt-4 flex items-start gap-2 text-xs text-gray-400 px-1">
        <Flame size={13} className="text-orange-400 mt-0.5 flex-shrink-0" />
        <span>Tempering surcharge (ETB 150/m²) and thickness multipliers are configured per thickness option in the Glass Catalog page.</span>
      </div>

      {/* ── Are You Sure Dialog ──────────────────────────────────────────── */}
      {showConfirm && editing && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 border-t-4 border-amber-400">
            <div className="w-14 h-14 rounded-full bg-amber-100 flex items-center justify-center mx-auto mb-4">
              <AlertTriangle size={28} className="text-amber-500" />
            </div>

            <h3 className="text-lg font-bold text-gray-900 text-center mb-1">Update Prices?</h3>
            <p className="text-sm text-gray-500 text-center mb-5">
              This will take effect on all new orders immediately. Existing confirmed orders are not affected.
            </p>

            {/* Change summary */}
            <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 mb-5 space-y-3 text-sm">
              <p className="font-semibold text-gray-800 text-center">{editing.name}</p>
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-white border border-gray-200 rounded-lg p-3 text-center">
                  <p className="text-xs text-gray-400 mb-1">Base Price / m²</p>
                  {editing.base_price_per_sqm !== editing.original_base ? (
                    <>
                      <p className="text-xs text-gray-400 line-through">ETB {parseFloat(editing.original_base).toFixed(2)}</p>
                      <p className="font-bold text-amber-700">ETB {parseFloat(editing.base_price_per_sqm).toFixed(2)}</p>
                    </>
                  ) : (
                    <p className="font-semibold text-gray-600">ETB {parseFloat(editing.base_price_per_sqm).toFixed(2)} <span className="text-xs font-normal text-gray-400">(unchanged)</span></p>
                  )}
                </div>
                <div className="bg-white border border-gray-200 rounded-lg p-3 text-center">
                  <p className="text-xs text-gray-400 mb-1">Cutting Rate / m²</p>
                  {editing.cutting_rate_per_sqm !== editing.original_cutting ? (
                    <>
                      <p className="text-xs text-gray-400 line-through">ETB {parseFloat(editing.original_cutting).toFixed(2)}</p>
                      <p className="font-bold text-amber-700">ETB {parseFloat(editing.cutting_rate_per_sqm).toFixed(2)}</p>
                    </>
                  ) : (
                    <p className="font-semibold text-gray-600">ETB {parseFloat(editing.cutting_rate_per_sqm).toFixed(2)} <span className="text-xs font-normal text-gray-400">(unchanged)</span></p>
                  )}
                </div>
              </div>
              <div className="border-t border-gray-200 pt-3 flex justify-between text-sm">
                <span className="text-gray-500">New Effective Total / m²</span>
                <span className="font-bold text-gray-900">
                  ETB {(parseFloat(editing.base_price_per_sqm) + parseFloat(editing.cutting_rate_per_sqm)).toFixed(2)}
                </span>
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setShowConfirm(false)}
                disabled={saving}
                className="flex-1 border border-gray-300 py-3 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 transition-colors"
              >
                Go Back
              </button>
              <button
                onClick={confirmSave}
                disabled={saving}
                className="flex-1 bg-amber-500 hover:bg-amber-600 text-white py-3 rounded-xl text-sm font-bold disabled:opacity-60 transition-colors flex items-center justify-center gap-2"
              >
                {saving
                  ? <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                  : <><Check size={16} /> Yes, Update Prices</>
                }
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

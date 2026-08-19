import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../store/authStore'
import api from '../lib/api'
import toast from 'react-hot-toast'
import { Layers, Eye, EyeOff } from 'lucide-react'

export default function LoginPage() {
  const [email, setEmail] = useState('staff@goms.com')
  const [password, setPassword] = useState('staff123')
  const [showPw, setShowPw] = useState(false)
  const [loading, setLoading] = useState(false)
  const { setAuth } = useAuthStore()
  const navigate = useNavigate()

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    try {
      const res = await api.post('/token/', { email, password })
      setAuth(res.data.user, res.data.access, res.data.refresh)
      toast.success(`Welcome back, ${res.data.user.full_name}!`)
      navigate('/staff/dashboard')
    } catch {
      toast.error('Invalid credentials. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const demoUsers = [
    { email: 'staff@goms.com', password: 'staff123', role: 'Counter Staff', color: 'bg-green-50 border-green-200 text-green-700' },
    { email: 'manager@goms.com', password: 'manager123', role: 'Manager', color: 'bg-blue-50 border-blue-200 text-blue-700' },
    { email: 'admin@goms.com', password: 'admin123', role: 'Admin', color: 'bg-purple-50 border-purple-200 text-purple-700' },
  ]

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-950 via-blue-900 to-blue-800 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-blue-500 rounded-2xl mb-4 shadow-lg">
            <Layers size={32} className="text-white" />
          </div>
          <h1 className="text-3xl font-bold text-white">GOMS</h1>
          <p className="text-blue-300 mt-1">Glass Order Management System - Demo</p>
        </div>

        {/* Card */}
        <div className="bg-white rounded-2xl shadow-2xl p-8">
          <h2 className="text-xl font-semibold text-gray-800 mb-6">Sign in to your account</h2>

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
              <div className="relative">
                <input
                  type={showPw ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent pr-10"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPw(!showPw)}
                  className="absolute right-3 top-2.5 text-gray-400 hover:text-gray-600"
                >
                  {showPw ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-blue-600 text-white py-2.5 rounded-lg font-medium hover:bg-blue-700 disabled:opacity-60 transition-colors"
            >
              {loading ? 'Signing in...' : 'Sign In'}
            </button>
          </form>

          {/* Demo Accounts */}
          <div className="mt-6">
            <p className="text-xs text-gray-500 mb-3 font-medium uppercase tracking-wide">Demo Accounts</p>
            <div className="space-y-2">
              {demoUsers.map((u) => (
                <button
                  key={u.email}
                  onClick={() => { setEmail(u.email); setPassword(u.password) }}
                  className={`w-full text-left text-xs px-3 py-2 rounded-lg border ${u.color} hover:opacity-80 transition-opacity`}
                >
                  <span className="font-semibold">{u.role}</span>
                  <span className="text-gray-500 ml-2">{u.email}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

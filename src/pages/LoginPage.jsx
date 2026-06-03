import { useState } from 'react'
import { supabase } from '../lib/supabase'

export default function LoginPage() {
  const [email,   setEmail]   = useState('')
  const [sent,    setSent]    = useState(false)
  const [error,   setError]   = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    const { error: err } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { shouldCreateUser: true },
    })
    setLoading(false)
    if (err) {
      setError("You don't have access. Contact your admin.")
    } else {
      setSent(true)
    }
  }

  return (
    <div className="min-h-screen bg-[#0C0F14] flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="w-12 h-12 rounded-xl bg-blue-600 flex items-center justify-center text-white font-bold text-xl mx-auto mb-4">W</div>
          <h1 className="text-xl font-semibold text-white">WFM · CX Staffing</h1>
          <p className="text-sm text-gray-500 mt-1">Sign in to continue</p>
        </div>

        {sent ? (
          <div className="bg-[#141922] border border-[#2A3245] rounded-xl p-6 text-center">
            <div className="text-3xl mb-3">📬</div>
            <p className="text-sm font-medium text-gray-200">Check your email</p>
            <p className="text-xs text-gray-500 mt-2">
              We sent a login link to <span className="text-gray-300">{email}</span>
            </p>
            <button
              onClick={() => { setSent(false); setEmail('') }}
              className="mt-4 text-xs text-blue-400 hover:text-blue-300 transition-colors"
            >
              Use a different email
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="bg-[#141922] border border-[#2A3245] rounded-xl p-6 space-y-4">
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1.5 uppercase tracking-wider">
                Email address
              </label>
              <input
                type="email"
                value={email}
                onChange={e => { setEmail(e.target.value); setError('') }}
                placeholder="you@company.com"
                required
                autoFocus
                className="w-full bg-[#0C0F14] border border-[#2A3245] rounded-lg px-3 py-2.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-blue-500 transition-colors"
              />
            </div>
            {error && <p className="text-xs text-red-400">{error}</p>}
            <button
              type="submit"
              disabled={loading || !email.trim()}
              className="w-full py-2.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white text-sm font-medium rounded-lg transition-colors"
            >
              {loading ? 'Sending…' : 'Send magic link'}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}

import { createContext, useContext, useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user,    setUser]    = useState(null)
  const [role,    setRole]    = useState(null)
  const [agentId, setAgentId] = useState(null)
  const [loading, setLoading] = useState(true)

  async function applySession(session) {
    if (!session?.user?.email) {
      setUser(null); setRole(null); setAgentId(null)
      return
    }
    setUser(session.user)
    const { data, error } = await supabase
      .from('app_users')
      .select('role, agent_id')
      .eq('email', session.user.email)
      .maybeSingle()
    console.log('[AuthContext] email:', session.user.email)
    console.log('[AuthContext] app_users lookup data:', data)
    console.log('[AuthContext] app_users lookup error:', JSON.stringify(error))

    if (data) {
      setRole(data.role)
      setAgentId(data.agent_id ?? null)
    } else if (session.user.email === 'ren@fractionalcx.com') {
      console.log('[AuthContext] fallback: hardcoding admin for ren@fractionalcx.com')
      setRole('admin')
      setAgentId(null)
    } else {
      setRole(null)
      setAgentId(null)
    }
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      applySession(session).finally(() => setLoading(false))
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      applySession(session)
    })

    return () => subscription.unsubscribe()
  }, [])

  const signOut = () => supabase.auth.signOut()

  return (
    <AuthContext.Provider value={{ user, role, agentId, loading, signOut }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}

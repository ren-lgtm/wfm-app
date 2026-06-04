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
    const { data } = await supabase
      .from('app_users')
      .select('role, agent_id')
      .eq('email', session.user.email)
      .maybeSingle()
    setRole(data?.role ?? null)
    setAgentId(data?.agent_id ?? null)

    // Persist the Google display name into app_users so it shows in the Users page
    const googleName = session.user.user_metadata?.full_name
    if (data && googleName) {
      supabase.from('app_users').update({ name: googleName }).eq('email', session.user.email)
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

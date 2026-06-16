import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase credentials in .env file')
}

const customStorage = {
  getItem: (key) => {
    // 1. Try localStorage first
    try {
      const val = localStorage.getItem(key)
      if (val) return val
    } catch (e) {}

    // 2. Fallback to first-party cookie if localStorage is cleared or blocked
    try {
      const name = key + "="
      const decodedCookie = decodeURIComponent(document.cookie)
      const ca = decodedCookie.split(';')
      for (let i = 0; i < ca.length; i++) {
        let c = ca[i].trim()
        if (c.indexOf(name) === 0) {
          return c.substring(name.length, c.length)
        }
      }
    } catch (e) {}

    return null
  },
  setItem: (key, value) => {
    // 1. Save to localStorage
    try {
      localStorage.setItem(key, value)
    } catch (e) {}

    // 2. Save to first-party cookie as backup (expires in 365 days)
    try {
      const d = new Date()
      d.setTime(d.getTime() + (365 * 24 * 60 * 60 * 1000))
      const expires = "expires=" + d.toUTCString()
      document.cookie = `${key}=${value};${expires};path=/;SameSite=Lax;Secure`
    } catch (e) {}
  },
  removeItem: (key) => {
    // 1. Remove from localStorage
    try {
      localStorage.removeItem(key)
    } catch (e) {}

    // 2. Remove from first-party cookie
    try {
      document.cookie = `${key}=;expires=Thu, 01 Jan 1970 00:00:00 UTC;path=/;SameSite=Lax;Secure`
    } catch (e) {}
  }
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    storage: customStorage
  },
})

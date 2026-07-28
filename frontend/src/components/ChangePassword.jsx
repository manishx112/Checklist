import { useState } from 'react'
import { supabase } from '../lib/supabase'

const MIN_LENGTH = 8

export default function ChangePassword() {
  const [open, setOpen] = useState(false)
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [show, setShow] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [saving, setSaving] = useState(false)

  function close() {
    if (saving) return
    setOpen(false)
    setPassword('')
    setConfirm('')
    setShow(false)
    setError('')
    setSuccess('')
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')

    if (password.length < MIN_LENGTH) {
      setError(`Password must be at least ${MIN_LENGTH} characters`)
      return
    }
    if (password !== confirm) {
      setError('Both passwords must match')
      return
    }

    setSaving(true)
    const { error: err } = await supabase.auth.updateUser({ password })
    setSaving(false)

    if (err) {
      setError(err.message)
      return
    }

    setSuccess('Password changed. Use the new one next time you log in.')
    setPassword('')
    setConfirm('')
    setTimeout(close, 2500)
  }

  const inputClass =
    'w-full px-4 py-2.5 bg-slate-50/50 border border-slate-200 rounded-xl text-slate-800 text-sm ' +
    'placeholder-slate-400 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-indigo-500/15 ' +
    'focus:border-indigo-500 transition-all duration-150'

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        title="Change your password"
        className="relative group overflow-hidden w-full sm:w-auto py-2.5 px-4 rounded-2xl border border-slate-200 bg-white text-slate-600 hover:text-white text-xs sm:text-sm font-bold transition-all duration-300 active:scale-98 cursor-pointer shadow-2xs hover:shadow-xs"
      >
        <span className="absolute inset-0 bg-gradient-to-r from-blue-600 to-indigo-600 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
        <span className="relative z-10 flex items-center justify-center gap-1.5">
          Password
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
          </svg>
        </span>
      </button>

      {open && (
        <div
          className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-5 z-50 animate-fade-in"
          onClick={close}
        >
          <form
            onSubmit={handleSubmit}
            onClick={e => e.stopPropagation()}
            className="bg-white rounded-3xl p-6 max-w-sm w-full shadow-2xl border border-slate-100"
          >
            <h3 className="text-lg font-extrabold text-slate-900 mb-1 flex items-center gap-2">
              <svg className="w-5 h-5 text-indigo-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
              Change Password
            </h3>
            <p className="text-xs text-slate-400 font-medium mb-5">
              Pick something only you know. Minimum {MIN_LENGTH} characters.
            </p>

            <div className="space-y-4">
              <div>
                <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                  New Password
                </label>
                <input
                  type={show ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••"
                  autoComplete="new-password"
                  disabled={saving}
                  className={inputClass}
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                  Confirm New Password
                </label>
                <input
                  type={show ? 'text' : 'password'}
                  value={confirm}
                  onChange={e => setConfirm(e.target.value)}
                  placeholder="••••••••"
                  autoComplete="new-password"
                  disabled={saving}
                  className={inputClass}
                />
              </div>

              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={show}
                  onChange={e => setShow(e.target.checked)}
                  className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500/25 cursor-pointer"
                />
                <span className="text-xs font-semibold text-slate-600">Show password</span>
              </label>
            </div>

            {error && (
              <div className="mt-4 p-3 bg-rose-50 text-rose-700 border border-rose-200 rounded-xl text-xs font-semibold">
                {error}
              </div>
            )}
            {success && (
              <div className="mt-4 p-3 bg-emerald-50 text-emerald-800 border border-emerald-200 rounded-xl text-xs font-semibold">
                {success}
              </div>
            )}

            <div className="flex gap-3 justify-end mt-6">
              <button
                type="button"
                onClick={close}
                disabled={saving}
                className="py-2.5 px-4 border border-slate-200 bg-white hover:bg-slate-50 active:scale-98 rounded-xl text-sm font-semibold text-slate-600 transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving || !!success}
                className="relative group overflow-hidden py-2.5 px-5 text-white bg-slate-900 active:scale-98 rounded-xl text-sm font-bold shadow-md transition cursor-pointer disabled:opacity-60"
              >
                <span className="absolute inset-0 bg-gradient-to-r from-blue-600 via-indigo-600 to-violet-600 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                <span className="relative z-10">{saving ? 'Saving…' : 'Update Password'}</span>
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  )
}

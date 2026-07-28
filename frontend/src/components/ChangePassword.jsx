import { useState } from 'react'
import { createPortal } from 'react-dom'
import { supabase } from '../lib/supabase'

const MIN_LENGTH = 8

const STRENGTH = [
  { label: 'Too short', bar: 'bg-slate-300',   text: 'text-slate-400',   fill: 'w-1/5'  },
  { label: 'Weak',      bar: 'bg-rose-500',    text: 'text-rose-600',    fill: 'w-2/5'  },
  { label: 'Fair',      bar: 'bg-amber-500',   text: 'text-amber-600',   fill: 'w-3/5'  },
  { label: 'Good',      bar: 'bg-lime-500',    text: 'text-lime-600',    fill: 'w-4/5'  },
  { label: 'Strong',    bar: 'bg-emerald-500', text: 'text-emerald-600', fill: 'w-full' },
]

function scorePassword(pw) {
  if (pw.length < MIN_LENGTH) return 0
  let score = 1
  if (pw.length >= 12) score++
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) score++
  if (/[0-9]/.test(pw) && /[^A-Za-z0-9]/.test(pw)) score++
  return Math.min(score, 4)
}

function EyeIcon({ off }) {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
      {off ? (
        <path strokeLinecap="round" strokeLinejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
      ) : (
        <>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
        </>
      )}
    </svg>
  )
}

export default function ChangePassword() {
  const [open, setOpen] = useState(false)
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [show, setShow] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [saving, setSaving] = useState(false)

  const score = scorePassword(password)
  const strength = STRENGTH[score]
  const matches = confirm.length > 0 && password === confirm
  const mismatch = confirm.length > 0 && password !== confirm
  const canSubmit = password.length >= MIN_LENGTH && matches && !saving && !success

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

    if (err) { setError(err.message); return }

    setSuccess('Password changed. Use the new one next time you log in.')
    setTimeout(close, 2500)
  }

  const inputClass =
    'w-full pl-11 pr-11 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-slate-800 text-sm ' +
    'placeholder-slate-300 focus:bg-white focus:outline-hidden focus:ring-4 focus:ring-indigo-500/10 ' +
    'focus:border-indigo-400 transition-all duration-200'

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

      {/* Rendered into document.body via a portal: the parent <header> has
          backdrop-blur, which makes it the containing block for position:fixed
          children — the overlay would otherwise be clipped to the header. */}
      {open && createPortal(
        <div
          className="fixed inset-0 bg-slate-900/50 backdrop-blur-md flex items-end sm:items-center justify-center z-50 animate-fade-in"
          onClick={close}
        >
          <form
            onSubmit={handleSubmit}
            onClick={e => e.stopPropagation()}
            className="relative bg-white w-full sm:max-w-[400px] rounded-t-[28px] sm:rounded-[28px] shadow-2xl shadow-slate-900/20 max-h-[92vh] overflow-y-auto no-scrollbar animate-slide-up"
          >
            {/* Gradient hairline */}
            <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-blue-500 via-indigo-500 to-violet-500 rounded-t-[28px]" />

            {/* Mobile drag handle */}
            <div className="sm:hidden flex justify-center pt-3">
              <div className="w-10 h-1 rounded-full bg-slate-200" />
            </div>

            <div className="p-6 pb-8 sm:pb-6">
              {/* Icon + title */}
              <div className="flex flex-col items-center text-center mb-6">
                <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-blue-600 to-indigo-600 flex items-center justify-center shadow-lg shadow-indigo-600/25 mb-3">
                  <svg className="w-7 h-7 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                </div>
                <h3 className="text-xl font-black text-slate-900 tracking-tight">Change Password</h3>
                <p className="text-xs text-slate-400 font-medium mt-1">
                  Pick something only you know
                </p>
              </div>

              {success ? (
                /* Success state replaces the whole form */
                <div className="flex flex-col items-center text-center py-6 animate-fade-in">
                  <div className="w-16 h-16 rounded-full bg-emerald-50 border-2 border-emerald-200 flex items-center justify-center mb-4">
                    <svg className="w-8 h-8 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <p className="text-sm font-bold text-slate-800">Password changed</p>
                  <p className="text-xs text-slate-400 font-medium mt-1 max-w-[240px]">
                    Use the new one the next time you log in.
                  </p>
                </div>
              ) : (
                <>
                  <div className="space-y-4">
                    {/* New password */}
                    <div>
                      <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2">
                        New Password
                      </label>
                      <div className="relative">
                        <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300">
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.2">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                          </svg>
                        </span>
                        <input
                          type={show ? 'text' : 'password'}
                          value={password}
                          onChange={e => setPassword(e.target.value)}
                          placeholder="••••••••"
                          autoComplete="new-password"
                          disabled={saving}
                          className={inputClass}
                        />
                        <button
                          type="button"
                          onClick={() => setShow(s => !s)}
                          tabIndex={-1}
                          aria-label={show ? 'Hide password' : 'Show password'}
                          className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition cursor-pointer"
                        >
                          <EyeIcon off={show} />
                        </button>
                      </div>

                      {/* Strength meter */}
                      <div className={`flex items-center gap-3 mt-2.5 transition-opacity duration-200 ${password ? 'opacity-100' : 'opacity-0'}`}>
                        <div className="flex-grow h-1.5 bg-slate-100 rounded-full overflow-hidden">
                          <div className={`h-full rounded-full transition-all duration-300 ${strength.bar} ${strength.fill}`} />
                        </div>
                        <span className={`text-[10px] font-black uppercase tracking-wider ${strength.text}`}>
                          {strength.label}
                        </span>
                      </div>
                    </div>

                    {/* Confirm */}
                    <div>
                      <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2">
                        Confirm New Password
                      </label>
                      <div className="relative">
                        <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300">
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.2">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                        </span>
                        <input
                          type={show ? 'text' : 'password'}
                          value={confirm}
                          onChange={e => setConfirm(e.target.value)}
                          placeholder="••••••••"
                          autoComplete="new-password"
                          disabled={saving}
                          className={`${inputClass} ${mismatch ? 'border-rose-300 bg-rose-50/40' : ''} ${matches ? 'border-emerald-300 bg-emerald-50/40' : ''}`}
                        />
                        {matches && (
                          <span className="absolute right-4 top-1/2 -translate-y-1/2 text-emerald-500">
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                            </svg>
                          </span>
                        )}
                      </div>
                      {mismatch && (
                        <p className="text-[11px] font-bold text-rose-500 mt-2">Passwords do not match</p>
                      )}
                    </div>
                  </div>

                  {error && (
                    <div className="mt-4 p-3.5 bg-rose-50 text-rose-700 border border-rose-200 rounded-2xl text-xs font-semibold flex items-start gap-2">
                      <svg className="w-4 h-4 flex-shrink-0 mt-px" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                      </svg>
                      <span>{error}</span>
                    </div>
                  )}

                  <div className="flex flex-col-reverse sm:flex-row gap-2.5 mt-6">
                    <button
                      type="button"
                      onClick={close}
                      disabled={saving}
                      className="flex-1 py-3 border border-slate-200 bg-white hover:bg-slate-50 active:scale-98 rounded-2xl text-sm font-bold text-slate-600 transition cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={!canSubmit}
                      className="relative group overflow-hidden flex-1 py-3 text-white bg-slate-900 active:scale-98 rounded-2xl text-sm font-bold shadow-lg shadow-slate-900/15 transition-all duration-300 cursor-pointer disabled:bg-slate-200 disabled:text-slate-400 disabled:shadow-none disabled:cursor-not-allowed"
                    >
                      <span className="absolute inset-0 bg-gradient-to-r from-blue-600 via-indigo-600 to-violet-600 opacity-0 group-enabled:group-hover:opacity-100 transition-opacity duration-300" />
                      <span className="relative z-10">{saving ? 'Saving…' : 'Update Password'}</span>
                    </button>
                  </div>
                </>
              )}
            </div>
          </form>
        </div>,
        document.body
      )}
    </>
  )
}

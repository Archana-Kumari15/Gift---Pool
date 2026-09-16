import { useEffect, useMemo, useState } from 'react'
import './App.css'

const currencyFormatter = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

const formatMoney = (value) => currencyFormatter.format(Number(value || 0))

const emptyImportSummary = {
  cleanedEntries: [],
  cleanedMap: {},
  byName: {},
  imported: 0,
  accepted: 0,
  rejected: [],
  uniqueCount: 0,
  mergedCount: 0,
}

const normalizeName = (value) =>
  String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ')

const parseAmount = (raw) => {
  const cleaned = String(raw || '').replace(/[₹,\s]/g, '').replace(/\((.*)\)/g, '$1')
  const numeric = Number(cleaned)
  return Number.isFinite(numeric) ? Number(numeric.toFixed(2)) : null
}

const parseContributionLine = (originalLine) => {
  const line = String(originalLine || '').trim()
  if (!line) return { valid: false, reason: 'Empty row' }

  const matches = [...line.matchAll(/-?\d+(?:[.,]\d+)?/g)]
  if (!matches.length) return { valid: false, reason: 'No numeric amount found' }

  const amountText = matches[matches.length - 1][0]
  const amount = parseAmount(amountText)
  if (amount === null) return { valid: false, reason: 'Invalid amount' }
  if (amount < 0) return { valid: false, reason: 'Amount cannot be negative' }

  const beforeAmount = line.slice(0, line.indexOf(amountText)).replace(/[|:/;,\\-]+/g, ' ')
  const name = beforeAmount.replace(/[₹$€£]+/g, '').replace(/\s+/g, ' ').trim()

  if (!name || !normalizeName(name)) return { valid: false, reason: 'Missing payer name' }

  return {
    valid: true,
    name,
    normalized: normalizeName(name),
    amount,
  }
}

const buildImportSummary = (rawText) => {
  const entries = rawText
    .split(/\n|;/)
    .map((line) => line.trim())
    .filter(Boolean)

  const merged = new Map()
  const rejected = []

  entries.forEach((entry) => {
    const parsed = parseContributionLine(entry)
    if (!parsed.valid) {
      rejected.push({ row: entry, reason: parsed.reason })
      return
    }

    const key = parsed.normalized
    const previous = merged.get(key)

    if (previous) {
      previous.amount += parsed.amount
      previous.originalNames.push(parsed.name)
      previous.duplicateRows += 1
      return
    }

    merged.set(key, {
      normalized: key,
      name: parsed.name,
      amount: parsed.amount,
      originalNames: [parsed.name],
      duplicateRows: 0,
    })
  })

  const cleanedEntries = [...merged.values()].map((entry) => ({
    normalized: entry.normalized,
    name: entry.name,
    amount: Number(entry.amount.toFixed(2)),
    duplicateRows: entry.duplicateRows,
  }))

  const cleanedMap = Object.fromEntries(
    cleanedEntries.map((entry) => [entry.normalized, entry.amount]),
  )

  const byName = Object.fromEntries(
    cleanedEntries.map((entry) => [entry.normalized, entry.name]),
  )

  return {
    cleanedEntries,
    cleanedMap,
    byName,
    imported: entries.length,
    accepted: entries.length - rejected.length,
    rejected,
    uniqueCount: cleanedEntries.length,
    mergedCount: entries.length - rejected.length - cleanedEntries.length,
  }
}

const computeSettlements = (balances) => {
  const debtors = Object.entries(balances)
    .filter(([, value]) => value < 0)
    .map(([name, value]) => [name, Math.abs(value)])

  const creditors = Object.entries(balances)
    .filter(([, value]) => value > 0)
    .map(([name, value]) => [name, value])

  const settlements = []

  while (debtors.length && creditors.length) {
    const [debtorName, debtorAmount] = debtors[0]
    const [creditorName, creditorAmount] = creditors[0]
    const amount = Math.min(Number(debtorAmount), Number(creditorAmount))

    if (amount <= 0) break

    settlements.push({
      from: debtorName,
      to: creditorName,
      amount: Number(amount.toFixed(2)),
    })

    const updatedDebtor = Number(debtorAmount) - amount
    const updatedCreditor = Number(creditorAmount) - amount

    if (updatedDebtor <= 0.01) {
      debtors.shift()
    } else {
      debtors[0][1] = updatedDebtor
    }

    if (updatedCreditor <= 0.01) {
      creditors.shift()
    } else {
      creditors[0][1] = updatedCreditor
    }
  }

  return settlements
}

const STORAGE_KEY = 'gift-pool-data'

const getInitialPoolState = () => {
  const fallback = {
    theme: 'dark',
    budget: 0,
    members: [],
    importText: '',
    summary: emptyImportSummary,
  }

  if (typeof window === 'undefined') return fallback

  const saved = localStorage.getItem(STORAGE_KEY)
  if (!saved) return fallback

  try {
    const parsed = JSON.parse(saved)
    return {
      theme: parsed.theme === 'light' ? 'light' : 'dark',
      budget: Object.hasOwn(parsed, 'budget') ? Number(parsed.budget) || 0 : 0,
      members: Array.isArray(parsed.members) ? parsed.members : [],
      importText: typeof parsed.importText === 'string' ? parsed.importText : '',
      summary: parsed.summary?.cleanedEntries ? parsed.summary : emptyImportSummary,
    }
  } catch {
    localStorage.removeItem(STORAGE_KEY)
    return fallback
  }
}

function App() {
  const [initialPool] = useState(getInitialPoolState)
  const [theme, setTheme] = useState(initialPool.theme)
  const [budget, setBudget] = useState(initialPool.budget)
  const [members, setMembers] = useState(initialPool.members)
  const [newMemberId, setNewMemberId] = useState(null)
  const [importText, setImportText] = useState(initialPool.importText)
  const [summary, setSummary] = useState(initialPool.summary)

  const isDarkTheme = theme === 'dark'

  useEffect(() => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ budget, members, importText, summary, theme }),
    )
  }, [budget, members, importText, summary, theme])

  const handleAddMember = () => {
    const id = Date.now()
    setMembers((current) => [...current, { id, name: '', paid: 0 }])
    setNewMemberId(id)
  }

  const handleMemberChange = (id, field, value) => {
    setMembers((current) =>
      current.map((member) =>
        member.id === id
          ? {
              ...member,
                    [field]:
                      field === 'paid'
                        ? Math.max(0, Number(value || 0))
                        : value,
            }
          : member,
      ),
    )
  }

  const handleRemoveMember = (id) => {
    setMembers((current) => current.filter((member) => member.id !== id))
    setNewMemberId((current) => (current === id ? null : current))
  }

  const handleResetPool = () => {
    if (!window.confirm('Clear this pool and all saved contribution data?')) return

    setBudget(0)
    setMembers([])
    setNewMemberId(null)
    setImportText('')
    setSummary(emptyImportSummary)
  }

  const handleImport = () => {
    const nextSummary = buildImportSummary(importText)
    setSummary(nextSummary)

    const mergedMembers = members.map((member) => {
      const normalized = normalizeName(member.name)
      const cleaned = nextSummary.cleanedMap[normalized]
      return {
        ...member,
        paid: cleaned ?? member.paid,
      }
    })

    const namesFromImport = Object.keys(nextSummary.cleanedMap)
    namesFromImport.forEach((normalizedName) => {
      const canonicalName = nextSummary.byName[normalizedName]
      const alreadyExists = mergedMembers.some(
        (member) => normalizeName(member.name) === normalizedName,
      )

      if (!alreadyExists && canonicalName) {
        mergedMembers.push({
          id: Date.now() + Math.random(),
          name: canonicalName,
          paid: nextSummary.cleanedMap[normalizedName],
        })
      }
    })

    setMembers(mergedMembers.filter((member) => member.name.trim()))
  }

  const people = useMemo(
    () =>
      members
        .filter((member) => member.name && member.name.trim())
        .map((member) => ({
          ...member,
          normalized: normalizeName(member.name),
        })),
    [members],
  )

  const totalCollected = people.reduce((sum, member) => sum + Number(member.paid || 0), 0)
  const share = people.length ? Number((budget / people.length).toFixed(2)) : 0
  const stillNeeded = Math.max(0, Number((budget - totalCollected).toFixed(2)))

  const balances = people.map((person) => ({
    ...person,
    share,
    balance: Number((Number(person.paid || 0) - share).toFixed(2)),
  }))

  const settlements = computeSettlements(
    Object.fromEntries(balances.map((person) => [person.name, person.balance])),
  )

  const statusText =
    !people.length
      ? 'Add members and set a budget to start tracking this pool.'
      : stillNeeded === 0
      ? 'The pool is fully funded.'
      : `We still need ${formatMoney(stillNeeded)} to hit the target.`

  return (
    <main
      className={`app-shell min-h-screen px-4 py-6 transition-colors duration-300 sm:px-6 lg:px-8 ${
        isDarkTheme ? 'bg-slate-950 text-slate-100' : 'bg-slate-100 text-slate-800'
      }`}
    >
      <div className="mx-auto max-w-7xl space-y-6">
        <header
          className={`rounded-3xl border p-5 shadow-2xl backdrop-blur-sm sm:p-6 ${
            isDarkTheme
              ? 'border-sky-500/30 bg-slate-900/80 shadow-sky-950/40'
              : 'border-sky-300 bg-white/90 shadow-sky-200/80'
          }`}
        >
          <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div className="brand-block">
              <div className="mb-4 flex items-center gap-3">
                <span className={`brand-mark ${isDarkTheme ? 'brand-mark-dark' : 'brand-mark-light'}`}>
                  GP
                </span>
                <p
                  className={`text-xs font-semibold uppercase tracking-[0.22em] sm:text-sm ${
                    isDarkTheme ? 'text-sky-300' : 'text-sky-600'
                  }`}
                >
                  Shared contribution organizer
                </p>
              </div>
              <p className={`brand-kicker ${isDarkTheme ? 'text-slate-400' : 'text-slate-500'}`}>
                One pool. Clear numbers. Fair finish.
              </p>
              <h1
                className={`brand-title mt-1 tracking-tight ${
                  isDarkTheme ? 'text-white' : 'text-slate-900'
                }`}
              >
                Gift<span>-</span>Pool
              </h1>
              <p className={`mt-3 max-w-xl text-sm sm:text-base ${isDarkTheme ? 'text-slate-300' : 'text-slate-600'}`}>
                Track contributions, clean messy imports, and settle every share fairly.
              </p>
            </div>
            <div className={`app-actions flex items-center gap-3 ${isDarkTheme ? 'actions-dark' : 'actions-light'}`}>
              <button
                type="button"
                onClick={() => setTheme(isDarkTheme ? 'light' : 'dark')}
                aria-label={`Switch to ${isDarkTheme ? 'light' : 'dark'} mode`}
                className={`app-control theme-control rounded-full border px-4 py-2 text-sm font-semibold transition ${
                  isDarkTheme
                    ? 'border-sky-400/60 bg-sky-500/10 text-sky-100 hover:bg-sky-500/20'
                    : 'border-sky-300 bg-sky-100 text-sky-700 hover:bg-sky-200'
                }`}
              >
                {isDarkTheme ? 'Light mode' : 'Dark mode'}
              </button>
              <button
                type="button"
                onClick={handleResetPool}
                aria-label="Reset pool data"
                className={`app-control reset-control rounded-full border px-4 py-2 text-sm font-semibold transition ${
                  isDarkTheme
                    ? 'border-rose-400/50 bg-rose-500/10 text-rose-100 hover:bg-rose-500/20'
                    : 'border-rose-300 bg-rose-50 text-rose-700 hover:bg-rose-100'
                }`}
              >
                Reset pool
              </button>
            </div>
          </div>
        </header>

        <section className="stats-grid">
          <div
            className={`rounded-2xl border p-4 sm:p-5 ${
              isDarkTheme
                ? 'border-emerald-500/35 bg-emerald-500/10'
                : 'border-emerald-300 bg-emerald-50'
            }`}
          >
            <p className={`text-xs uppercase tracking-[0.2em] ${isDarkTheme ? 'text-emerald-200' : 'text-emerald-700'}`}>
              Budget
            </p>
            <p className={`mt-3 text-2xl font-bold sm:text-3xl ${isDarkTheme ? 'text-white' : 'text-emerald-700'}`}>
              {formatMoney(budget)}
            </p>
          </div>
          <div
            className={`rounded-2xl border p-4 sm:p-5 ${
              isDarkTheme
                ? 'border-violet-500/35 bg-violet-500/10'
                : 'border-violet-300 bg-violet-50'
            }`}
          >
            <p className={`text-xs uppercase tracking-[0.2em] ${isDarkTheme ? 'text-violet-200' : 'text-violet-700'}`}>
              Share
            </p>
            <p className={`mt-3 text-2xl font-bold sm:text-3xl ${isDarkTheme ? 'text-white' : 'text-violet-700'}`}>
              {formatMoney(share)}
            </p>
          </div>
          <div
            className={`rounded-2xl border p-4 sm:p-5 ${
              isDarkTheme
                ? 'border-amber-500/35 bg-amber-500/10'
                : 'border-amber-300 bg-amber-50'
            }`}
          >
            <p className={`text-xs uppercase tracking-[0.2em] ${isDarkTheme ? 'text-amber-200' : 'text-amber-700'}`}>
              Collected
            </p>
            <p className={`mt-3 text-2xl font-bold sm:text-3xl ${isDarkTheme ? 'text-white' : 'text-amber-700'}`}>
              {formatMoney(totalCollected)}
            </p>
          </div>
          <div
            className={`rounded-2xl border p-4 sm:p-5 ${
              isDarkTheme
                ? 'border-rose-500/35 bg-rose-500/10'
                : 'border-rose-300 bg-rose-50'
            }`}
          >
            <p className={`text-xs uppercase tracking-[0.2em] ${isDarkTheme ? 'text-rose-200' : 'text-rose-700'}`}>
              Still needed
            </p>
            <p className={`mt-3 text-2xl font-bold sm:text-3xl ${isDarkTheme ? 'text-white' : 'text-rose-700'}`}>
              {formatMoney(stillNeeded)}
            </p>
          </div>
        </section>

        <div
          className={`rounded-2xl border p-4 text-sm shadow-lg ${
            isDarkTheme
              ? 'border-slate-700 bg-slate-900/70 text-slate-200 shadow-slate-950/30'
              : 'border-slate-200 bg-white text-slate-700 shadow-slate-200/70'
          }`}
        >
          <span
            className={
              stillNeeded === 0
                ? isDarkTheme
                  ? 'text-emerald-300'
                  : 'text-emerald-700'
                : isDarkTheme
                  ? 'text-amber-300'
                  : 'text-amber-700'
            }
          >
            {statusText}
          </span>
        </div>

        <section className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
          <div
            className={`rounded-3xl border p-4 shadow-lg sm:p-5 ${
              isDarkTheme
                ? 'border-slate-700 bg-slate-900/80 shadow-slate-950/30'
                : 'border-slate-200 bg-white shadow-slate-200/80'
            }`}
          >
            <div className="mb-4 flex items-center justify-between gap-3">
              <h2 className={`text-xl font-semibold ${isDarkTheme ? 'text-white' : 'text-slate-900'}`}>
                Pool setup
              </h2>
              <button
                type="button"
                onClick={handleAddMember}
                className={`rounded-lg border px-3 py-2 text-sm font-medium transition ${
                  isDarkTheme
                    ? 'border-sky-500/40 bg-sky-500/10 text-sky-100 hover:bg-sky-500/20'
                    : 'border-sky-300 bg-sky-50 text-sky-700 hover:bg-sky-100'
                }`}
              >
                + Add member
              </button>
            </div>

            <label className={`mb-4 block text-sm ${isDarkTheme ? 'text-slate-300' : 'text-slate-600'}`}>
              <span className="flex items-center justify-between gap-3">
                <span>Budget (₹)</span>
                <span className="text-xs text-slate-400">Updates live</span>
              </span>
              <input
                type="number"
                min="0"
                step="0.01"
                value={budget}
                onChange={(event) => setBudget(Math.max(0, Number(event.target.value || 0)))}
                className={`mt-2 w-full rounded-xl border px-3 py-2.5 outline-none transition ${
                  isDarkTheme
                    ? 'border-slate-600 bg-slate-950 text-white focus:border-sky-400'
                    : 'border-slate-300 bg-slate-50 text-slate-900 focus:border-sky-500'
                }`}
              />
            </label>

            <p className="mb-4 text-xs text-slate-400">
              Add a member and enter their payment to update totals, balances, and settlements live.
            </p>

            <div className="space-y-3">
              {members.length ? (
                members.map((member, index) => (
                  <div
                    key={member.id}
                    className={`grid gap-3 rounded-2xl border p-3 sm:grid-cols-[1.2fr_0.8fr_auto] ${
                      isDarkTheme
                        ? 'border-slate-700 bg-slate-950/60'
                        : 'border-slate-200 bg-slate-50'
                    }`}
                  >
                    <label className={`text-sm ${isDarkTheme ? 'text-slate-300' : 'text-slate-600'}`}>
                      Name
                      <input
                        type="text"
                        value={member.name}
                        autoFocus={member.id === newMemberId}
                        onFocus={() => setNewMemberId(null)}
                        onChange={(event) =>
                          handleMemberChange(member.id, 'name', event.target.value)
                        }
                        className={`mt-2 w-full rounded-xl border px-3 py-2 outline-none transition ${
                          isDarkTheme
                            ? 'border-slate-600 bg-slate-900 text-white focus:border-sky-400'
                            : 'border-slate-300 bg-white text-slate-900 focus:border-sky-500'
                        }`}
                        placeholder={`Member ${index + 1}`}
                      />
                    </label>

                    <label className={`text-sm ${isDarkTheme ? 'text-slate-300' : 'text-slate-600'}`}>
                      Paid
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={member.paid}
                        onChange={(event) =>
                          handleMemberChange(member.id, 'paid', event.target.value)
                        }
                        className={`mt-2 w-full rounded-xl border px-3 py-2 outline-none transition ${
                          isDarkTheme
                            ? 'border-slate-600 bg-slate-900 text-white focus:border-sky-400'
                            : 'border-slate-300 bg-white text-slate-900 focus:border-sky-500'
                        }`}
                      />
                    </label>

                    <button
                      type="button"
                      onClick={() => handleRemoveMember(member.id)}
                      className={`self-end rounded-xl border px-3 py-2 text-sm font-medium transition ${
                        isDarkTheme
                          ? 'border-rose-500/40 bg-rose-500/10 text-rose-100 hover:bg-rose-500/20'
                          : 'border-rose-300 bg-rose-50 text-rose-700 hover:bg-rose-100'
                      }`}
                    >
                      Remove
                    </button>
                  </div>
                ))
              ) : (
                <div
                  className={`rounded-2xl border border-dashed p-6 text-center text-sm ${
                    isDarkTheme
                      ? 'border-slate-600 bg-slate-950/40 text-slate-400'
                      : 'border-slate-300 bg-slate-50 text-slate-500'
                  }`}
                >
                  No members yet. Click “+ Add member” to start the pool.
                </div>
              )}
            </div>
          </div>

          <div
            className={`rounded-3xl border p-4 shadow-lg sm:p-5 ${
              isDarkTheme
                ? 'border-slate-700 bg-slate-900/80 shadow-slate-950/30'
                : 'border-slate-200 bg-white shadow-slate-200/80'
            }`}
          >
            <h2 className={`mb-4 text-xl font-semibold ${isDarkTheme ? 'text-white' : 'text-slate-900'}`}>
              Messy import
            </h2>

            <label className={`block text-sm ${isDarkTheme ? 'text-slate-300' : 'text-slate-600'}`}>
              Past contributions
              <span className="mt-1 block text-xs text-slate-400">
                Paste one contribution per line. Names, separators, currency symbols, and commas can vary.
              </span>
              <textarea
                rows="10"
                value={importText}
                onChange={(event) => setImportText(event.target.value)}
                className={`mt-2 w-full rounded-xl border px-3 py-2.5 outline-none transition ${
                  isDarkTheme
                    ? 'border-slate-600 bg-slate-950 text-white focus:border-sky-400'
                    : 'border-slate-300 bg-slate-50 text-slate-900 focus:border-sky-500'
                }`}
                placeholder="Asha: ₹900
asha / 90
Ravi, 750
Meera | 600
bad row"
              />
            </label>

            <button
              type="button"
              onClick={handleImport}
              className={`mt-4 w-full rounded-xl px-4 py-2.5 font-semibold transition ${
                isDarkTheme
                  ? 'bg-sky-500 text-white hover:bg-sky-400'
                  : 'bg-sky-600 text-white hover:bg-sky-500'
              }`}
            >
              Clean + import
            </button>
          </div>
        </section>

        <section className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
          <div
            className={`rounded-3xl border p-4 shadow-lg sm:p-5 ${
              isDarkTheme
                ? 'border-slate-700 bg-slate-900/80 shadow-slate-950/30'
                : 'border-slate-200 bg-white shadow-slate-200/80'
            }`}
          >
            <h2 className={`mb-4 text-xl font-semibold ${isDarkTheme ? 'text-white' : 'text-slate-900'}`}>
              Import report
            </h2>

            <div className="grid gap-3 sm:grid-cols-2" aria-live="polite">
              <div
                className={`rounded-2xl border p-3 ${
                  isDarkTheme ? 'border-slate-700 bg-slate-950' : 'border-slate-200 bg-slate-50'
                }`}
              >
                <p className="text-[10px] uppercase tracking-[0.2em] text-slate-400">Rows read</p>
                <p className={`mt-2 text-2xl font-bold ${isDarkTheme ? 'text-white' : 'text-slate-900'}`}>
                  {summary.imported}
                </p>
              </div>
              <div
                className={`rounded-2xl border p-3 ${
                  isDarkTheme ? 'border-slate-700 bg-slate-950' : 'border-slate-200 bg-slate-50'
                }`}
              >
                <p className="text-[10px] uppercase tracking-[0.2em] text-slate-400">Accepted</p>
                <p className={`mt-2 text-2xl font-bold ${isDarkTheme ? 'text-white' : 'text-slate-900'}`}>
                  {summary.accepted}
                </p>
              </div>
              <div
                className={`rounded-2xl border p-3 ${
                  isDarkTheme ? 'border-slate-700 bg-slate-950' : 'border-slate-200 bg-slate-50'
                }`}
              >
                <p className="text-[10px] uppercase tracking-[0.2em] text-slate-400">Unique</p>
                <p className={`mt-2 text-2xl font-bold ${isDarkTheme ? 'text-white' : 'text-slate-900'}`}>
                  {summary.uniqueCount}
                </p>
              </div>
              <div
                className={`rounded-2xl border p-3 ${
                  isDarkTheme ? 'border-slate-700 bg-slate-950' : 'border-slate-200 bg-slate-50'
                }`}
              >
                <p className="text-[10px] uppercase tracking-[0.2em] text-slate-400">Merged</p>
                <p className={`mt-2 text-2xl font-bold ${isDarkTheme ? 'text-white' : 'text-slate-900'}`}>
                  {summary.mergedCount}
                </p>
              </div>
              <div
                className={`rounded-2xl border p-3 ${
                  isDarkTheme ? 'border-slate-700 bg-slate-950' : 'border-slate-200 bg-slate-50'
                }`}
              >
                <p className="text-[10px] uppercase tracking-[0.2em] text-slate-400">Rejected</p>
                <p className={`mt-2 text-2xl font-bold ${isDarkTheme ? 'text-white' : 'text-slate-900'}`}>
                  {summary.rejected.length}
                </p>
              </div>
            </div>

            <div
              className={`mt-5 rounded-2xl border p-4 ${
                isDarkTheme ? 'border-slate-700 bg-slate-950' : 'border-slate-200 bg-slate-50'
              }`}
            >
              <p className={`text-sm font-medium ${isDarkTheme ? 'text-slate-200' : 'text-slate-700'}`}>
                Cleaned entries
              </p>
              <ul className={`mt-3 space-y-2 text-sm ${isDarkTheme ? 'text-slate-300' : 'text-slate-600'}`}>
                {summary.cleanedEntries.length ? (
                  summary.cleanedEntries.map((entry) => (
                    <li
                      key={entry.normalized}
                      className={`flex items-center justify-between gap-3 rounded-lg border px-3 py-2 ${
                        isDarkTheme
                          ? 'border-slate-800 bg-slate-900'
                          : 'border-slate-200 bg-white'
                      }`}
                    >
                      <span>
                        {entry.name}
                        {entry.duplicateRows > 0 && (
                          <span className="ml-2 text-xs text-slate-400">
                            +{entry.duplicateRows} merged
                          </span>
                        )}
                      </span>
                      <span className={`font-semibold ${isDarkTheme ? 'text-emerald-300' : 'text-emerald-700'}`}>
                        {formatMoney(entry.amount)}
                      </span>
                    </li>
                  ))
                ) : (
                  <li className={isDarkTheme ? 'text-slate-400' : 'text-slate-500'}>
                    No valid contributions yet.
                  </li>
                )}
              </ul>
            </div>

            {summary.rejected.length > 0 && (
              <div
                className={`mt-5 rounded-2xl border p-4 ${
                  isDarkTheme
                    ? 'border-rose-500/30 bg-rose-500/10'
                    : 'border-rose-200 bg-rose-50'
                }`}
              >
                <p className={`text-sm font-medium ${isDarkTheme ? 'text-rose-100' : 'text-rose-700'}`}>
                  Rejected rows
                </p>
                <ul className={`mt-3 space-y-2 text-sm ${isDarkTheme ? 'text-rose-200' : 'text-rose-700'}`}>
                  {summary.rejected.map((item, index) => (
                    <li
                      key={`${item.row}-${index}`}
                      className={`rounded-lg border px-3 py-2 ${
                        isDarkTheme
                          ? 'border-rose-400/30 bg-slate-950/60'
                          : 'border-rose-200 bg-white'
                      }`}
                    >
                      “{item.row}” — {item.reason}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          <div
            className={`rounded-3xl border p-4 shadow-lg sm:p-5 ${
              isDarkTheme
                ? 'border-slate-700 bg-slate-900/80 shadow-slate-950/30'
                : 'border-slate-200 bg-white shadow-slate-200/80'
            }`}
          >
            <h2 className={`mb-4 text-xl font-semibold ${isDarkTheme ? 'text-white' : 'text-slate-900'}`}>
              Balances & settlements
            </h2>

            <div className="overflow-x-auto">
              <table className={`min-w-full text-left text-sm ${isDarkTheme ? 'text-slate-200' : 'text-slate-700'}`}>
                <thead>
                  <tr className={`border-b ${isDarkTheme ? 'border-slate-700 text-slate-400' : 'border-slate-200 text-slate-500'}`}>
                    <th className="pb-3 pr-4 font-medium">Person</th>
                    <th className="pb-3 pr-4 font-medium">Paid</th>
                    <th className="pb-3 pr-4 font-medium">Share</th>
                    <th className="pb-3 pr-4 font-medium">Balance</th>
                  </tr>
                </thead>
                <tbody>
                  {balances.map((person) => (
                    <tr key={person.id} className={`border-b ${isDarkTheme ? 'border-slate-800' : 'border-slate-200'}`}>
                      <td className={`py-3 pr-4 font-medium ${isDarkTheme ? 'text-white' : 'text-slate-900'}`}>
                        {person.name || 'Unnamed'}
                      </td>
                      <td className="py-3 pr-4">{formatMoney(person.paid)}</td>
                      <td className="py-3 pr-4">{formatMoney(person.share)}</td>
                      <td
                        className={`py-3 pr-4 font-semibold ${
                          person.balance > 0
                            ? isDarkTheme
                              ? 'text-emerald-300'
                              : 'text-emerald-700'
                            : person.balance < 0
                              ? isDarkTheme
                                ? 'text-rose-300'
                                : 'text-rose-700'
                              : 'text-slate-300'
                        }`}
                      >
                        {formatMoney(person.balance)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div
              className={`mt-6 rounded-2xl border p-4 ${
                isDarkTheme ? 'border-slate-700 bg-slate-950' : 'border-slate-200 bg-slate-50'
              }`}
            >
              <p className={`text-sm font-medium ${isDarkTheme ? 'text-slate-200' : 'text-slate-700'}`}>
                Final settlement list
              </p>
              {settlements.length ? (
                <ul className={`mt-3 space-y-2 text-sm ${isDarkTheme ? 'text-slate-300' : 'text-slate-600'}`}>
                  {settlements.map((transfer, index) => (
                    <li
                      key={`${transfer.from}-${transfer.to}-${index}`}
                      className={`rounded-lg border px-3 py-2 ${
                        isDarkTheme
                          ? 'border-slate-800 bg-slate-900'
                          : 'border-slate-200 bg-white'
                      }`}
                    >
                      {transfer.from} pays {transfer.to} {formatMoney(transfer.amount)}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className={`mt-3 text-sm ${isDarkTheme ? 'text-emerald-300' : 'text-emerald-700'}`}>
                  Everyone is settled. No transfers are needed.
                </p>
              )}
            </div>
          </div>
        </section>
      </div>
    </main>
  )
}

export default App

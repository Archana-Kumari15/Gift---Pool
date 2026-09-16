import { useEffect, useMemo, useState } from 'react'
import './App.css'

const demoMembers = [
  { id: 1, name: 'Asha', paid: 900 },
  { id: 2, name: 'Ravi', paid: 750 },
  { id: 3, name: 'Meera', paid: 600 },
  { id: 4, name: 'Ishaan', paid: 750 },
  { id: 5, name: 'Neha', paid: 1000 },
  { id: 6, name: 'Karan', paid: 825 },
  { id: 7, name: 'Pooja', paid: 750 },
  { id: 8, name: 'Sahil', paid: 425 },
]

const demoImport = `Asha: ₹900
Ravi, 750
Meera | 600
Ishaan 750
Neha: 1,000
Karan, 825
Pooja 750
Sahil, ₹425
Asha / 90
Asha 60
Mina - 1200
bad row
`

const currencyFormatter = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

const formatMoney = (value) => currencyFormatter.format(Number(value || 0))

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

  const beforeAmount = line.slice(0, line.indexOf(amountText)).replace(/[|:/;,\\-]+/g, ' ')
  const name = beforeAmount.replace(/[₹$€£]+/g, '').replace(/\s+/g, ' ').trim()

  if (!name) return { valid: false, reason: 'Missing payer name' }

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
    rejected,
    uniqueCount: cleanedEntries.length,
    mergedCount: entries.length - cleanedEntries.length,
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

function App() {
  const [budget, setBudget] = useState(6000)
  const [members, setMembers] = useState(demoMembers)
  const [importText, setImportText] = useState(demoImport)
  const [summary, setSummary] = useState(() => buildImportSummary(demoImport))

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (!saved) return

    try {
      const parsed = JSON.parse(saved)
      if (parsed.budget) setBudget(parsed.budget)
      if (parsed.members?.length) setMembers(parsed.members)
      if (parsed.importText) setImportText(parsed.importText)
      if (parsed.summary) setSummary(parsed.summary)
    } catch {
      localStorage.removeItem(STORAGE_KEY)
    }
  }, [])

  useEffect(() => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ budget, members, importText, summary }),
    )
  }, [budget, members, importText, summary])

  const handleAddMember = () => {
    setMembers((current) => [...current, { id: Date.now(), name: '', paid: 0 }])
  }

  const handleMemberChange = (id, field, value) => {
    setMembers((current) =>
      current.map((member) =>
        member.id === id
          ? {
              ...member,
              [field]: field === 'paid' ? Number(value || 0) : value,
            }
          : member,
      ),
    )
  }

  const handleRemoveMember = (id) => {
    setMembers((current) => current.filter((member) => member.id !== id))
  }

  const handleLoadDemo = () => {
    setBudget(6000)
    setMembers(demoMembers)
    setImportText(demoImport)
    setSummary(buildImportSummary(demoImport))
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
    stillNeeded === 0
      ? 'The pool is fully funded.'
      : `We still need ${formatMoney(stillNeeded)} to hit the target.`

  return (
    <main className="min-h-screen px-4 py-6 text-slate-100 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="rounded-3xl border border-sky-500/30 bg-slate-900/80 p-5 shadow-2xl shadow-sky-950/40 backdrop-blur-sm sm:p-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-sky-300 sm:text-sm">
                Farewell Gift Pool
              </p>
              <h1 className="mt-2 text-2xl font-bold tracking-tight text-white sm:text-4xl">
                Fair split & settlement tracker
              </h1>
            </div>
            <button
              type="button"
              onClick={handleLoadDemo}
              className="rounded-full border border-sky-400/60 bg-sky-500/10 px-4 py-2 text-sm font-semibold text-sky-100 transition hover:bg-sky-500/20"
            >
              Load demo data
            </button>
          </div>
        </header>

        <section className="stats-grid">
          <div className="rounded-2xl border border-emerald-500/35 bg-emerald-500/10 p-4 sm:p-5">
            <p className="text-xs uppercase tracking-[0.2em] text-emerald-200">Budget</p>
            <p className="mt-3 text-2xl font-bold text-white sm:text-3xl">{formatMoney(budget)}</p>
          </div>
          <div className="rounded-2xl border border-violet-500/35 bg-violet-500/10 p-4 sm:p-5">
            <p className="text-xs uppercase tracking-[0.2em] text-violet-200">Share</p>
            <p className="mt-3 text-2xl font-bold text-white sm:text-3xl">{formatMoney(share)}</p>
          </div>
          <div className="rounded-2xl border border-amber-500/35 bg-amber-500/10 p-4 sm:p-5">
            <p className="text-xs uppercase tracking-[0.2em] text-amber-200">Collected</p>
            <p className="mt-3 text-2xl font-bold text-white sm:text-3xl">{formatMoney(totalCollected)}</p>
          </div>
          <div className="rounded-2xl border border-rose-500/35 bg-rose-500/10 p-4 sm:p-5">
            <p className="text-xs uppercase tracking-[0.2em] text-rose-200">Still needed</p>
            <p className="mt-3 text-2xl font-bold text-white sm:text-3xl">{formatMoney(stillNeeded)}</p>
          </div>
        </section>

        <div className="rounded-2xl border border-slate-700 bg-slate-900/70 p-4 text-sm text-slate-200 shadow-lg shadow-slate-950/30">
          <span className={stillNeeded === 0 ? 'text-emerald-300' : 'text-amber-300'}>
            {statusText}
          </span>
        </div>

        <section className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
          <div className="rounded-3xl border border-slate-700 bg-slate-900/80 p-4 shadow-lg shadow-slate-950/30 sm:p-5">
            <div className="mb-4 flex items-center justify-between gap-3">
              <h2 className="text-xl font-semibold text-white">Pool setup</h2>
              <button
                type="button"
                onClick={handleAddMember}
                className="rounded-lg border border-sky-500/40 bg-sky-500/10 px-3 py-2 text-sm font-medium text-sky-100 transition hover:bg-sky-500/20"
              >
                + Add member
              </button>
            </div>

            <label className="mb-4 block text-sm text-slate-300">
              Budget (₹)
              <input
                type="number"
                min="0"
                step="0.01"
                value={budget}
                onChange={(event) => setBudget(Number(event.target.value || 0))}
                className="mt-2 w-full rounded-xl border border-slate-600 bg-slate-950 px-3 py-2.5 text-white outline-none transition focus:border-sky-400"
              />
            </label>

            <div className="space-y-3">
              {members.map((member, index) => (
                <div
                  key={member.id}
                  className="grid gap-3 rounded-2xl border border-slate-700 bg-slate-950/60 p-3 sm:grid-cols-[1.2fr_0.8fr_auto]"
                >
                  <label className="text-sm text-slate-300">
                    Name
                    <input
                      type="text"
                      value={member.name}
                      onChange={(event) =>
                        handleMemberChange(member.id, 'name', event.target.value)
                      }
                      className="mt-2 w-full rounded-xl border border-slate-600 bg-slate-900 px-3 py-2 text-white outline-none transition focus:border-sky-400"
                      placeholder={`Member ${index + 1}`}
                    />
                  </label>

                  <label className="text-sm text-slate-300">
                    Paid
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={member.paid}
                      onChange={(event) =>
                        handleMemberChange(member.id, 'paid', event.target.value)
                      }
                      className="mt-2 w-full rounded-xl border border-slate-600 bg-slate-900 px-3 py-2 text-white outline-none transition focus:border-sky-400"
                    />
                  </label>

                  <button
                    type="button"
                    onClick={() => handleRemoveMember(member.id)}
                    className="self-end rounded-xl border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-sm font-medium text-rose-100 transition hover:bg-rose-500/20"
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-3xl border border-slate-700 bg-slate-900/80 p-4 shadow-lg shadow-slate-950/30 sm:p-5">
            <h2 className="mb-4 text-xl font-semibold text-white">Messy import</h2>

            <label className="block text-sm text-slate-300">
              Past contributions
              <textarea
                rows="10"
                value={importText}
                onChange={(event) => setImportText(event.target.value)}
                className="mt-2 w-full rounded-xl border border-slate-600 bg-slate-950 px-3 py-2.5 text-white outline-none transition focus:border-sky-400"
                placeholder="Asha: 900
Ravi, 750
bad row"
              />
            </label>

            <button
              type="button"
              onClick={handleImport}
              className="mt-4 w-full rounded-xl bg-sky-500 px-4 py-2.5 font-semibold text-white transition hover:bg-sky-400"
            >
              Clean + import
            </button>
          </div>
        </section>

        <section className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
          <div className="rounded-3xl border border-slate-700 bg-slate-900/80 p-4 shadow-lg shadow-slate-950/30 sm:p-5">
            <h2 className="mb-4 text-xl font-semibold text-white">Import report</h2>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl border border-slate-700 bg-slate-950 p-3">
                <p className="text-[10px] uppercase tracking-[0.2em] text-slate-400">Imported</p>
                <p className="mt-2 text-2xl font-bold text-white">{summary.imported}</p>
              </div>
              <div className="rounded-2xl border border-slate-700 bg-slate-950 p-3">
                <p className="text-[10px] uppercase tracking-[0.2em] text-slate-400">Unique</p>
                <p className="mt-2 text-2xl font-bold text-white">{summary.uniqueCount}</p>
              </div>
              <div className="rounded-2xl border border-slate-700 bg-slate-950 p-3">
                <p className="text-[10px] uppercase tracking-[0.2em] text-slate-400">Merged</p>
                <p className="mt-2 text-2xl font-bold text-white">{summary.mergedCount}</p>
              </div>
              <div className="rounded-2xl border border-slate-700 bg-slate-950 p-3">
                <p className="text-[10px] uppercase tracking-[0.2em] text-slate-400">Rejected</p>
                <p className="mt-2 text-2xl font-bold text-white">{summary.rejected.length}</p>
              </div>
            </div>

            <div className="mt-5 rounded-2xl border border-slate-700 bg-slate-950 p-4">
              <p className="text-sm font-medium text-slate-200">Cleaned entries</p>
              <ul className="mt-3 space-y-2 text-sm text-slate-300">
                {summary.cleanedEntries.length ? (
                  summary.cleanedEntries.map((entry) => (
                    <li
                      key={entry.normalized}
                      className="flex items-center justify-between gap-3 rounded-lg border border-slate-800 bg-slate-900 px-3 py-2"
                    >
                      <span>{entry.name}</span>
                      <span className="font-semibold text-emerald-300">{formatMoney(entry.amount)}</span>
                    </li>
                  ))
                ) : (
                  <li className="text-slate-400">No valid contributions yet.</li>
                )}
              </ul>
            </div>

            {summary.rejected.length > 0 && (
              <div className="mt-5 rounded-2xl border border-rose-500/30 bg-rose-500/10 p-4">
                <p className="text-sm font-medium text-rose-100">Rejected rows</p>
                <ul className="mt-3 space-y-2 text-sm text-rose-200">
                  {summary.rejected.map((item, index) => (
                    <li
                      key={`${item.row}-${index}`}
                      className="rounded-lg border border-rose-400/30 bg-slate-950/60 px-3 py-2"
                    >
                      “{item.row}” — {item.reason}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          <div className="rounded-3xl border border-slate-700 bg-slate-900/80 p-4 shadow-lg shadow-slate-950/30 sm:p-5">
            <h2 className="mb-4 text-xl font-semibold text-white">Balances & settlements</h2>

            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm text-slate-200">
                <thead>
                  <tr className="border-b border-slate-700 text-slate-400">
                    <th className="pb-3 pr-4 font-medium">Person</th>
                    <th className="pb-3 pr-4 font-medium">Paid</th>
                    <th className="pb-3 pr-4 font-medium">Share</th>
                    <th className="pb-3 pr-4 font-medium">Balance</th>
                  </tr>
                </thead>
                <tbody>
                  {balances.map((person) => (
                    <tr key={person.id} className="border-b border-slate-800">
                      <td className="py-3 pr-4 font-medium text-white">{person.name || 'Unnamed'}</td>
                      <td className="py-3 pr-4">{formatMoney(person.paid)}</td>
                      <td className="py-3 pr-4">{formatMoney(person.share)}</td>
                      <td
                        className={`py-3 pr-4 font-semibold ${
                          person.balance > 0
                            ? 'text-emerald-300'
                            : person.balance < 0
                              ? 'text-rose-300'
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

            <div className="mt-6 rounded-2xl border border-slate-700 bg-slate-950 p-4">
              <p className="text-sm font-medium text-slate-200">Final settlement list</p>
              {settlements.length ? (
                <ul className="mt-3 space-y-2 text-sm text-slate-300">
                  {settlements.map((transfer, index) => (
                    <li
                      key={`${transfer.from}-${transfer.to}-${index}`}
                      className="rounded-lg border border-slate-800 bg-slate-900 px-3 py-2"
                    >
                      {transfer.from} pays {transfer.to} {formatMoney(transfer.amount)}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-3 text-sm text-emerald-300">Everyone is settled. No transfers are needed.</p>
              )}
            </div>
          </div>
        </section>
      </div>
    </main>
  )
}

export default App

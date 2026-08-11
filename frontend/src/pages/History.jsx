import { useState, useEffect, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { Search, Clock, ArrowRight, CheckCircle, XCircle, Loader } from 'lucide-react'

const STATUS_STYLES = {
    completed: { color: '#15803D', bg: '#DCFCE7', label: 'Completed' },
    error:     { color: '#B91C1C', bg: '#FEE2E2', label: 'Error' },
    in_progress: { color: '#92400E', bg: '#FEF3C7', label: 'Running' },
}

function StatusBadge({ status }) {
    const s = STATUS_STYLES[status] || { color: '#6B7280', bg: '#F3F4F6', label: status }
    return (
        <span style={{
            fontSize: '11px', fontWeight: 600, padding: '2px 8px', borderRadius: '5px',
            color: s.color, background: s.bg, whiteSpace: 'nowrap',
        }}>
            {s.label}
        </span>
    )
}

function formatDate(iso) {
    if (!iso) return ''
    const d = new Date(iso)
    return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) +
        ' ' + d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
}

export default function History() {
    const [sessions, setSessions] = useState([])
    const [loading, setLoading] = useState(true)
    const [query, setQuery] = useState('')

    useEffect(() => {
        setLoading(true)
        fetch('/api/chamber/sessions')
            .then(r => r.json())
            .then(data => { setSessions(data); setLoading(false) })
            .catch(() => setLoading(false))
    }, [])

    const filtered = useMemo(() => {
        const q = query.trim().toLowerCase()
        if (!q) return sessions
        return sessions.filter(s =>
            s.statement.toLowerCase().includes(q) ||
            (s.council_name || '').toLowerCase().includes(q)
        )
    }, [sessions, query])

    return (
        <div className="animate-fade-in-up" style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
                <div>
                    <h1 style={{ fontSize: '24px', fontWeight: 700, marginBottom: '4px', color: '#111827' }}>
                        Deliberation History
                    </h1>
                    <p style={{ fontSize: '14px', color: '#6B7280' }}>
                        {loading ? 'Loading…' : `${sessions.length} deliberation${sessions.length !== 1 ? 's' : ''} total`}
                    </p>
                </div>
                <Link to="/chamber" className="btn-primary" style={{ textDecoration: 'none' }}>
                    New deliberation
                </Link>
            </div>

            {/* Search */}
            <div style={{ position: 'relative' }}>
                <Search
                    size={16}
                    style={{
                        position: 'absolute', left: '14px', top: '50%',
                        transform: 'translateY(-50%)', color: '#9CA3AF', pointerEvents: 'none',
                    }}
                />
                <input
                    type="text"
                    placeholder="Search by statement or council…"
                    value={query}
                    onChange={e => setQuery(e.target.value)}
                    autoFocus
                    style={{
                        width: '100%', boxSizing: 'border-box',
                        padding: '10px 14px 10px 40px',
                        border: '1px solid var(--color-border)',
                        borderRadius: '10px', fontSize: '14px',
                        background: '#fff', outline: 'none',
                        transition: 'border-color 0.15s',
                    }}
                    onFocus={e => e.target.style.borderColor = 'var(--color-primary)'}
                    onBlur={e => e.target.style.borderColor = 'var(--color-border)'}
                />
            </div>

            {/* Results */}
            {loading ? (
                <div style={{ textAlign: 'center', padding: '60px 0', color: '#9CA3AF' }}>
                    <Loader size={24} style={{ animation: 'spin 1s linear infinite', marginBottom: '8px' }} />
                    <p style={{ fontSize: '14px' }}>Loading history…</p>
                </div>
            ) : filtered.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '60px 0', color: '#9CA3AF' }}>
                    <Clock size={32} style={{ marginBottom: '12px', opacity: 0.4 }} />
                    <p style={{ fontSize: '15px', fontWeight: 500, marginBottom: '4px', color: '#6B7280' }}>
                        {query ? 'No matches found' : 'No deliberations yet'}
                    </p>
                    <p style={{ fontSize: '13px' }}>
                        {query ? 'Try a different search term.' : 'Run your first deliberation in the Chamber.'}
                    </p>
                </div>
            ) : (
                <div className="card" style={{ overflow: 'hidden' }}>
                    {filtered.map((s, i) => (
                        <Link
                            key={s.id}
                            to={`/chamber/${s.id}`}
                            style={{
                                display: 'flex', alignItems: 'center', gap: '16px',
                                padding: '14px 20px', textDecoration: 'none',
                                borderBottom: i < filtered.length - 1 ? '1px solid var(--color-border-light)' : 'none',
                                transition: 'background 0.15s',
                            }}
                            onMouseEnter={e => e.currentTarget.style.background = 'var(--color-sidebar-hover)'}
                            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                        >
                            {/* Statement + meta */}
                            <div style={{ flex: 1, minWidth: 0 }}>
                                <p style={{
                                    fontSize: '14px', fontWeight: 500, color: '#111827',
                                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                    marginBottom: '3px',
                                }}>
                                    {s.statement}
                                </p>
                                <p style={{ fontSize: '12px', color: '#9CA3AF' }}>
                                    {s.council_name} · {formatDate(s.created_at)}
                                </p>
                            </div>

                            {/* Cost */}
                            <span style={{
                                fontSize: '12px', fontFamily: 'monospace', padding: '3px 8px',
                                borderRadius: '6px', color: 'var(--color-cost)', background: '#F3F4F6',
                                whiteSpace: 'nowrap', flexShrink: 0,
                            }}>
                                ${(s.total_cost_usd || 0).toFixed(4)}
                            </span>

                            {/* Status */}
                            <StatusBadge status={s.status} />

                            <ArrowRight size={14} style={{ color: '#D1D5DB', flexShrink: 0 }} />
                        </Link>
                    ))}
                </div>
            )}

            {/* Count hint when filtered */}
            {!loading && query && filtered.length > 0 && filtered.length < sessions.length && (
                <p style={{ fontSize: '13px', color: '#9CA3AF', textAlign: 'center' }}>
                    Showing {filtered.length} of {sessions.length} deliberations
                </p>
            )}
        </div>
    )
}

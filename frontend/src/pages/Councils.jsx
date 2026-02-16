import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Plus, Copy, Power, Users, Lightbulb, Heart, Activity, Pencil } from 'lucide-react'

const ICON_MAP = {
    users: Users,
    lightbulb: Lightbulb,
    heart: Heart,
    activity: Activity,
}

const COUNCIL_COLORS = [
    { color: '#4F7DF2', bg: 'rgba(79,125,242,0.08)' },
    { color: '#7C5CFC', bg: 'rgba(124,92,252,0.08)' },
    { color: '#E5484D', bg: 'rgba(229,72,77,0.08)' },
    { color: '#F5A623', bg: 'rgba(245,166,35,0.08)' },
    { color: '#34B87A', bg: 'rgba(52,184,122,0.08)' },
]

export default function Councils() {
    const [councils, setCouncils] = useState([])
    const [loading, setLoading] = useState(true)
    const navigate = useNavigate()

    const loadCouncils = () => {
        fetch('/api/councils')
            .then(r => r.json())
            .then(data => { setCouncils(data); setLoading(false) })
            .catch(() => setLoading(false))
    }

    useEffect(loadCouncils, [])

    const duplicate = async (e, id) => {
        e.preventDefault()
        e.stopPropagation()
        try {
            const res = await fetch(`/api/councils/${id}/duplicate`, { method: 'POST' })
            if (res.ok) {
                const newCouncil = await res.json()
                loadCouncils()
                navigate(`/councils/${newCouncil.id}/edit`)
            }
        } catch (err) {
            console.error('Duplicate failed:', err)
        }
    }

    const toggle = async (e, id) => {
        e.preventDefault()
        e.stopPropagation()
        try {
            await fetch(`/api/councils/${id}/toggle`, { method: 'PATCH' })
            loadCouncils()
        } catch (err) {
            console.error('Toggle failed:', err)
        }
    }

    if (loading) {
        return (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '80px 0', color: 'var(--color-text-muted)', fontSize: '14px' }}>
                Loading councils...
            </div>
        )
    }

    return (
        <div className="animate-fade-in-up">
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
                <div>
                    <h1 style={{ fontSize: '24px', fontWeight: 700 }}>Your Councils</h1>
                    <p style={{ fontSize: '14px', color: 'var(--color-text-secondary)', marginTop: '4px' }}>
                        Manage your advisory panels. Duplicate any council to customise it.
                    </p>
                </div>
                <Link to="/councils/new" className="btn-primary">
                    <Plus size={16} /> Create New Council
                </Link>
            </div>

            {/* Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '20px' }}>
                {councils.map((c, i) => {
                    const IconComp = ICON_MAP[c.icon] || Users
                    const palette = COUNCIL_COLORS[i % COUNCIL_COLORS.length]
                    return (
                        <div
                            key={c.id}
                            className={`card card-hover animate-fade-in-up stagger-${Math.min(i + 1, 5)}`}
                            style={{
                                padding: '24px',
                                opacity: c.is_active ? 1 : 0.55,
                                transition: 'all 0.2s ease',
                            }}
                        >
                            {/* Top row */}
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '14px' }}>
                                <div style={{
                                    width: '44px', height: '44px', borderRadius: '10px',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    background: palette.bg, color: palette.color,
                                }}>
                                    <IconComp size={22} strokeWidth={1.75} />
                                </div>
                                {c.is_default ? (
                                    <span style={{
                                        fontSize: '11px', fontWeight: 500, padding: '3px 10px',
                                        borderRadius: '20px', background: '#F3F4F6', color: 'var(--color-text-secondary)',
                                    }}>Default</span>
                                ) : (
                                    <span style={{
                                        fontSize: '11px', fontWeight: 500, padding: '3px 10px',
                                        borderRadius: '20px', background: 'rgba(79,125,242,0.08)', color: 'var(--color-primary)',
                                    }}>Custom</span>
                                )}
                            </div>

                            {/* Content */}
                            <h3 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '6px' }}>{c.name}</h3>
                            <p style={{
                                fontSize: '13px', color: 'var(--color-text-secondary)', lineHeight: 1.5,
                                marginBottom: '12px', display: '-webkit-box', WebkitLineClamp: 2,
                                WebkitBoxOrient: 'vertical', overflow: 'hidden',
                            }}>{c.description}</p>

                            <p style={{ fontSize: '13px', color: 'var(--color-text-muted)', marginBottom: '16px' }}>
                                {c.councillor_count} councillor{c.councillor_count !== 1 ? 's' : ''}
                                {c.model_info && <span> · {c.model_info}</span>}
                            </p>

                            {/* Actions */}
                            <div style={{
                                display: 'flex', alignItems: 'center', gap: '8px',
                                paddingTop: '14px', borderTop: '1px solid var(--color-border-light)',
                            }}>
                                <button
                                    onClick={(e) => toggle(e, c.id)}
                                    className="btn-secondary"
                                    style={{
                                        color: c.is_active ? 'var(--color-success)' : 'var(--color-text-muted)',
                                        borderColor: c.is_active ? 'rgba(52,184,122,0.3)' : undefined,
                                    }}
                                >
                                    <Power size={14} />
                                    {c.is_active ? 'Active' : 'Inactive'}
                                </button>

                                <button
                                    onClick={(e) => duplicate(e, c.id)}
                                    className="btn-secondary"
                                >
                                    <Copy size={14} />
                                    Duplicate
                                </button>

                                <Link
                                    to={`/councils/${c.id}/edit`}
                                    className="btn-secondary"
                                    style={{ color: 'var(--color-primary)' }}
                                >
                                    <Pencil size={14} />
                                    Edit
                                </Link>
                            </div>
                        </div>
                    )
                })}
            </div>
        </div>
    )
}

import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { MessageCircle, Users, Plus, DollarSign, ArrowRight, AlertCircle, CheckCircle } from 'lucide-react'

export default function Dashboard() {
    const [settings, setSettings] = useState(null)
    const [sessions, setSessions] = useState([])
    const [usage, setUsage] = useState(null)

    useEffect(() => {
        fetch('/api/settings').then(r => r.json()).then(setSettings).catch(() => { })
        fetch('/api/chamber/sessions').then(r => r.json()).then(data => setSessions(data.slice(0, 5))).catch(() => { })
        fetch('/api/settings/usage').then(r => r.json()).then(setUsage).catch(() => { })
    }, [])

    const needsKey = settings && !settings.openrouter_key_set

    return (
        <div className="animate-fade-in-up" style={{ display: 'flex', flexDirection: 'column', gap: '28px' }}>
            {/* Welcome Banner */}
            <div
                style={{
                    borderRadius: '16px',
                    padding: '36px 40px',
                    background: 'linear-gradient(135deg, #EEF2FF 0%, #F0EBFF 50%, #FFF7ED 100%)',
                    border: '1px solid rgba(79, 125, 242, 0.12)',
                }}
            >
                <h1 style={{ fontSize: '28px', fontWeight: 700, marginBottom: '6px', color: 'var(--color-text-primary)' }}>
                    Welcome to Agora
                </h1>
                <p style={{ fontSize: '15px', color: 'var(--color-text-secondary)', lineHeight: 1.6, maxWidth: '560px' }}>
                    Many voices. Better decisions. Create panels of AI advisors and get multi-perspective analysis.
                </p>
            </div>

            {/* Setup prompt */}
            {needsKey && (
                <div
                    className="animate-fade-in"
                    style={{
                        borderRadius: '12px',
                        padding: '20px 24px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '16px',
                        background: '#FFFBEB',
                        border: '1px solid rgba(245, 166, 35, 0.25)',
                    }}
                >
                    <AlertCircle size={22} style={{ color: 'var(--color-warning)', flexShrink: 0 }} />
                    <div style={{ flex: 1 }}>
                        <h3 style={{ fontSize: '15px', fontWeight: 600, marginBottom: '2px' }}>Before you begin</h3>
                        <p style={{ fontSize: '13px', color: 'var(--color-text-secondary)' }}>
                            Add your OpenRouter API key in Settings. It takes 30 seconds and gives you access to hundreds of AI models.
                        </p>
                    </div>
                    <Link to="/settings" className="btn-primary" style={{ flexShrink: 0 }}>
                        Go to Settings
                    </Link>
                </div>
            )}

            {!needsKey && settings && (
                <div
                    className="animate-fade-in"
                    style={{
                        borderRadius: '12px',
                        padding: '20px 24px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '16px',
                        background: '#ECFDF5',
                        border: '1px solid rgba(52, 184, 122, 0.2)',
                    }}
                >
                    <div style={{
                        width: '32px', height: '32px', borderRadius: '50%',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        background: 'var(--color-success)', color: '#fff', flexShrink: 0,
                    }}>
                        <CheckCircle size={18} />
                    </div>
                    <div>
                        <h3 style={{ fontSize: '15px', fontWeight: 600, marginBottom: '2px' }}>You're all set!</h3>
                        <p style={{ fontSize: '13px', color: 'var(--color-text-secondary)' }}>
                            Your API key is configured. Head to the Chamber to run your first deliberation.
                        </p>
                    </div>
                </div>
            )}

            {/* Quick Actions */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '20px' }}>
                {[
                    { to: '/chamber', icon: MessageCircle, title: 'Run a Statement', desc: 'Submit a question or idea to your council', color: '#4F7DF2', bg: 'rgba(79,125,242,0.07)' },
                    { to: '/councils', icon: Users, title: 'Browse Councils', desc: 'View and manage your advisory panels', color: '#7C5CFC', bg: 'rgba(124,92,252,0.07)' },
                    { to: '/councils/new', icon: Plus, title: 'Create a Council', desc: 'Build a custom panel with your own councillors', color: '#34B87A', bg: 'rgba(52,184,122,0.07)' },
                ].map(({ to, icon: Icon, title, desc, color, bg }, i) => (
                    <Link
                        key={to}
                        to={to}
                        className={`card card-hover animate-fade-in-up stagger-${i + 1}`}
                        style={{ padding: '24px', textDecoration: 'none' }}
                    >
                        <div style={{
                            width: '44px', height: '44px', borderRadius: '10px',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            background: bg, color: color, marginBottom: '16px',
                        }}>
                            <Icon size={22} strokeWidth={1.75} />
                        </div>
                        <h3 style={{ fontSize: '15px', fontWeight: 600, marginBottom: '4px', color: 'var(--color-text-primary)' }}>{title}</h3>
                        <p style={{ fontSize: '13px', color: 'var(--color-text-secondary)', lineHeight: 1.5 }}>{desc}</p>
                        <ArrowRight size={16} style={{ marginTop: '14px', color: 'var(--color-text-muted)' }} />
                    </Link>
                ))}
            </div>

            {/* Recent Activity */}
            {sessions.length > 0 && (
                <div className="animate-fade-in-up" style={{ animationDelay: '0.2s' }}>
                    <h2 style={{ fontSize: '18px', fontWeight: 600, marginBottom: '14px' }}>Recent Activity</h2>
                    <div className="card" style={{ overflow: 'hidden' }}>
                        {sessions.map((s, i) => (
                            <Link
                                key={s.id}
                                to={`/chamber/${s.id}`}
                                style={{
                                    display: 'flex', alignItems: 'center', gap: '16px',
                                    padding: '16px 20px', textDecoration: 'none',
                                    borderBottom: i < sessions.length - 1 ? '1px solid var(--color-border-light)' : 'none',
                                    transition: 'background 0.15s',
                                }}
                                onMouseEnter={e => e.currentTarget.style.background = 'var(--color-sidebar-hover)'}
                                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                            >
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <p style={{ fontSize: '14px', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                        {s.statement}
                                    </p>
                                    <p style={{ fontSize: '12px', marginTop: '2px', color: 'var(--color-text-muted)' }}>
                                        {s.council_name} · {new Date(s.created_at).toLocaleDateString()}
                                    </p>
                                </div>
                                <span style={{
                                    fontSize: '12px', fontFamily: 'monospace',
                                    padding: '4px 10px', borderRadius: '6px',
                                    color: 'var(--color-cost)', background: '#F3F4F6',
                                }}>
                                    ${(s.total_cost_usd || 0).toFixed(4)}
                                </span>
                            </Link>
                        ))}
                    </div>
                </div>
            )}

            {/* Spend Summary */}
            {usage && usage.total_deliberations > 0 && (
                <div className="animate-fade-in-up" style={{ animationDelay: '0.3s' }}>
                    <Link
                        to="/settings"
                        className="card card-hover"
                        style={{
                            display: 'inline-flex', alignItems: 'center', gap: '14px',
                            padding: '16px 24px', textDecoration: 'none',
                        }}
                    >
                        <DollarSign size={18} style={{ color: 'var(--color-cost)' }} />
                        <span style={{ fontSize: '14px', color: 'var(--color-text-secondary)' }}>
                            You've spent <strong style={{ color: 'var(--color-text-primary)' }}>${usage.total_spend.toFixed(4)}</strong> across{' '}
                            <strong style={{ color: 'var(--color-text-primary)' }}>{usage.total_deliberations}</strong> deliberation{usage.total_deliberations !== 1 ? 's' : ''}
                        </span>
                        <ArrowRight size={14} style={{ color: 'var(--color-text-muted)' }} />
                    </Link>
                </div>
            )}
        </div>
    )
}

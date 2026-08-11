import { NavLink } from 'react-router-dom'
import { LayoutDashboard, Users, MessageCircle, Settings, History } from 'lucide-react'

const navItems = [
    { to: '/', icon: LayoutDashboard, label: 'Dashboard' },
    { to: '/councils', icon: Users, label: 'Councils' },
    { to: '/chamber', icon: MessageCircle, label: 'Chamber' },
    { to: '/history', icon: History, label: 'History' },
    { to: '/settings', icon: Settings, label: 'Settings' },
]

export default function Sidebar() {
    return (
        <aside
            style={{
                position: 'fixed',
                top: 0,
                left: 0,
                bottom: 0,
                width: '260px',
                display: 'flex',
                flexDirection: 'column',
                background: '#FFFFFF',
                borderRight: '1px solid var(--color-border)',
                zIndex: 50,
            }}
        >
            {/* Logo */}
            <div style={{ padding: '28px 24px 20px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div
                        style={{
                            width: '40px',
                            height: '40px',
                            borderRadius: '10px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            background: 'linear-gradient(135deg, #4F7DF2, #7C5CFC)',
                            fontSize: '18px',
                        }}
                    >
                        🏛️
                    </div>
                    <div>
                        <h1 style={{
                            fontSize: '20px',
                            fontWeight: 700,
                            color: 'var(--color-text-primary)',
                            lineHeight: 1.2,
                            letterSpacing: '-0.02em',
                        }}>
                            Agora
                        </h1>
                        <p style={{
                            fontSize: '11px',
                            color: 'var(--color-text-muted)',
                            marginTop: '1px',
                        }}>
                            Many voices. Better decisions.
                        </p>
                    </div>
                </div>
            </div>

            {/* Navigation */}
            <nav style={{ flex: 1, padding: '0 12px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    {navItems.map(({ to, icon: Icon, label }) => (
                        <NavLink
                            key={to}
                            to={to}
                            end={to === '/'}
                            style={({ isActive }) => ({
                                display: 'flex',
                                alignItems: 'center',
                                gap: '12px',
                                padding: '11px 16px',
                                borderRadius: '10px',
                                fontSize: '14px',
                                fontWeight: isActive ? 600 : 500,
                                color: isActive ? 'var(--color-primary)' : 'var(--color-text-secondary)',
                                background: isActive ? 'var(--color-sidebar-active)' : 'transparent',
                                transition: 'all 0.15s ease',
                                textDecoration: 'none',
                            })}
                            onMouseEnter={e => {
                                if (!e.currentTarget.classList.contains('active')) {
                                    e.currentTarget.style.background = 'var(--color-sidebar-hover)'
                                    e.currentTarget.style.color = 'var(--color-text-primary)'
                                }
                            }}
                            onMouseLeave={e => {
                                const isActive = e.currentTarget.getAttribute('aria-current') === 'page'
                                if (!isActive) {
                                    e.currentTarget.style.background = 'transparent'
                                    e.currentTarget.style.color = 'var(--color-text-secondary)'
                                }
                            }}
                        >
                            <Icon size={20} strokeWidth={1.75} />
                            {label}
                        </NavLink>
                    ))}
                </div>
            </nav>

            {/* Footer */}
            <div style={{
                padding: '16px 24px',
                borderTop: '1px solid var(--color-border-light)',
            }}>
                <p style={{
                    fontSize: '11px',
                    color: 'var(--color-text-muted)',
                }}>
                    Powered by{' '}
                    <span style={{ color: 'var(--color-primary)', fontWeight: 600 }}>
                        Agora Engine
                    </span>
                </p>
            </div>
        </aside>
    )
}

import { useState, useRef, useEffect } from 'react'
import { Search, X, ChevronDown } from 'lucide-react'

/**
 * Searchable model picker dropdown.
 * Props:
 *   models    — array of { id, name, prompt_price_per_million, completion_price_per_million, is_free }
 *   value     — currently selected model id (or null for default)
 *   onChange  — callback(modelId | null)
 */

// Cost tier based on prompt price per 1M tokens
function getCostTier(model) {
    if (!model) return null
    if (model.is_free || (model.prompt_price_per_million === 0 && model.completion_price_per_million === 0)) {
        return { label: 'FREE', color: '#059669', bg: '#ECFDF5', border: 'rgba(5,150,105,0.2)', title: 'Free to use' }
    }
    const p = model.prompt_price_per_million || 0
    if (p < 1) return { label: '$', color: '#059669', bg: '#ECFDF5', border: 'rgba(5,150,105,0.2)', title: `~$${p.toFixed(2)}/M tokens` }
    if (p < 5) return { label: '$$', color: '#D97706', bg: '#FFFBEB', border: 'rgba(217,119,6,0.2)', title: `~$${p.toFixed(2)}/M tokens` }
    if (p < 15) return { label: '$$$', color: '#DC2626', bg: '#FEF2F2', border: 'rgba(220,38,38,0.2)', title: `~$${p.toFixed(2)}/M tokens` }
    return { label: '$$$$', color: '#7C3AED', bg: '#F5F3FF', border: 'rgba(124,58,237,0.2)', title: `~$${p.toFixed(2)}/M tokens (expensive)` }
}

function CostBadge({ tier, small = false }) {
    if (!tier) return null
    return (
        <span
            title={tier.title}
            style={{
                fontSize: small ? '10px' : '11px',
                fontWeight: 700,
                fontFamily: 'monospace',
                padding: small ? '1px 5px' : '2px 6px',
                borderRadius: '4px',
                flexShrink: 0,
                letterSpacing: '0.02em',
                background: tier.bg,
                color: tier.color,
                border: `1px solid ${tier.border}`,
                lineHeight: 1.4,
            }}
        >
            {tier.label}
        </span>
    )
}

export default function ModelPicker({ models, value, onChange }) {
    const [open, setOpen] = useState(false)
    const [query, setQuery] = useState('')
    const containerRef = useRef(null)
    const inputRef = useRef(null)

    // Close on outside click
    useEffect(() => {
        const handler = (e) => {
            if (containerRef.current && !containerRef.current.contains(e.target)) {
                setOpen(false)
                setQuery('')
            }
        }
        document.addEventListener('mousedown', handler)
        return () => document.removeEventListener('mousedown', handler)
    }, [])

    // Focus search input when opened
    useEffect(() => {
        if (open && inputRef.current) {
            inputRef.current.focus()
        }
    }, [open])

    const filtered = models.filter(m => {
        const label = (m.name || m.id).toLowerCase()
        return label.includes(query.toLowerCase())
    })

    const selectedModel = value ? models.find(m => m.id === value) : null
    const selectedLabel = selectedModel
        ? (selectedModel.name || value.split('/').pop())
        : 'Use default model'
    const selectedTier = selectedModel ? getCostTier(selectedModel) : null

    return (
        <div ref={containerRef} style={{ position: 'relative' }}>
            {/* Trigger button */}
            <button
                type="button"
                onClick={() => { setOpen(!open); setQuery('') }}
                className="input"
                style={{
                    width: '100%',
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    cursor: 'pointer', textAlign: 'left',
                    gap: '8px', minHeight: '38px',
                    background: 'var(--color-bg-base)',
                    color: value ? 'var(--color-text-primary)' : 'var(--color-text-muted)',
                }}
            >
                <span style={{
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1,
                    fontSize: '13px',
                }}>
                    {selectedLabel}
                </span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '5px', flexShrink: 0 }}>
                    {selectedTier && <CostBadge tier={selectedTier} small />}
                    {value && (
                        <span
                            onClick={(e) => { e.stopPropagation(); onChange(null); setOpen(false) }}
                            style={{
                                display: 'flex', alignItems: 'center', padding: '2px',
                                borderRadius: '4px', cursor: 'pointer',
                                color: 'var(--color-text-muted)',
                            }}
                            title="Clear selection"
                        >
                            <X size={12} />
                        </span>
                    )}
                    <ChevronDown size={14} style={{
                        color: 'var(--color-text-muted)',
                        transform: open ? 'rotate(180deg)' : 'none',
                        transition: 'transform 0.15s',
                    }} />
                </div>
            </button>

            {/* Dropdown */}
            {open && (
                <div style={{
                    position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0,
                    background: '#fff', borderRadius: '10px',
                    border: '1px solid var(--color-border)',
                    boxShadow: '0 8px 24px rgba(0,0,0,0.12), 0 2px 8px rgba(0,0,0,0.08)',
                    zIndex: 50,
                    animation: 'fadeIn 0.12s ease-out',
                    maxHeight: '300px',
                    display: 'flex', flexDirection: 'column',
                }}>
                    {/* Search input */}
                    <div style={{
                        display: 'flex', alignItems: 'center', gap: '8px',
                        padding: '10px 12px',
                        borderBottom: '1px solid var(--color-border-light)',
                    }}>
                        <Search size={14} style={{ color: 'var(--color-text-muted)', flexShrink: 0 }} />
                        <input
                            ref={inputRef}
                            type="text"
                            value={query}
                            onChange={e => setQuery(e.target.value)}
                            placeholder="Search models..."
                            style={{
                                border: 'none', outline: 'none', flex: 1,
                                fontSize: '13px', background: 'transparent',
                                color: 'var(--color-text-primary)',
                            }}
                        />
                        {query && (
                            <span
                                onClick={() => setQuery('')}
                                style={{ cursor: 'pointer', color: 'var(--color-text-muted)', display: 'flex' }}
                            >
                                <X size={12} />
                            </span>
                        )}
                    </div>

                    {/* Cost legend */}
                    <div style={{
                        display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap',
                        padding: '6px 12px',
                        borderBottom: '1px solid var(--color-border-light)',
                        background: 'var(--color-bg-base)',
                    }}>
                        <span style={{ fontSize: '10px', color: 'var(--color-text-muted)', marginRight: '2px' }}>Cost/1M tokens:</span>
                        {[
                            { label: 'FREE', color: '#059669', bg: '#ECFDF5', border: 'rgba(5,150,105,0.2)', title: 'Free' },
                            { label: '$', color: '#059669', bg: '#ECFDF5', border: 'rgba(5,150,105,0.2)', title: '< $1' },
                            { label: '$$', color: '#D97706', bg: '#FFFBEB', border: 'rgba(217,119,6,0.2)', title: '$1–5' },
                            { label: '$$$', color: '#DC2626', bg: '#FEF2F2', border: 'rgba(220,38,38,0.2)', title: '$5–15' },
                            { label: '$$$$', color: '#7C3AED', bg: '#F5F3FF', border: 'rgba(124,58,237,0.2)', title: '> $15' },
                        ].map(t => (
                            <span key={t.label} title={t.title} style={{
                                fontSize: '10px', fontWeight: 700, fontFamily: 'monospace',
                                padding: '1px 5px', borderRadius: '4px',
                                background: t.bg, color: t.color, border: `1px solid ${t.border}`,
                            }}>{t.label}</span>
                        ))}
                    </div>

                    {/* Options */}
                    <div style={{
                        overflowY: 'auto', flex: 1,
                        padding: '4px',
                    }}>
                        {/* Default option */}
                        {(!query || 'use default model'.includes(query.toLowerCase())) && (
                            <button
                                type="button"
                                onClick={() => { onChange(null); setOpen(false); setQuery('') }}
                                style={{
                                    width: '100%', textAlign: 'left',
                                    padding: '8px 10px', borderRadius: '6px',
                                    fontSize: '13px', fontWeight: 500,
                                    background: !value ? 'var(--color-sidebar-active)' : 'transparent',
                                    color: !value ? 'var(--color-primary)' : 'var(--color-text-primary)',
                                    border: 'none', cursor: 'pointer',
                                    transition: 'background 0.1s',
                                }}
                                onMouseEnter={e => { if (value) e.currentTarget.style.background = 'var(--color-sidebar-hover)' }}
                                onMouseLeave={e => { if (value) e.currentTarget.style.background = 'transparent' }}
                            >
                                Use default model
                            </button>
                        )}

                        {filtered.length === 0 && query && (
                            <div style={{
                                padding: '16px 10px', textAlign: 'center',
                                fontSize: '13px', color: 'var(--color-text-muted)',
                            }}>
                                No models matching "{query}"
                            </div>
                        )}

                        {filtered.map(m => {
                            const label = m.name || m.id
                            const isSelected = m.id === value
                            const provider = m.id.includes('/') ? m.id.split('/')[0] : null
                            const tier = getCostTier(m)

                            return (
                                <button
                                    type="button"
                                    key={m.id}
                                    onClick={() => { onChange(m.id); setOpen(false); setQuery('') }}
                                    style={{
                                        width: '100%', textAlign: 'left',
                                        padding: '7px 10px', borderRadius: '6px',
                                        display: 'flex', alignItems: 'center', gap: '8px',
                                        background: isSelected ? 'var(--color-sidebar-active)' : 'transparent',
                                        border: 'none', cursor: 'pointer',
                                        transition: 'background 0.1s',
                                    }}
                                    onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = 'var(--color-sidebar-hover)' }}
                                    onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = 'transparent' }}
                                >
                                    <span style={{
                                        flex: 1, fontSize: '13px',
                                        color: isSelected ? 'var(--color-primary)' : 'var(--color-text-primary)',
                                        fontWeight: isSelected ? 500 : 400,
                                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                    }}>
                                        {label}
                                    </span>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
                                        {provider && (
                                            <span style={{
                                                fontSize: '11px', color: 'var(--color-text-muted)',
                                            }}>
                                                {provider}
                                            </span>
                                        )}
                                        <CostBadge tier={tier} />
                                    </div>
                                </button>
                            )
                        })}
                    </div>
                </div>
            )}
        </div>
    )
}

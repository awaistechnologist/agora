import { useState, useRef, useEffect } from 'react'
import { Search, X, ChevronDown } from 'lucide-react'

/**
 * Searchable model picker dropdown.
 * Props:
 *   models    — array of { id, name }
 *   value     — currently selected model id (or null for default)
 *   onChange  — callback(modelId | null)
 */
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

    const selectedLabel = value
        ? (models.find(m => m.id === value)?.name || value.split('/').pop())
        : 'Use default model'

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
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexShrink: 0 }}>
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
                    maxHeight: '280px',
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
                            // Extract provider from id (e.g., "openai/gpt-4o" -> "openai")
                            const provider = m.id.includes('/') ? m.id.split('/')[0] : null

                            return (
                                <button
                                    type="button"
                                    key={m.id}
                                    onClick={() => { onChange(m.id); setOpen(false); setQuery('') }}
                                    style={{
                                        width: '100%', textAlign: 'left',
                                        padding: '8px 10px', borderRadius: '6px',
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
                                    {provider && (
                                        <span style={{
                                            fontSize: '11px', color: 'var(--color-text-muted)',
                                            flexShrink: 0,
                                        }}>
                                            {provider}
                                        </span>
                                    )}
                                </button>
                            )
                        })}
                    </div>
                </div>
            )}
        </div>
    )
}

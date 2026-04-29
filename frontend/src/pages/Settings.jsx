import { useState, useEffect } from 'react'
import { Eye, EyeOff, Check, X, ExternalLink, Copy, Plug, HardDrive, Download } from 'lucide-react'

function getCostTier(m) {
    if (!m) return null
    if (m.is_free || (m.prompt_price_per_million === 0 && m.completion_price_per_million === 0)) return null // FREE badge already shown
    const p = m.prompt_price_per_million || 0
    if (p < 1) return { label: '$', color: '#059669', bg: '#ECFDF5', border: 'rgba(5,150,105,0.2)', title: `~$${p.toFixed(2)}/M prompt tokens` }
    if (p < 5) return { label: '$$', color: '#D97706', bg: '#FFFBEB', border: 'rgba(217,119,6,0.2)', title: `~$${p.toFixed(2)}/M prompt tokens` }
    if (p < 15) return { label: '$$$', color: '#DC2626', bg: '#FEF2F2', border: 'rgba(220,38,38,0.2)', title: `~$${p.toFixed(2)}/M prompt tokens` }
    return { label: '$$$$', color: '#7C3AED', bg: '#F5F3FF', border: 'rgba(124,58,237,0.2)', title: `~$${p.toFixed(2)}/M prompt tokens (expensive)` }
}

function TierBadge({ tier }) {
    if (!tier) return null
    return (
        <span title={tier.title} style={{
            fontSize: '10px', fontWeight: 700, fontFamily: 'monospace',
            padding: '1px 5px', borderRadius: '4px', flexShrink: 0,
            background: tier.bg, color: tier.color, border: `1px solid ${tier.border}`,
        }}>{tier.label}</span>
    )
}

// Three named slots. DB stores 'fast' / 'balanced' / 'powerful' as opaque
// slot ids; the user just sees Default 1 / 2 / 3.
const SLOTS = [
    { key: 'fast', label: '1' },
    { key: 'balanced', label: '2' },
    { key: 'powerful', label: '3' },
]

// Settings sub-screens. Only one tab's content is mounted at a time —
// keeps the page focused and lets each panel scroll independently. The
// active tab is also synced to `location.hash` so it survives reload
// and you can deep-link (e.g. /settings#mcp).
const TABS = [
    { key: 'models',  label: 'Default Models' },
    { key: 'local',   label: 'Local Models' },
    { key: 'mcp',     label: 'MCP' },
    { key: 'usage',   label: 'Usage' },
    { key: 'account', label: 'Account' },
]

function TabBar({ active, onChange }) {
    return (
        <div style={{
            display: 'flex', gap: '2px', flexWrap: 'wrap',
            borderBottom: '1px solid var(--color-border-light)',
            marginBottom: '8px',
        }}>
            {TABS.map(t => {
                const isActive = active === t.key
                return (
                    <button
                        key={t.key}
                        onClick={() => onChange(t.key)}
                        style={{
                            padding: '10px 16px',
                            fontSize: '13px',
                            fontWeight: isActive ? 600 : 500,
                            color: isActive ? 'var(--color-primary)' : 'var(--color-text-secondary)',
                            background: 'none',
                            border: 'none',
                            borderBottom: '2px solid ' + (isActive ? 'var(--color-primary)' : 'transparent'),
                            marginBottom: '-1px',
                            cursor: 'pointer',
                            transition: 'color 0.15s, border-color 0.15s',
                        }}
                    >
                        {t.label}
                    </button>
                )
            })}
        </div>
    )
}

// Colour map for Ollama viability ratings.
const VIABILITY = {
    recommended: { bg: '#ECFDF5', color: '#059669', border: 'rgba(5,150,105,0.25)', label: 'Recommended' },
    workable:    { bg: '#EFF6FF', color: '#2563EB', border: 'rgba(37,99,235,0.25)', label: 'Workable' },
    tight:       { bg: '#FFFBEB', color: '#D97706', border: 'rgba(217,119,6,0.25)', label: 'Tight fit' },
    marginal:    { bg: '#FFF1F2', color: '#E11D48', border: 'rgba(225,29,72,0.25)', label: 'Marginal' },
    wont_fit:    { bg: '#FEE2E2', color: '#B91C1C', border: 'rgba(185,28,28,0.25)', label: "Won't fit" },
    unknown:     { bg: '#F3F4F6', color: '#4B5563', border: 'rgba(75,85,99,0.25)', label: 'Unknown' },
}

function ViabilityBadge({ rating }) {
    const v = VIABILITY[rating] || VIABILITY.unknown
    return (
        <span style={{
            fontSize: '10px', fontWeight: 700,
            padding: '1px 6px', borderRadius: '4px', flexShrink: 0,
            background: v.bg, color: v.color, border: `1px solid ${v.border}`,
            textTransform: 'uppercase', letterSpacing: '0.03em',
        }}>{v.label}</span>
    )
}

function fmtBytes(b) {
    if (!b) return '—'
    if (b < 1e9) return `${(b / 1e6).toFixed(0)} MB`
    return `${(b / 1e9).toFixed(1)} GB`
}

// Small 1/2/3 pill row used everywhere a model can be assigned to a slot.
function AssignPills({ modelId, settings, onAssign, savingTier }) {
    return (
        <div style={{ display: 'flex', gap: '4px', flexShrink: 0 }} onClick={e => e.stopPropagation()}>
            {SLOTS.map(s => {
                const isAssigned = settings[`default_model_${s.key}`] === modelId
                const isSaving = savingTier === s.key
                return (
                    <button
                        key={s.key}
                        onClick={() => !isAssigned && onAssign(s.key)}
                        disabled={isAssigned || isSaving}
                        title={isAssigned ? `Currently Default ${s.label}` : `Set as Default ${s.label}`}
                        style={{
                            width: '26px', height: '26px', borderRadius: '6px',
                            fontSize: '11px', fontWeight: 700, fontFamily: 'monospace',
                            cursor: isAssigned ? 'default' : 'pointer',
                            background: isAssigned ? 'var(--color-primary)' : 'transparent',
                            color: isAssigned ? '#fff' : 'var(--color-text-muted)',
                            border: '1px solid ' + (isAssigned ? 'var(--color-primary)' : 'var(--color-border)'),
                            transition: 'all 0.15s',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}
                    >
                        {isSaving ? '…' : s.label}
                    </button>
                )
            })}
        </div>
    )
}

export default function Settings() {
    const [settings, setSettings] = useState({
        openrouter_key_set: false, openrouter_key_preview: '',
        default_model_fast: 'openai/gpt-4o',
        default_model_balanced: 'openai/gpt-4o',
        default_model_powerful: 'openai/gpt-4o',
    })
    const [apiKey, setApiKey] = useState('')
    const [showKey, setShowKey] = useState(false)
    const [keyStatus, setKeyStatus] = useState(null) // null, 'testing', 'success', 'error'
    const [keyMessage, setKeyMessage] = useState('')
    const [models, setModels] = useState([])
    const [modelsLoading, setModelsLoading] = useState(true)
    const [modelSearch, setModelSearch] = useState('')
    const [usage, setUsage] = useState(null)
    // Which slot is currently being saved (for spinner state on the pill)
    const [savingTier, setSavingTier] = useState(null)

    // Free model testing states
    const [testingFree, setTestingFree] = useState(false)
    const [testProgress, setTestProgress] = useState(0)
    const [testTotal, setTestTotal] = useState(0)
    const [testedModels, setTestedModels] = useState([])
    const [testError, setTestError] = useState(null)

    // MCP integration state
    const [mcp, setMcp] = useState(null)
    const [mcpBusy, setMcpBusy] = useState(null) // client key currently being mutated
    const [mcpError, setMcpError] = useState(null)
    const [mcpCopied, setMcpCopied] = useState(false)

    // Ollama (local models) state
    const [ollama, setOllama] = useState(null)
    const [ollamaPulling, setOllamaPulling] = useState(null) // model id currently pulling
    const [ollamaError, setOllamaError] = useState(null)

    // Active settings sub-tab. Mirrors location.hash for deep-linking.
    const [activeTab, setActiveTab] = useState(() => {
        const h = (typeof window !== 'undefined' ? window.location.hash : '').replace('#', '')
        return TABS.some(t => t.key === h) ? h : 'models'
    })
    const setTab = (key) => {
        setActiveTab(key)
        if (typeof window !== 'undefined' && window.history?.replaceState) {
            window.history.replaceState(null, '', `#${key}`)
        }
    }

    const refreshMcp = async () => {
        try {
            const res = await fetch('/api/mcp/status')
            const data = await res.json()
            setMcp(data)
            setMcpError(null)
        } catch {
            setMcpError('Could not load MCP status.')
        }
    }

    const toggleMcpClient = async (clientKey, enable) => {
        setMcpBusy(clientKey)
        setMcpError(null)
        try {
            const res = await fetch(enable ? '/api/mcp/install' : '/api/mcp/uninstall', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ client: clientKey }),
            })
            if (!res.ok) {
                const data = await res.json().catch(() => ({}))
                setMcpError(data.detail || 'Failed to update MCP config.')
            } else {
                await refreshMcp()
            }
        } catch {
            setMcpError('Failed to reach the backend.')
        }
        setMcpBusy(null)
    }

    const copyMcpSnippet = async () => {
        if (!mcp) return
        try {
            await navigator.clipboard.writeText(JSON.stringify(mcp.snippet, null, 2))
            setMcpCopied(true)
            setTimeout(() => setMcpCopied(false), 1500)
        } catch {
            setMcpError('Could not copy to clipboard.')
        }
    }

    const refreshOllama = async () => {
        try {
            const res = await fetch('/api/ollama/status')
            const data = await res.json()
            setOllama(data)
        } catch {
            setOllamaError('Could not load Ollama status.')
        }
    }

    const pullOllama = async (id) => {
        setOllamaPulling(id)
        setOllamaError(null)
        try {
            const res = await fetch('/api/ollama/pull', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id }),
            })
            if (!res.ok) {
                const data = await res.json().catch(() => ({}))
                setOllamaError(data.detail || `Pull failed for ${id}.`)
            } else {
                await refreshOllama()
            }
        } catch {
            setOllamaError(`Could not reach the backend while pulling ${id}.`)
        }
        setOllamaPulling(null)
    }

    useEffect(() => {
        fetch('/api/settings').then(r => r.json()).then(data => {
            setSettings(data)
        }).catch(() => { })
        fetch('/api/models').then(r => r.json()).then(data => { setModels(data.models || []); setModelsLoading(false) }).catch(() => setModelsLoading(false))
        fetch('/api/settings/usage').then(r => r.json()).then(setUsage).catch(() => { })
        refreshMcp()
        refreshOllama()
    }, [])

    const saveKey = async () => {
        if (!apiKey) return
        setKeyStatus('testing')
        try {
            const testRes = await fetch('/api/settings/test', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ openrouter_key: apiKey }),
            })
            const testData = await testRes.json()
            if (testData.valid) {
                await fetch('/api/settings', {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ openrouter_key: apiKey }),
                })
                setKeyStatus('success')
                setKeyMessage(testData.message)
                setSettings(prev => ({ ...prev, openrouter_key_set: true }))
                const modelsRes = await fetch('/api/models/refresh')
                const modelsData = await modelsRes.json()
                setModels(modelsData.models || [])
            } else {
                setKeyStatus('error')
                setKeyMessage(testData.message)
            }
        } catch {
            setKeyStatus('error')
            setKeyMessage('Could not reach OpenRouter. Check your internet connection.')
        }
    }

    // Assign a model to one of the three slots. Optimistic update so the
    // pill turns blue immediately; the PUT replaces it on success.
    const assignToSlot = async (tier, modelId) => {
        if (!modelId) return
        setSavingTier(tier)
        setSettings(prev => ({ ...prev, [`default_model_${tier}`]: modelId }))
        try {
            const res = await fetch('/api/settings', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ [`default_model_${tier}`]: modelId }),
            })
            const data = await res.json()
            setSettings(data)
        } catch {
            // best-effort revert if the request fails
            const fresh = await fetch('/api/settings').then(r => r.json()).catch(() => null)
            if (fresh) setSettings(fresh)
        }
        setSavingTier(null)
    }

    const startFreeTest = () => {
        if (!settings.openrouter_key_set) {
            setTestError("Please set and save your API key first.")
            return
        }
        setTestingFree(true)
        setTestError(null)
        setTestProgress(0)
        setTestTotal(0)
        setTestedModels([])
        
        const es = new EventSource('/api/models/test-free')
        
        es.onmessage = (event) => {
            const data = JSON.parse(event.data)
            if (data.error) {
                setTestError(data.error)
                setTestingFree(false)
                es.close()
            } else if (data.status === 'fetching') {
                setTestError("Fetching available free models...")
            } else if (data.status === 'testing') {
                setTestTotal(data.total)
                setTestError(null)
            } else if (data.model) {
                setTestProgress(p => p + 1)
                setTestedModels(prev => [...prev, data])
            } else if (data.status === 'done') {
                setTestingFree(false)
                es.close()
            }
        }
        
        es.onerror = () => {
            setTestError("Lost connection to server.")
            setTestingFree(false)
            es.close()
        }
    }

    const filteredModels = modelSearch.trim()
        ? models.filter(m => {
            const q = modelSearch.toLowerCase()
            return m.name.toLowerCase().includes(q) || m.id.toLowerCase().includes(q) || (m.provider || '').toLowerCase().includes(q)
        })
        : models

    const grouped = filteredModels.reduce((acc, m) => {
        const p = m.provider || 'Other'
        if (!acc[p]) acc[p] = []
        acc[p].push(m)
        return acc
    }, {})


    return (
        <div className="animate-fade-in-up" style={{ maxWidth: '680px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '24px' }}>
            <div>
                <h1 style={{ fontSize: '24px', fontWeight: 700, marginBottom: '4px' }}>Settings</h1>
                <p style={{ fontSize: '14px', color: 'var(--color-text-secondary)' }}>Configure models, integrations, and usage.</p>
            </div>

            <TabBar active={activeTab} onChange={setTab} />

            {/* Account tab: API Key */}
            {activeTab === 'account' && (
            <section className="card" style={{ padding: '28px' }}>
                <h2 style={{ fontSize: '17px', fontWeight: 600, marginBottom: '4px' }}>OpenRouter API Key</h2>
                <p style={{ fontSize: '13px', color: 'var(--color-text-secondary)', marginBottom: '18px' }}>
                    Get your key at{' '}
                    <a href="https://openrouter.ai/keys" target="_blank" rel="noopener" style={{ color: 'var(--color-primary)', textDecoration: 'underline' }}>openrouter.ai/keys</a>{' '}
                    — your key stays on your computer, never sent anywhere except OpenRouter.
                </p>

                <div style={{ display: 'flex', gap: '10px' }}>
                    <div style={{ position: 'relative', flex: 1 }}>
                        <input
                            type={showKey ? 'text' : 'password'}
                            value={apiKey}
                            onChange={e => { setApiKey(e.target.value); setKeyStatus(null) }}
                            placeholder={settings.openrouter_key_set ? `Current key: ${settings.openrouter_key_preview}` : 'sk-or-v1-...'}
                            className="input"
                            style={{ paddingRight: '40px' }}
                        />
                        <button
                            onClick={() => setShowKey(!showKey)}
                            style={{
                                position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)',
                                color: 'var(--color-text-muted)', cursor: 'pointer', background: 'none', border: 'none',
                            }}
                        >
                            {showKey ? <EyeOff size={16} /> : <Eye size={16} />}
                        </button>
                    </div>
                    <button
                        onClick={saveKey}
                        disabled={!apiKey || keyStatus === 'testing'}
                        className="btn-primary"
                    >
                        {keyStatus === 'testing' ? 'Testing...' : 'Save Key'}
                    </button>
                </div>

                {keyStatus === 'success' && (
                    <div style={{ marginTop: '12px', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: 'var(--color-success)' }}>
                        <Check size={16} /> {keyMessage}
                    </div>
                )}
                {keyStatus === 'error' && (
                    <div style={{ marginTop: '12px', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: 'var(--color-error)' }}>
                        <X size={16} /> {keyMessage}
                    </div>
                )}
            </section>
            )}

            {/* Default Models tab */}
            {activeTab === 'models' && (
            <section className="card" style={{ padding: '28px' }}>
                <h2 style={{ fontSize: '17px', fontWeight: 600, marginBottom: '4px' }}>Default Models</h2>
                <p style={{ fontSize: '13px', color: 'var(--color-text-secondary)', marginBottom: '14px' }}>
                    You have three default-model slots. Pick any three models — click <strong>1</strong>, <strong>2</strong>, or <strong>3</strong> next to a model below to assign it to that slot. Councils refer to these slots by number.
                </p>

                {/* Currently assigned summary */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px', marginBottom: '20px' }}>
                    {SLOTS.map(s => {
                        const id = settings[`default_model_${s.key}`]
                        const m = models.find(x => x.id === id)
                        const label = m ? m.name : (id || '—')
                        return (
                            <div
                                key={s.key}
                                style={{
                                    padding: '10px 12px', borderRadius: '10px',
                                    background: 'var(--color-bg-base)',
                                    border: '1px solid var(--color-border-light)',
                                    display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0,
                                }}
                            >
                                <span style={{
                                    width: '26px', height: '26px', borderRadius: '6px',
                                    fontSize: '11px', fontWeight: 700, fontFamily: 'monospace',
                                    background: 'var(--color-primary)', color: '#fff',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                                }}>{s.label}</span>
                                <div style={{ minWidth: 0, flex: 1 }}>
                                    <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Default {s.label}</div>
                                    <div style={{ fontSize: '12px', fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={label}>{label}</div>
                                </div>
                            </div>
                        )
                    })}
                </div>

                {models.length > 0 ? (
                    <>
                        {/* Search */}
                        <div style={{ position: 'relative', marginBottom: '14px' }}>
                            <input
                                type="text"
                                value={modelSearch}
                                onChange={e => setModelSearch(e.target.value)}
                                placeholder="Search models by name or provider..."
                                className="input"
                                style={{ paddingRight: modelSearch ? '36px' : '12px' }}
                            />
                            {modelSearch && (
                                <button
                                    onClick={() => setModelSearch('')}
                                    style={{
                                        position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)',
                                        background: 'none', border: 'none', cursor: 'pointer', padding: '4px',
                                        color: 'var(--color-text-muted)', display: 'flex',
                                    }}
                                >
                                    <X size={14} />
                                </button>
                            )}
                        </div>

                        {filteredModels.length > 0 ? (
                            <div style={{ maxHeight: '360px', overflowY: 'auto', paddingRight: '8px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                                {Object.entries(grouped).sort(([a], [b]) => a.localeCompare(b)).map(([provider, providerModels]) => (
                                    <div key={provider}>
                                        <h3 style={{
                                            fontSize: '11px', fontWeight: 600, textTransform: 'uppercase',
                                            letterSpacing: '0.05em', color: 'var(--color-text-muted)',
                                            marginBottom: '8px', padding: '0 4px',
                                        }}>
                                            {provider}
                                        </h3>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                            {providerModels.map(m => {
                                                const isAssignedAnywhere = SLOTS.some(s => settings[`default_model_${s.key}`] === m.id)
                                                return (
                                                    <div
                                                        key={m.id}
                                                        style={{
                                                            display: 'flex', alignItems: 'center', gap: '12px',
                                                            padding: '10px 12px', borderRadius: '8px',
                                                            transition: 'all 0.15s',
                                                            background: isAssignedAnywhere ? 'var(--color-sidebar-active)' : 'transparent',
                                                            border: isAssignedAnywhere ? '1px solid rgba(79,125,242,0.25)' : '1px solid transparent',
                                                        }}
                                                    >
                                                        <span style={{ flex: 1, fontSize: '13px', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                            {m.is_free && (
                                                                <span style={{
                                                                    display: 'inline-block', padding: '1px 6px', fontSize: '10px',
                                                                    fontWeight: 700, color: '#fff', borderRadius: '4px',
                                                                    background: 'var(--color-free)', marginRight: '8px',
                                                                }}>FREE</span>
                                                            )}
                                                            {m.name}
                                                        </span>
                                                        <TierBadge tier={getCostTier(m)} />
                                                        <span style={{ fontSize: '11px', fontFamily: 'monospace', color: 'var(--color-cost)' }}>
                                                            {m.is_free ? 'Free' : `$${m.prompt_price_per_million.toFixed(2)} / $${m.completion_price_per_million.toFixed(2)}`}
                                                        </span>
                                                        <AssignPills modelId={m.id} settings={settings} onAssign={tier => assignToSlot(tier, m.id)} savingTier={savingTier} />
                                                    </div>
                                                )
                                            })}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <p style={{ fontSize: '13px', color: 'var(--color-text-muted)', fontStyle: 'italic' }}>
                                No models match "{modelSearch}"
                            </p>
                        )}
                    </>
                ) : modelsLoading ? (
                    <p style={{ fontSize: '13px', fontStyle: 'italic', color: 'var(--color-text-muted)' }}>
                        Loading models...
                    </p>
                ) : settings.openrouter_key_set ? (
                    <div style={{ fontSize: '13px', color: 'var(--color-text-muted)' }}>
                        <p style={{ marginBottom: '8px' }}>No models found. OpenRouter may be temporarily unavailable.</p>
                        <button
                            className="btn-secondary"
                            style={{ fontSize: '12px', padding: '6px 14px' }}
                            onClick={() => {
                                setModelsLoading(true)
                                fetch('/api/models/refresh').then(r => r.json()).then(data => { setModels(data.models || []); setModelsLoading(false) }).catch(() => setModelsLoading(false))
                            }}
                        >
                            Retry
                        </button>
                    </div>
                ) : (
                    <p style={{ fontSize: '13px', fontStyle: 'italic', color: 'var(--color-text-muted)' }}>
                        Add your API key above to see available models.
                    </p>
                )}

                {models.length > 0 && (
                    <div style={{ marginTop: '18px', display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap' }}>
                        <button onClick={startFreeTest} disabled={testingFree} className="btn-secondary">
                            {testingFree ? 'Testing...' : 'Find Working Free Models'}
                        </button>
                        <span style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>
                            {models.length} models with tool-calling support
                        </span>
                    </div>
                )}

                {/* Test Results Box */}
                {(testingFree || testedModels.length > 0 || testError) && (
                    <div style={{ marginTop: '20px', padding: '16px', background: 'var(--color-bg-base)', borderRadius: '8px', border: '1px solid var(--color-border-light)' }}>
                        <h3 style={{ fontSize: '14px', fontWeight: 600, marginBottom: '8px' }}>Free Model Diagnostics</h3>
                        
                        {testError && <p style={{ fontSize: '13px', color: 'var(--color-text-muted)', marginBottom: '12px' }}>{testError}</p>}
                        
                        {testingFree && testTotal > 0 && (
                            <div style={{ marginBottom: '16px' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', marginBottom: '4px', color: 'var(--color-text-secondary)' }}>
                                    <span>Testing free models...</span>
                                    <span>{testProgress} / {testTotal}</span>
                                </div>
                                <div style={{ height: '6px', background: 'var(--color-border-light)', borderRadius: '3px', overflow: 'hidden' }}>
                                    <div style={{ height: '100%', background: 'var(--color-primary)', width: `${(testProgress / testTotal) * 100}%`, transition: 'width 0.2s' }}></div>
                                </div>
                            </div>
                        )}
                        
                        {testedModels.length > 0 && (
                            <div style={{ maxHeight: '300px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                {testedModels.map((m, i) => (
                                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '6px 12px', borderRadius: '4px', background: 'var(--color-sidebar-active)', fontSize: '12px', border: '1px solid var(--color-border-light)' }}>
                                        <span style={{ flex: 1, fontFamily: 'monospace', fontWeight: 500, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={m.model}>{m.model}</span>
                                        {m.result === 'success' ? (
                                            <>
                                                <span style={{ color: 'var(--color-success)', fontWeight: 700, padding: '2px 6px', background: '#ECFDF5', borderRadius: '4px', border: '1px solid rgba(5,150,105,0.2)', flexShrink: 0 }}>Working</span>
                                                <AssignPills modelId={m.model} settings={settings} onAssign={tier => assignToSlot(tier, m.model)} savingTier={savingTier} />
                                            </>
                                        ) : (
                                            <span style={{ color: 'var(--color-error)', fontWeight: 700, padding: '2px 6px', background: '#FEF2F2', borderRadius: '4px', border: '1px solid rgba(220,38,38,0.2)', flexShrink: 0 }}>Failed</span>
                                        )}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}
            </section>
            )}

            {/* Local Models (Ollama) tab */}
            {activeTab === 'local' && (
            <section className="card" style={{ padding: '28px' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', marginBottom: '4px' }}>
                    <HardDrive size={18} style={{ marginTop: '3px', color: 'var(--color-text-secondary)' }} />
                    <div style={{ flex: 1 }}>
                        <h2 style={{ fontSize: '17px', fontWeight: 600 }}>Local Models (Ollama)</h2>
                        <p style={{ fontSize: '13px', color: 'var(--color-text-secondary)', marginTop: '4px' }}>
                            Run councils against models on your own machine. Free, private, offline. Local models can be assigned to any of the three slots above — mix them with cloud models per councillor.
                        </p>
                    </div>
                </div>

                {ollamaError && (
                    <div style={{ marginTop: '14px', padding: '10px 14px', borderRadius: '8px', background: 'var(--color-error-light)', border: '1px solid rgba(229,72,77,0.15)', color: 'var(--color-error)', fontSize: '12px' }}>
                        {ollamaError}
                    </div>
                )}

                {!ollama ? (
                    <p style={{ marginTop: '16px', fontSize: '13px', color: 'var(--color-text-muted)', fontStyle: 'italic' }}>Loading Ollama status…</p>
                ) : !ollama.running ? (
                    <div style={{ marginTop: '14px', padding: '14px 16px', borderRadius: '10px', background: '#FFFBEB', border: '1px solid #FCD34D' }}>
                        <p style={{ fontSize: '13px', color: '#92400E', fontWeight: 600, marginBottom: '4px' }}>Ollama is not running.</p>
                        <p style={{ fontSize: '12px', color: '#B45309', lineHeight: 1.5 }}>
                            Install Ollama from{' '}
                            <a href="https://ollama.com/download" target="_blank" rel="noopener" style={{ color: '#92400E', textDecoration: 'underline' }}>ollama.com/download</a>
                            {' '}and start it. Then click below to retry.
                        </p>
                        <button onClick={refreshOllama} className="btn-secondary" style={{ marginTop: '10px', fontSize: '12px', padding: '6px 14px' }}>Retry</button>
                    </div>
                ) : (
                    <>
                        {/* System summary */}
                        <div style={{
                            marginTop: '16px', padding: '12px 14px', borderRadius: '10px',
                            background: 'var(--color-bg-base)', border: '1px solid var(--color-border-light)',
                            fontSize: '12px', color: 'var(--color-text-secondary)', lineHeight: 1.6,
                        }}>
                            <strong style={{ color: 'var(--color-text-primary)' }}>{ollama.system.cpu_brand || 'Unknown CPU'}</strong>
                            {' · '}{ollama.system.cpu_cores} cores
                            {ollama.system.gpu_label && ollama.system.gpu_label !== ollama.system.cpu_brand && (<> · {ollama.system.gpu_label}</>)}
                            {' · '}{fmtBytes(ollama.system.ram_bytes)} RAM
                            {' · '}<span style={{ color: 'var(--color-text-muted)' }}>{fmtBytes(ollama.system.available_for_models_bytes)} available for models</span>
                            {ollama.version && <> · Ollama v{ollama.version}</>}
                        </div>

                        {/* Installed models */}
                        {ollama.installed.length > 0 && (
                            <div style={{ marginTop: '16px' }}>
                                <p style={{ fontSize: '12px', fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: '8px' }}>
                                    Installed ({ollama.installed.length}) — assign to a slot:
                                </p>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                    {ollama.installed.map(m => {
                                        const slotId = `ollama/${m.id}`
                                        const isAssignedAnywhere = SLOTS.some(s => settings[`default_model_${s.key}`] === slotId)
                                        return (
                                            <div
                                                key={m.id}
                                                style={{
                                                    display: 'flex', alignItems: 'center', gap: '12px',
                                                    padding: '10px 12px', borderRadius: '8px',
                                                    background: isAssignedAnywhere ? 'var(--color-sidebar-active)' : 'transparent',
                                                    border: isAssignedAnywhere ? '1px solid rgba(79,125,242,0.25)' : '1px solid var(--color-border-light)',
                                                }}
                                            >
                                                <span style={{ flex: 1, fontSize: '13px', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: 'monospace' }} title={m.id}>{m.id}</span>
                                                {m.param_size && <span style={{ fontSize: '11px', color: 'var(--color-text-muted)', flexShrink: 0 }}>{m.param_size}</span>}
                                                <span style={{ fontSize: '11px', fontFamily: 'monospace', color: 'var(--color-cost)', flexShrink: 0 }}>{fmtBytes(m.size_bytes)}</span>
                                                <ViabilityBadge rating={m.viability.rating} />
                                                <AssignPills modelId={slotId} settings={settings} onAssign={tier => assignToSlot(tier, slotId)} savingTier={savingTier} />
                                            </div>
                                        )
                                    })}
                                </div>
                            </div>
                        )}

                        {/* Catalog — recommended pulls */}
                        <div style={{ marginTop: '20px' }}>
                            <p style={{ fontSize: '12px', fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: '8px' }}>
                                Recommended for your machine:
                            </p>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', maxHeight: '320px', overflowY: 'auto', paddingRight: '4px' }}>
                                {ollama.catalog.map(m => {
                                    const pulling = ollamaPulling === m.id
                                    const cantFit = m.viability.rating === 'wont_fit'
                                    return (
                                        <div
                                            key={m.id}
                                            style={{
                                                display: 'flex', alignItems: 'center', gap: '12px',
                                                padding: '10px 12px', borderRadius: '8px',
                                                background: 'transparent',
                                                border: '1px solid var(--color-border-light)',
                                                opacity: cantFit ? 0.55 : 1,
                                            }}
                                        >
                                            <div style={{ flex: 1, minWidth: 0 }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                    <span style={{ fontSize: '13px', fontWeight: 500 }}>{m.label}</span>
                                                    <span style={{ fontSize: '11px', color: 'var(--color-text-muted)', fontFamily: 'monospace' }}>{m.id}</span>
                                                </div>
                                                <div style={{ fontSize: '11px', color: 'var(--color-text-muted)', marginTop: '2px' }}>{m.summary}</div>
                                            </div>
                                            <span style={{ fontSize: '11px', fontFamily: 'monospace', color: 'var(--color-cost)', flexShrink: 0 }}>~{fmtBytes(m.approx_size_bytes)}</span>
                                            <ViabilityBadge rating={m.viability.rating} />
                                            {m.installed ? (
                                                <span style={{ fontSize: '10px', fontWeight: 700, color: '#fff', background: 'var(--color-success)', padding: '2px 8px', borderRadius: '4px', flexShrink: 0 }}>INSTALLED</span>
                                            ) : (
                                                <button
                                                    onClick={() => pullOllama(m.id)}
                                                    disabled={pulling || cantFit || !!ollamaPulling}
                                                    className="btn-secondary"
                                                    style={{ fontSize: '11px', padding: '5px 10px', flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                                                    title={cantFit ? "This model is larger than your machine's usable memory." : `Pull ${m.id} from Ollama registry`}
                                                >
                                                    <Download size={12} /> {pulling ? 'Pulling…' : 'Pull'}
                                                </button>
                                            )}
                                        </div>
                                    )
                                })}
                            </div>
                            {ollamaPulling && (
                                <p style={{ marginTop: '10px', fontSize: '12px', color: 'var(--color-text-muted)', fontStyle: 'italic' }}>
                                    Pulling <code style={{ fontFamily: 'monospace' }}>{ollamaPulling}</code>… this may take a few minutes depending on model size and your connection. The page will refresh when it's done.
                                </p>
                            )}
                        </div>
                    </>
                )}
            </section>
            )}

            {/* MCP Integration tab */}
            {activeTab === 'mcp' && (
            <section className="card" style={{ padding: '28px' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', marginBottom: '4px' }}>
                    <Plug size={18} style={{ marginTop: '3px', color: 'var(--color-text-secondary)' }} />
                    <div>
                        <h2 style={{ fontSize: '17px', fontWeight: 600 }}>MCP Integration</h2>
                        <p style={{ fontSize: '13px', color: 'var(--color-text-secondary)', marginTop: '4px' }}>
                            Expose your councils as tools to MCP-compatible AI apps (Claude Desktop, Cursor, Windsurf, …). Toggle each app on or off below — Agora writes the entry into that app's config file. Restart the app to pick up the change.
                        </p>
                    </div>
                </div>

                {mcpError && (
                    <div style={{ marginTop: '14px', padding: '10px 14px', borderRadius: '8px', background: 'var(--color-error-light)', border: '1px solid rgba(229,72,77,0.15)', color: 'var(--color-error)', fontSize: '12px' }}>
                        {mcpError}
                    </div>
                )}

                {!mcp ? (
                    <p style={{ marginTop: '16px', fontSize: '13px', color: 'var(--color-text-muted)', fontStyle: 'italic' }}>Loading MCP status…</p>
                ) : (
                    <>
                        {!mcp.mcp_package_installed && (
                            <div style={{ marginTop: '14px', padding: '10px 14px', borderRadius: '8px', background: '#FFFBEB', border: '1px solid #FCD34D', color: '#92400E', fontSize: '12px' }}>
                                The <code>mcp</code> Python package isn't installed in your venv. Run <code>./install.sh</code> (or <code>./venv/bin/pip install "mcp&gt;=1.0.0"</code>) before enabling any client.
                            </div>
                        )}

                        <div style={{ marginTop: '16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            {mcp.clients.map(c => {
                                const busy = mcpBusy === c.key
                                return (
                                    <div
                                        key={c.key}
                                        style={{
                                            display: 'flex', alignItems: 'center', gap: '12px',
                                            padding: '12px 14px', borderRadius: '10px',
                                            background: c.configured ? 'var(--color-sidebar-active)' : 'var(--color-bg-base)',
                                            border: '1px solid ' + (c.configured ? 'rgba(79,125,242,0.25)' : 'var(--color-border-light)'),
                                        }}
                                    >
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                <span style={{ fontSize: '13px', fontWeight: 600 }}>{c.label}</span>
                                                {c.configured && (
                                                    <span style={{ fontSize: '10px', fontWeight: 700, color: '#fff', background: 'var(--color-success)', padding: '1px 6px', borderRadius: '4px', letterSpacing: '0.03em' }}>ENABLED</span>
                                                )}
                                                {!c.config_present && !c.configured && (
                                                    <span style={{ fontSize: '10px', fontWeight: 600, color: 'var(--color-text-muted)', background: 'transparent', border: '1px solid var(--color-border)', padding: '1px 6px', borderRadius: '4px' }}>not detected</span>
                                                )}
                                                {!c.valid_json && (
                                                    <span style={{ fontSize: '10px', fontWeight: 700, color: 'var(--color-error)', background: '#FEF2F2', border: '1px solid rgba(220,38,38,0.2)', padding: '1px 6px', borderRadius: '4px' }}>invalid JSON</span>
                                                )}
                                            </div>
                                            <div style={{ fontSize: '11px', color: 'var(--color-text-muted)', fontFamily: 'monospace', marginTop: '3px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={c.path}>{c.path}</div>
                                        </div>
                                        {c.configured ? (
                                            <button
                                                onClick={() => toggleMcpClient(c.key, false)}
                                                disabled={busy}
                                                className="btn-secondary"
                                                style={{ fontSize: '12px', padding: '6px 12px', flexShrink: 0 }}
                                            >
                                                {busy ? '…' : 'Disable'}
                                            </button>
                                        ) : (
                                            <button
                                                onClick={() => toggleMcpClient(c.key, true)}
                                                disabled={busy || !c.valid_json}
                                                className="btn-primary"
                                                style={{ fontSize: '12px', padding: '6px 12px', flexShrink: 0 }}
                                                title={!c.valid_json ? 'Existing config is invalid JSON — fix or move it aside first.' : 'Write the agora entry into this app’s config'}
                                            >
                                                {busy ? '…' : 'Enable'}
                                            </button>
                                        )}
                                    </div>
                                )
                            })}
                        </div>

                        <div style={{ marginTop: '20px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                                <p style={{ fontSize: '12px', fontWeight: 600, color: 'var(--color-text-secondary)' }}>For other MCP clients — paste this snippet:</p>
                                <button
                                    onClick={copyMcpSnippet}
                                    className="btn-secondary"
                                    style={{ fontSize: '11px', padding: '4px 10px', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                                >
                                    <Copy size={12} /> {mcpCopied ? 'Copied' : 'Copy'}
                                </button>
                            </div>
                            <pre style={{
                                fontSize: '11px', fontFamily: 'monospace', padding: '12px 14px',
                                borderRadius: '8px', background: 'var(--color-bg-base)',
                                border: '1px solid var(--color-border-light)',
                                overflow: 'auto', margin: 0, lineHeight: 1.5,
                            }}>{JSON.stringify(mcp.snippet, null, 2)}</pre>
                        </div>
                    </>
                )}
            </section>
            )}

            {/* Usage tab */}
            {activeTab === 'usage' && (
            <section className="card" style={{ padding: '28px' }}>
                <h2 style={{ fontSize: '17px', fontWeight: 600, marginBottom: '18px' }}>Usage & Costs</h2>

                {usage && usage.total_deliberations > 0 ? (
                    <>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px', marginBottom: '20px' }}>
                            <StatCard label="Total Spend" value={`$${usage.total_spend.toFixed(4)}`} />
                            <StatCard label="Deliberations" value={usage.total_deliberations} />
                            <StatCard label="Avg Cost" value={`$${usage.average_cost.toFixed(4)}`} />
                        </div>

                        {usage.recent_deliberations.length > 0 && (
                            <div style={{ borderRadius: '8px', overflow: 'hidden', border: '1px solid var(--color-border-light)' }}>
                                <table style={{ width: '100%', fontSize: '13px', borderCollapse: 'collapse' }}>
                                    <thead>
                                        <tr style={{ background: 'var(--color-bg-base)' }}>
                                            <th style={{ textAlign: 'left', padding: '10px 14px', fontWeight: 500, fontSize: '12px', color: 'var(--color-text-muted)' }}>Date</th>
                                            <th style={{ textAlign: 'left', padding: '10px 14px', fontWeight: 500, fontSize: '12px', color: 'var(--color-text-muted)' }}>Council</th>
                                            <th style={{ textAlign: 'right', padding: '10px 14px', fontWeight: 500, fontSize: '12px', color: 'var(--color-text-muted)' }}>Tokens</th>
                                            <th style={{ textAlign: 'right', padding: '10px 14px', fontWeight: 500, fontSize: '12px', color: 'var(--color-text-muted)' }}>Cost</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {usage.recent_deliberations.map(d => (
                                            <tr key={d.id} style={{ borderTop: '1px solid var(--color-border-light)' }}>
                                                <td style={{ padding: '10px 14px', fontSize: '12px' }}>{d.created_at ? new Date(d.created_at).toLocaleDateString() : '-'}</td>
                                                <td style={{ padding: '10px 14px', fontSize: '12px' }}>{d.council_name}</td>
                                                <td style={{ padding: '10px 14px', fontSize: '12px', textAlign: 'right', fontFamily: 'monospace' }}>{(d.total_tokens || 0).toLocaleString()}</td>
                                                <td style={{ padding: '10px 14px', fontSize: '12px', textAlign: 'right', fontFamily: 'monospace', color: 'var(--color-cost)' }}>${(d.cost_usd || 0).toFixed(4)}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </>
                ) : (
                    <p style={{ fontSize: '13px', fontStyle: 'italic', color: 'var(--color-text-muted)' }}>
                        No deliberations yet. Run your first statement in the Chamber.
                    </p>
                )}
            </section>
            )}

            {/* Account tab: About card (shown after API Key on the same tab) */}
            {activeTab === 'account' && (
            <section className="card" style={{ padding: '28px' }}>
                <h2 style={{ fontSize: '17px', fontWeight: 600, marginBottom: '14px' }}>About</h2>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '14px', color: 'var(--color-text-secondary)' }}>
                    <p><strong style={{ color: 'var(--color-text-primary)' }}>Agora</strong> v0.2.0</p>
                    <p>
                        Powered by <strong style={{ color: 'var(--color-text-primary)' }}>Agora Engine</strong>.
                    </p>
                    <p>
                        LLM access via{' '}
                        <a href="https://openrouter.ai" target="_blank" rel="noopener"
                            style={{ color: 'var(--color-primary)', textDecoration: 'underline', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                            OpenRouter <ExternalLink size={12} />
                        </a>
                    </p>
                    <p style={{ fontSize: '12px', marginTop: '8px', color: 'var(--color-text-muted)' }}>Licensed under MIT.</p>
                </div>
            </section>
            )}
        </div>
    )
}

function StatCard({ label, value }) {
    return (
        <div style={{
            borderRadius: '10px', padding: '18px', textAlign: 'center',
            background: 'var(--color-bg-base)', border: '1px solid var(--color-border-light)',
        }}>
            <p style={{ fontSize: '22px', fontWeight: 700, color: 'var(--color-text-primary)' }}>{value}</p>
            <p style={{ fontSize: '12px', marginTop: '4px', color: 'var(--color-text-muted)' }}>{label}</p>
        </div>
    )
}

import { useState, useEffect } from 'react'
import { Eye, EyeOff, Check, X, ExternalLink } from 'lucide-react'

export default function Settings() {
    const [settings, setSettings] = useState({ openrouter_key_set: false, openrouter_key_preview: '', default_model: 'openai/gpt-4o' })
    const [apiKey, setApiKey] = useState('')
    const [showKey, setShowKey] = useState(false)
    const [keyStatus, setKeyStatus] = useState(null) // null, 'testing', 'success', 'error'
    const [keyMessage, setKeyMessage] = useState('')
    const [models, setModels] = useState([])
    const [modelsLoading, setModelsLoading] = useState(true)
    const [modelSearch, setModelSearch] = useState('')
    const [usage, setUsage] = useState(null)
    const [selectedModel, setSelectedModel] = useState('')
    const [saving, setSaving] = useState(false)

    useEffect(() => {
        fetch('/api/settings').then(r => r.json()).then(data => {
            setSettings(data)
            setSelectedModel(data.default_model || 'openai/gpt-4o')
        }).catch(() => { })
        fetch('/api/models').then(r => r.json()).then(data => { setModels(data.models || []); setModelsLoading(false) }).catch(() => setModelsLoading(false))
        fetch('/api/settings/usage').then(r => r.json()).then(setUsage).catch(() => { })
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

    const saveModel = async () => {
        setSaving(true)
        await fetch('/api/settings', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ default_model: selectedModel }),
        })
        setSaving(false)
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

    const currentModel = models.find(m => m.id === selectedModel)

    return (
        <div className="animate-fade-in-up" style={{ maxWidth: '680px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '24px' }}>
            <div>
                <h1 style={{ fontSize: '24px', fontWeight: 700, marginBottom: '4px' }}>Settings</h1>
                <p style={{ fontSize: '14px', color: 'var(--color-text-secondary)' }}>Manage your API key, default model, and view usage.</p>
            </div>

            {/* Section A: API Key */}
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

            {/* Section B: Default Model */}
            <section className="card" style={{ padding: '28px' }}>
                <h2 style={{ fontSize: '17px', fontWeight: 600, marginBottom: '4px' }}>Default AI Model</h2>
                <p style={{ fontSize: '13px', color: 'var(--color-text-secondary)', marginBottom: '18px' }}>
                    Used for all councillors unless you set an override. More capable models give better results but cost more.
                </p>

                {models.length > 0 ? (
                    <>
                        {/* Current default */}
                        {currentModel && (
                            <div style={{
                                padding: '12px 14px', borderRadius: '10px', marginBottom: '14px',
                                background: 'var(--color-sidebar-active)',
                                border: '1px solid rgba(79,125,242,0.25)',
                                display: 'flex', alignItems: 'center', gap: '12px',
                            }}>
                                <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--color-primary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Current</span>
                                <span style={{ flex: 1, fontSize: '13px', fontWeight: 500 }}>{currentModel.name}</span>
                                <span style={{ fontSize: '11px', fontFamily: 'monospace', color: 'var(--color-cost)' }}>
                                    {currentModel.is_free ? 'Free' : `$${currentModel.prompt_price_per_million.toFixed(2)} / $${currentModel.completion_price_per_million.toFixed(2)}`}
                                </span>
                            </div>
                        )}

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
                                            {providerModels.map(m => (
                                                <label
                                                    key={m.id}
                                                    style={{
                                                        display: 'flex', alignItems: 'center', gap: '12px',
                                                        padding: '10px 12px', borderRadius: '8px', cursor: 'pointer',
                                                        transition: 'all 0.15s',
                                                        background: selectedModel === m.id ? 'var(--color-sidebar-active)' : 'transparent',
                                                        border: selectedModel === m.id ? '1px solid rgba(79,125,242,0.25)' : '1px solid transparent',
                                                    }}
                                                >
                                                    <input
                                                        type="radio"
                                                        name="model"
                                                        value={m.id}
                                                        checked={selectedModel === m.id}
                                                        onChange={() => setSelectedModel(m.id)}
                                                        style={{ accentColor: 'var(--color-primary)' }}
                                                    />
                                                    <span style={{ flex: 1, fontSize: '13px' }}>
                                                        {m.is_free && (
                                                            <span style={{
                                                                display: 'inline-block', padding: '1px 6px', fontSize: '10px',
                                                                fontWeight: 700, color: '#fff', borderRadius: '4px',
                                                                background: 'var(--color-free)', marginRight: '8px',
                                                            }}>FREE</span>
                                                        )}
                                                        {m.name}
                                                    </span>
                                                    <span style={{ fontSize: '11px', fontFamily: 'monospace', color: 'var(--color-cost)' }}>
                                                        {m.is_free ? 'Free' : `$${m.prompt_price_per_million.toFixed(2)} / $${m.completion_price_per_million.toFixed(2)}`}
                                                    </span>
                                                </label>
                                            ))}
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
                    <div style={{ marginTop: '18px', display: 'flex', alignItems: 'center', gap: '14px' }}>
                        <button onClick={saveModel} disabled={saving} className="btn-primary">
                            {saving ? 'Saving...' : 'Save Default Model'}
                        </button>
                        <span style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>
                            {models.length} models with tool-calling support
                        </span>
                    </div>
                )}
            </section>

            {/* Section C: Usage */}
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

            {/* Section D: About */}
            <section className="card" style={{ padding: '28px' }}>
                <h2 style={{ fontSize: '17px', fontWeight: 600, marginBottom: '14px' }}>About</h2>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '14px', color: 'var(--color-text-secondary)' }}>
                    <p><strong style={{ color: 'var(--color-text-primary)' }}>Agora</strong> v0.1.0</p>
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

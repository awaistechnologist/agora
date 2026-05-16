import { useState, useEffect, useRef } from 'react'
import { useParams } from 'react-router-dom'
import { Send, Loader, DollarSign, Clock, Brain, AlertTriangle } from 'lucide-react'
import PreCheckCard from '../components/PreCheckCard'

const STANCE_COLORS = {
    supportive: { bg: '#ECFDF5', color: '#059669', border: 'rgba(5,150,105,0.2)' },
    mixed: { bg: '#EFF6FF', color: '#2563EB', border: 'rgba(37,99,235,0.2)' },
    critical: { bg: '#FEF2F2', color: '#DC2626', border: 'rgba(220,38,38,0.2)' },
    neutral: { bg: '#F9FAFB', color: '#6B7280', border: 'rgba(107,114,128,0.2)' },
}

const AVATARS = ['#4F7DF2', '#7C5CFC', '#E5484D', '#F5A623', '#34B87A', '#0891B2', '#DB2777']

// Sentinel value for the council picker meaning "let the architect choose".
const AUTO_PICK = '__auto__'

const BUDGETS = [
    { key: 'free', label: 'Free', hint: 'Local Ollama models first; then free OpenRouter models. No spend.' },
    { key: 'cheap', label: 'Cheap', hint: 'Inexpensive paid models — fast and good enough for most things.' },
    { key: 'best', label: 'Best', hint: 'Top-tier paid models. Highest quality, highest cost.' },
]

const PERSPECTIVE_COLORS = {
    supportive: '#34B87A',
    neutral: '#6B7280',
    critical: '#F5A623',
    contrarian: '#E5484D',
}

export default function Chamber() {
    const { sessionId } = useParams()
    const [councils, setCouncils] = useState([])
    const [selectedCouncil, setSelectedCouncil] = useState('')
    const [statement, setStatement] = useState('')
    const [isRunning, setIsRunning] = useState(false)
    const [responses, setResponses] = useState([])
    const [verdict, setVerdict] = useState(null)
    const [error, setError] = useState('')
    const [loadedSession, setLoadedSession] = useState(null)
    const [preCheckData, setPreCheckData] = useState(null)
    // Auto-pick mode state
    const [budget, setBudget] = useState('free')
    const [designing, setDesigning] = useState(false)
    const [proposal, setProposal] = useState(null)
    const containerRef = useRef(null)

    useEffect(() => {
        fetch('/api/councils')
            .then(r => r.json())
            .then(data => {
                const active = data.filter(c => c.is_active)
                setCouncils(active)
                if (active.length > 0 && !sessionId) setSelectedCouncil(active[0].id)
            })
            .catch(() => { })
    }, [])

    // Load past session if sessionId is in the URL
    useEffect(() => {
        if (!sessionId) return
        fetch(`/api/chamber/sessions/${sessionId}`)
            .then(r => r.json())
            .then(data => {
                setLoadedSession(data)
                setStatement(data.statement || '')
                setSelectedCouncil(data.council_id || '')
                // Map stored responses to the same shape the live submit uses
                setResponses((data.responses || []).map(r => ({
                    councillor_name: r.councillor_name,
                    councillor_role: r.councillor_role,
                    response_text: r.response_text,
                    stance: r.stance,
                    model_used: r.model_used,
                    total_tokens: r.total_tokens,
                    cost_usd: r.cost_usd,
                })))
                if (data.verdict) {
                    setVerdict({
                        verdict_text: data.verdict,
                        confidence: data.confidence,
                        total_cost_usd: data.total_cost_usd,
                        total_tokens: data.total_tokens,
                        model_summary: data.model_summary,
                        duration_seconds: data.duration_seconds,
                    })
                }
            })
            .catch(() => setError('Could not load session.'))
    }, [sessionId])

    const selectedCouncilData = councils.find(c => c.id === selectedCouncil)
    const isSymptomChecker = selectedCouncilData?.name?.toLowerCase().includes('symptom')

    const scrollToBottom = () => {
        if (containerRef.current) {
            setTimeout(() => {
                containerRef.current.scrollTo({
                    top: containerRef.current.scrollHeight,
                    behavior: 'smooth',
                })
            }, 50)
        }
    }

    const handleStreamEvent = (ev) => {
        const t = ev.type
        const d = ev.data || {}

        if (t === 'councillor_start') {
            setPreCheckData(null)
            setResponses(prev => {
                if (prev.find(r => r.councillor_id === d.councillor_id)) return prev
                return [...prev, {
                    councillor_id: d.councillor_id,
                    councillor_name: d.councillor_name,
                    councillor_role: d.councillor_role || '',
                    response_text: '',
                    stance: 'mixed',
                    model_used: d.model_used || '',
                    streaming: true,
                }]
            })
            scrollToBottom()
        } else if (t === 'councillor_token') {
            setResponses(prev => prev.map(r =>
                r.councillor_id === d.councillor_id
                    ? { ...r, response_text: (r.response_text || '') + (d.delta || '') }
                    : r
            ))
        } else if (t === 'councillor_response') {
            // Final councillor data — merge with any token-built text we already have.
            setResponses(prev => prev.map(r =>
                r.councillor_id === d.councillor_id
                    ? { ...r, ...d, streaming: false }
                    : r
            ))
        } else if (t === 'verdict_start') {
            setVerdict({ verdict_text: '', streaming: true, model_used: d.model_used })
            scrollToBottom()
        } else if (t === 'verdict_token') {
            setVerdict(prev => ({
                ...(prev || { verdict_text: '' }),
                verdict_text: ((prev && prev.verdict_text) || '') + (d.delta || ''),
                streaming: true,
            }))
        } else if (t === 'verdict') {
            setVerdict({ ...d, streaming: false })
            scrollToBottom()
        } else if (t === 'pre_check') {
            setPreCheckData(d)
            scrollToBottom()
        } else if (t === 'error') {
            setError(d.message || 'Something went wrong.')
        }
    }

    // Drive a streaming deliberation. Factored out so both the normal "user
    // picked a council" path and the auto-pick "we just designed one" path
    // can call it with explicit council + optional model_override + optional
    // force_web_search (Auto-pick uses this when routing to an existing
    // council that has web search OFF but the architect says we need it).
    const streamSubmit = async (statementText, bypass, councilId, modelOverride, forceWebSearch = false) => {
        if (!councilId || !statementText.trim() || isRunning) return

        setIsRunning(true)
        setResponses([])
        setVerdict(null)
        setError('')
        setPreCheckData(null)

        try {
            const res = await fetch('/api/chamber/submit/stream', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    council_id: councilId,
                    statement: statementText.trim(),
                    bypass_pre_check: bypass,
                    model_override: modelOverride || null,
                    force_web_search: !!forceWebSearch,
                }),
            })
            if (!res.ok || !res.body) {
                const data = await res.json().catch(() => ({}))
                setError(data.detail || 'Something went wrong.')
                setIsRunning(false)
                return
            }

            // Manually parse SSE — EventSource is GET-only, and we need a POST body.
            const reader = res.body.getReader()
            const decoder = new TextDecoder()
            let buffer = ''
            while (true) {
                const { value, done } = await reader.read()
                if (done) break
                buffer += decoder.decode(value, { stream: true })
                let sep
                while ((sep = buffer.indexOf('\n\n')) !== -1) {
                    const block = buffer.slice(0, sep)
                    buffer = buffer.slice(sep + 2)
                    const dataLines = block.split('\n')
                        .filter(line => line.startsWith('data:'))
                        .map(line => line.slice(5).trim())
                    if (!dataLines.length) continue
                    try {
                        handleStreamEvent(JSON.parse(dataLines.join('\n')))
                    } catch {
                        // ignore malformed chunks
                    }
                }
            }
        } catch (err) {
            setError('Failed to submit statement. Is the backend running?')
        }

        setIsRunning(false)
    }

    // Main entry point. If the user picked Auto-pick, first call the architect
    // and show a proposal — the deliberation only starts after they confirm.
    // Otherwise, just stream against the selected council.
    const submit = async (customStatement = null, bypass = false) => {
        const finalStatement = customStatement || statement
        if (!selectedCouncil || !finalStatement.trim() || isRunning || designing) return

        if (selectedCouncil === AUTO_PICK) {
            setDesigning(true)
            setError('')
            setProposal(null)
            setResponses([])
            setVerdict(null)
            setPreCheckData(null)
            try {
                const res = await fetch('/api/chamber/auto-design', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ statement: finalStatement.trim(), budget }),
                })
                const data = await res.json()
                if (!res.ok) {
                    const detail = data.detail
                    const msg = typeof detail === 'string'
                        ? detail
                        : (detail && detail.message) || 'Auto-design failed.'
                    setError(msg)
                } else {
                    setProposal(data)
                    scrollToBottom()
                }
            } catch {
                setError('Failed to reach backend for auto-design.')
            }
            setDesigning(false)
            return
        }

        streamSubmit(finalStatement, bypass, selectedCouncil, null)
    }

    // User confirmed the architect's proposal. If they need a new council,
    // materialise it via the existing POST /api/councils; then stream the
    // deliberation against it, passing the architect-chosen model as override.
    const runProposal = async () => {
        if (!proposal) return
        setError('')
        let councilId = proposal.decision === 'use_existing' ? proposal.council_id : null
        const wantsSearch = !!proposal.needs_web_search

        if (proposal.decision === 'create_new') {
            try {
                const nc = proposal.new_council
                const body = {
                    name: nc.name,
                    description: nc.description,
                    icon: nc.icon || 'users',
                    coordinator_instructions: nc.coordinator_instructions || null,
                    // Architect already analysed the statement — skip pre-check for this council.
                    pre_check_enabled: false,
                    // If architect says the topic is time-sensitive, bake web
                    // search into the new council so it's on for future runs too.
                    // 'local' (DuckDuckGo) works with both cloud and Ollama models.
                    web_search_enabled: wantsSearch,
                    web_search_provider: wantsSearch ? 'local' : 'openrouter',
                    councillors: (nc.councillors || []).map(c => ({
                        name: c.name,
                        role_description: c.role_description,
                        expertise_area: c.expertise_area || '',
                        perspective: c.perspective || 'neutral',
                        instructions: c.instructions || null,
                        model_tier: c.model_tier || 'balanced',
                    })),
                }
                const res = await fetch('/api/councils', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(body),
                })
                const created = await res.json()
                if (!res.ok || !created.id) {
                    setError(created.detail || 'Could not create the proposed council.')
                    return
                }
                councilId = created.id
                // Refresh the council list so the new one shows in the picker.
                fetch('/api/councils')
                    .then(r => r.json())
                    .then(data => setCouncils(data.filter(c => c.is_active)))
                    .catch(() => { })
            } catch {
                setError('Failed to create the proposed council.')
                return
            }
        }

        const modelOverride = (proposal.chosen_model && proposal.chosen_model.id) || null
        // For use_existing, the existing council may have web search OFF;
        // pass a per-submission override so the architect's call is honoured.
        // For create_new it's already baked in but passing again is harmless.
        const forceSearch = wantsSearch
        setProposal(null)
        // Switch the picker to the actual council so the user sees what's running.
        setSelectedCouncil(councilId)
        streamSubmit(statement, true, councilId, modelOverride, forceSearch)
    }

    const cancelProposal = () => {
        setProposal(null)
        setError('')
    }

    const handleKeyDown = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault()
            submit()
        }
    }

    return (
        <div style={{ display: 'flex', flexDirection: 'column', minHeight: 'calc(100vh - 80px)' }} className="animate-fade-in-up">
            <div style={{ marginBottom: '24px' }}>
                <h1 style={{ fontSize: '24px', fontWeight: 700, marginBottom: '4px', color: '#111827' }}>Chamber</h1>
                <p style={{ fontSize: '14px', color: '#6B7280' }}>
                    Submit a statement to your council and get multi-perspective analysis.
                </p>
            </div>

            {/* Input Card */}
            <div className="card" style={{ padding: '24px', marginBottom: '20px' }}>
                {/* Council Picker */}
                <div style={{ marginBottom: '16px' }}>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, color: '#9CA3AF', marginBottom: '6px' }}>
                        Select Council
                    </label>
                    <select
                        value={selectedCouncil}
                        onChange={e => { setSelectedCouncil(e.target.value); setProposal(null); setError('') }}
                        className="input"
                        style={{ cursor: 'pointer' }}
                    >
                        <option value={AUTO_PICK}>🪄 Auto-pick (Agora chooses or designs)</option>
                        {councils.map(c => (
                            <option key={c.id} value={c.id}>
                                {c.name} ({c.councillor_count} councillors)
                            </option>
                        ))}
                    </select>
                    {selectedCouncilData?.web_search_enabled && (
                        <div style={{
                            display: 'inline-flex', alignItems: 'center', gap: '5px',
                            marginTop: '8px', padding: '4px 10px', borderRadius: '6px',
                            fontSize: '11px', fontWeight: 600, color: 'var(--color-primary)',
                            background: 'rgba(79,125,242,0.1)',
                        }}>
                            🌐 Web Search Enabled
                        </div>
                    )}

                    {/* Budget knob — only in Auto-pick mode */}
                    {selectedCouncil === AUTO_PICK && (
                        <div style={{ marginTop: '10px' }}>
                            <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, color: '#9CA3AF', marginBottom: '6px' }}>
                                Budget
                            </label>
                            <div style={{ display: 'flex', gap: '6px' }}>
                                {BUDGETS.map(b => {
                                    const on = budget === b.key
                                    return (
                                        <button
                                            key={b.key}
                                            onClick={() => setBudget(b.key)}
                                            title={b.hint}
                                            style={{
                                                flex: 1, padding: '8px 12px', borderRadius: '8px',
                                                fontSize: '13px', fontWeight: on ? 600 : 500,
                                                background: on ? 'var(--color-primary)' : 'transparent',
                                                color: on ? '#fff' : '#6B7280',
                                                border: on ? '1px solid var(--color-primary)' : '1px solid #E5E7EB',
                                                cursor: 'pointer', transition: 'all 0.15s',
                                            }}
                                        >
                                            {b.label}
                                        </button>
                                    )
                                })}
                            </div>
                            <p style={{ fontSize: '11px', color: '#9CA3AF', marginTop: '6px', lineHeight: 1.4 }}>
                                {BUDGETS.find(b => b.key === budget)?.hint}
                            </p>
                        </div>
                    )}
                </div>

                {/* Symptom Checker Warning */}
                {isSymptomChecker && (
                    <div style={{
                        borderRadius: '10px', padding: '14px 18px', marginBottom: '16px',
                        display: 'flex', alignItems: 'flex-start', gap: '12px',
                        background: '#FFFBEB', border: '1px solid rgba(245,166,35,0.25)',
                    }}>
                        <AlertTriangle size={18} style={{ color: '#F5A623', flexShrink: 0, marginTop: '2px' }} />
                        <div>
                            <p style={{ fontSize: '13px', fontWeight: 600, color: '#92400E' }}>⚠️ Not a diagnostic tool</p>
                            <p style={{ fontSize: '12px', marginTop: '4px', color: '#78350F', lineHeight: 1.5 }}>
                                This council helps you think through symptoms but does NOT provide medical diagnoses.
                                Always consult a healthcare professional.
                            </p>
                        </div>
                    </div>
                )}

                {/* Statement Input */}
                <div style={{ position: 'relative' }}>
                    <textarea
                        value={statement}
                        onChange={e => setStatement(e.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder={isSymptomChecker
                            ? "Describe your symptoms..."
                            : "Enter your statement, question, or idea..."
                        }
                        rows={3}
                        disabled={isRunning}
                        className="input"
                        style={{
                            paddingRight: '52px',
                            resize: 'none',
                            lineHeight: 1.6,
                            fontFamily: 'inherit',
                        }}
                    />
                    <button
                        onClick={() => submit()}
                        disabled={isRunning || !statement.trim() || !selectedCouncil}
                        style={{
                            position: 'absolute', right: '10px', bottom: '10px',
                            width: '40px', height: '40px', borderRadius: '10px',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            color: '#fff', background: '#4F7DF2',
                            cursor: isRunning || !statement.trim() ? 'not-allowed' : 'pointer',
                            opacity: isRunning || !statement.trim() ? 0.4 : 1,
                            transition: 'all 0.15s',
                            border: 'none',
                        }}
                    >
                        {isRunning ? <Loader size={18} className="animate-spin" /> : <Send size={18} />}
                    </button>
                </div>
            </div>

            {/* Error */}
            {error && (
                <div className="animate-fade-in" style={{
                    borderRadius: '10px', padding: '14px 18px', marginBottom: '16px',
                    fontSize: '13px', color: '#E5484D',
                    background: '#FEF2F2', border: '1px solid rgba(229,72,77,0.15)',
                }}>
                    {error}
                </div>
            )}

            {/* Results */}
            <div ref={containerRef} style={{ display: 'flex', flexDirection: 'column', gap: '16px', paddingBottom: '40px' }}>

                {/* Central Loader — only shown briefly before any councillor starts */}
                {isRunning && responses.length === 0 && !preCheckData && !verdict && (
                    <div className="animate-fade-in" style={{
                        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                        padding: '60px 0', opacity: 0.8
                    }}>
                        <div style={{ position: 'relative', width: '60px', height: '60px', marginBottom: '20px' }}>
                            <div style={{
                                position: 'absolute', inset: 0, borderRadius: '50%',
                                border: '4px solid #E5E7EB', borderTopColor: '#4F7DF2',
                                animation: 'spin 1s linear infinite'
                            }} />
                            <Brain size={24} style={{
                                position: 'absolute', top: '50%', left: '50%',
                                transform: 'translate(-50%, -50%)', color: '#4F7DF2'
                            }} />
                        </div>
                        <p style={{ fontSize: '16px', fontWeight: 600, color: '#374151' }}>
                            Convening the Council...
                        </p>
                        <p style={{ fontSize: '13px', color: '#9CA3AF', marginTop: '6px' }}>
                            Gathering perspectives and analysing statement.
                        </p>
                    </div>
                )}

                {/* Designing-your-council loader (Auto-pick architect phase) */}
                {designing && (
                    <div className="animate-fade-in" style={{
                        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                        padding: '40px 0',
                    }}>
                        <div style={{ position: 'relative', width: '48px', height: '48px', marginBottom: '14px' }}>
                            <div style={{
                                position: 'absolute', inset: 0, borderRadius: '50%',
                                border: '3px solid #E5E7EB', borderTopColor: '#7C5CFC',
                                animation: 'spin 1s linear infinite',
                            }} />
                        </div>
                        <p style={{ fontSize: '15px', fontWeight: 600, color: '#374151' }}>
                            🪄 Designing your council…
                        </p>
                        <p style={{ fontSize: '12px', color: '#9CA3AF', marginTop: '4px' }}>
                            Picking a working model, then choosing or designing the right council.
                        </p>
                    </div>
                )}

                {/* Architect proposal — shown after /auto-design returns; awaits user confirm */}
                {proposal && (
                    <ProposalCard
                        proposal={proposal}
                        onRun={runProposal}
                        onCancel={cancelProposal}
                    />
                )}

                {/* Pre-Check Card */}
                {preCheckData && (
                    <PreCheckCard
                        data={preCheckData}
                        onRevise={(clarifications) => {
                            // PreCheckCard sends a fully-formed Q&A block that
                            // includes the original questions, so the council
                            // sees the full conversation, not just the answers.
                            const next = `${statement}\n\n${clarifications}`
                            setStatement(next)
                            submit(next, true)
                        }}
                        onBypass={() => submit(null, true)}
                    />
                )}


                {/* Councillor Response Cards */}
                {responses.map((d, idx) => {
                    const stanceStyle = STANCE_COLORS[d.stance] || STANCE_COLORS.neutral
                    const avatarColor = AVATARS[idx % AVATARS.length]
                    return (
                        <div
                            key={idx}
                            className="animate-fade-in-up"
                            style={{
                                background: '#fff',
                                borderRadius: '12px',
                                border: '1px solid #E5E7EB',
                                boxShadow: '0 1px 3px rgba(0,0,0,0.04), 0 1px 2px rgba(0,0,0,0.06)',
                                overflow: 'visible',
                                flexShrink: 0,
                            }}
                        >
                            {/* Header */}
                            <div style={{
                                display: 'flex', alignItems: 'center', gap: '14px',
                                padding: '16px 20px',
                                borderBottom: '1px solid #F0F1F3',
                            }}>
                                <div style={{
                                    width: '38px', height: '38px', borderRadius: '50%',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    fontSize: '13px', fontWeight: 700, color: '#fff', background: avatarColor,
                                    flexShrink: 0,
                                }}>
                                    {d.councillor_name?.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()}
                                </div>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <p style={{ fontSize: '15px', fontWeight: 600, color: '#111827' }}>{d.councillor_name}</p>
                                    {d.councillor_role && (
                                        <p style={{ fontSize: '12px', color: '#9CA3AF', marginTop: '2px' }}>{d.councillor_role}</p>
                                    )}
                                </div>
                                {d.streaming ? (
                                    <span style={{
                                        display: 'inline-flex', alignItems: 'center', gap: '6px',
                                        padding: '4px 10px', fontSize: '11px', fontWeight: 600,
                                        borderRadius: '20px',
                                        background: '#EFF6FF', color: '#2563EB',
                                        border: '1px solid rgba(37,99,235,0.2)',
                                        whiteSpace: 'nowrap',
                                    }}>
                                        <span style={{ display: 'inline-flex', gap: '3px' }}>
                                            {[0, 1, 2].map(i => (
                                                <span key={i} style={{
                                                    width: '5px', height: '5px', borderRadius: '50%',
                                                    background: '#2563EB',
                                                    animation: `pulseDot 1.2s ease-in-out ${i * 0.3}s infinite`,
                                                }} />
                                            ))}
                                        </span>
                                        thinking
                                    </span>
                                ) : (
                                    <span style={{
                                        padding: '4px 12px', fontSize: '11px', fontWeight: 600,
                                        borderRadius: '20px', textTransform: 'capitalize',
                                        background: stanceStyle.bg, color: stanceStyle.color,
                                        border: `1px solid ${stanceStyle.border}`,
                                        whiteSpace: 'nowrap',
                                    }}>
                                        {d.stance}
                                    </span>
                                )}
                            </div>

                            {/* Body — response text */}
                            <div style={{ padding: '20px 22px' }}>
                                <p style={{
                                    fontSize: '14px',
                                    lineHeight: 1.75,
                                    whiteSpace: 'pre-wrap',
                                    color: '#1F2937',
                                    wordBreak: 'break-word',
                                    minHeight: d.streaming && !d.response_text ? '24px' : undefined,
                                }}>
                                    {d.response_text}
                                    {d.streaming && (
                                        <span style={{
                                            display: 'inline-block', width: '2px', height: '1em',
                                            verticalAlign: 'text-bottom', marginLeft: '2px',
                                            background: '#4F7DF2',
                                            animation: 'pulseDot 1s ease-in-out infinite',
                                        }} />
                                    )}
                                </p>
                            </div>

                            {/* Footer — model and cost info */}
                            <div style={{
                                display: 'flex', alignItems: 'center', gap: '16px',
                                padding: '10px 22px',
                                borderTop: '1px solid #F0F1F3',
                                background: '#FAFBFC',
                            }}>
                                <span style={{ fontSize: '11px', fontFamily: 'monospace', color: '#9CA3AF' }}>
                                    {d.model_used?.split('/').pop()}
                                </span>
                                <span style={{ fontSize: '11px', color: '#9CA3AF' }}>
                                    {(d.total_tokens || 0).toLocaleString()} tokens
                                </span>
                                <span style={{ fontSize: '11px', fontFamily: 'monospace', color: '#6B7280' }}>
                                    ${(d.cost_usd || 0).toFixed(4)}
                                </span>
                            </div>
                        </div>
                    )
                })}

                {/* Verdict */}
                {verdict && (
                    <div className="animate-fade-in-up" style={{
                        borderRadius: '12px', overflow: 'hidden',
                        background: 'linear-gradient(135deg, #F8F6FF 0%, #EEF2FF 100%)',
                        border: '1px solid rgba(124,92,252,0.2)',
                        boxShadow: '0 2px 12px rgba(124,92,252,0.08)',
                    }}>
                        {/* Verdict header */}
                        <div style={{
                            display: 'flex', alignItems: 'center', gap: '12px',
                            padding: '16px 22px', borderBottom: '1px solid rgba(124,92,252,0.12)',
                        }}>
                            <Brain size={20} style={{ color: '#7C5CFC' }} />
                            <h3 style={{ fontWeight: 700, color: '#7C5CFC', flex: 1, fontSize: '16px' }}>
                                Verdict {verdict.streaming && (
                                    <span style={{ fontSize: '11px', fontWeight: 500, color: '#9CA3AF', marginLeft: '8px' }}>
                                        synthesising…
                                    </span>
                                )}
                            </h3>
                            {verdict.confidence && (
                                <span style={{
                                    padding: '4px 12px', fontSize: '11px', fontWeight: 600, borderRadius: '20px',
                                    textTransform: 'capitalize',
                                    background: verdict.confidence === 'high' ? '#ECFDF5' : verdict.confidence === 'low' ? '#FEF2F2' : '#EFF6FF',
                                    color: verdict.confidence === 'high' ? '#059669' : verdict.confidence === 'low' ? '#DC2626' : '#2563EB',
                                }}>
                                    {verdict.confidence} Confidence
                                </span>
                            )}
                        </div>

                        {/* Verdict body */}
                        <div style={{ padding: '22px' }}>
                            <p style={{
                                fontSize: '14px',
                                lineHeight: 1.75,
                                whiteSpace: 'pre-wrap',
                                color: '#1F2937',
                                wordBreak: 'break-word',
                            }}>
                                {verdict.verdict_text}
                                {verdict.streaming && (
                                    <span style={{
                                        display: 'inline-block', width: '2px', height: '1em',
                                        verticalAlign: 'text-bottom', marginLeft: '2px',
                                        background: '#7C5CFC',
                                        animation: 'pulseDot 1s ease-in-out infinite',
                                    }} />
                                )}
                            </p>
                        </div>

                        {/* Verdict footer */}
                        <div style={{
                            display: 'flex', alignItems: 'center', gap: '20px', flexWrap: 'wrap',
                            padding: '12px 22px', borderTop: '1px solid rgba(124,92,252,0.1)',
                            fontSize: '12px', color: '#6B7280',
                        }}>
                            <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <DollarSign size={13} /> Total: ${(verdict.total_cost_usd || 0).toFixed(4)}
                            </span>
                            <span>{(verdict.total_tokens || 0).toLocaleString()} tokens</span>
                            {verdict.model_summary && <span>Models: {verdict.model_summary}</span>}
                            {verdict.duration_seconds && (
                                <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                    <Clock size={13} /> {verdict.duration_seconds}s
                                </span>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </div>
    )
}


// Auto-pick proposal card. Shows the architect's decision: either "we'll use
// this existing council" or "we designed this fresh one for you" — with the
// chosen model and a councillor preview. Run / Cancel buttons let the user
// confirm before any council is created or any deliberation starts.
function ProposalCard({ proposal, onRun, onCancel }) {
    const isNew = proposal.decision === 'create_new'
    const nc = proposal.new_council || {}
    const chosen = proposal.chosen_model || {}
    return (
        <div className="animate-fade-in-up" style={{
            background: 'linear-gradient(135deg, #F5F3FF 0%, #EEF2FF 100%)',
            borderRadius: '12px',
            border: '1px solid rgba(124,92,252,0.25)',
            boxShadow: '0 2px 12px rgba(124,92,252,0.08)',
            overflow: 'hidden',
            marginBottom: '16px',
        }}>
            <div style={{ padding: '18px 22px', borderBottom: '1px solid rgba(124,92,252,0.12)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: '15px', fontWeight: 700, color: '#5B21B6' }}>🪄 Council Proposal</span>
                    {chosen.id && (
                        <span style={{
                            fontSize: '11px', fontWeight: 600, padding: '2px 8px',
                            borderRadius: '4px', background: 'rgba(124,92,252,0.12)',
                            color: '#5B21B6', fontFamily: 'monospace',
                        }}>
                            {chosen.name || chosen.id} · {chosen.budget}
                        </span>
                    )}
                    {proposal.needs_web_search && (
                        <span
                            title={proposal.web_search_rationale || 'The architect thinks this question needs current web information.'}
                            style={{
                                fontSize: '11px', fontWeight: 600, padding: '2px 8px',
                                borderRadius: '4px', background: 'rgba(34,184,122,0.12)',
                                color: '#15803D', display: 'inline-flex', alignItems: 'center', gap: '4px',
                            }}
                        >
                            🌐 Web search on
                        </span>
                    )}
                </div>
                <p style={{ fontSize: '13px', color: '#4C1D95', lineHeight: 1.5 }}>
                    {proposal.rationale}
                </p>
                {proposal.needs_web_search && proposal.web_search_rationale && (
                    <p style={{ fontSize: '12px', color: '#166534', marginTop: '6px', lineHeight: 1.5 }}>
                        🌐 {proposal.web_search_rationale}
                    </p>
                )}
            </div>

            <div style={{ padding: '18px 22px' }}>
                {isNew ? (
                    <>
                        <p style={{ fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#6B7280', marginBottom: '10px' }}>
                            New council: {nc.name}
                        </p>
                        <p style={{ fontSize: '13px', color: '#374151', marginBottom: '14px', lineHeight: 1.5 }}>
                            {nc.description}
                        </p>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                            {(nc.councillors || []).map((c, i) => (
                                <div key={i} style={{
                                    display: 'flex', alignItems: 'center', gap: '12px',
                                    padding: '10px 12px', borderRadius: '8px',
                                    background: '#fff', border: '1px solid #E5E7EB',
                                }}>
                                    <span style={{
                                        width: '8px', height: '8px', borderRadius: '50%',
                                        background: PERSPECTIVE_COLORS[c.perspective] || PERSPECTIVE_COLORS.neutral,
                                        flexShrink: 0,
                                    }} />
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <span style={{ fontSize: '13px', fontWeight: 600, color: '#111827' }}>{c.name}</span>
                                        {c.expertise_area && (
                                            <span style={{ fontSize: '12px', color: '#6B7280', marginLeft: '8px' }}>· {c.expertise_area}</span>
                                        )}
                                        <p style={{ fontSize: '12px', color: '#6B7280', marginTop: '2px', lineHeight: 1.5 }}>
                                            {c.role_description}
                                        </p>
                                    </div>
                                    <span style={{
                                        fontSize: '10px', fontWeight: 700, padding: '2px 6px',
                                        borderRadius: '4px', background: '#F3F4F6', color: '#4B5563',
                                        textTransform: 'uppercase', flexShrink: 0,
                                    }}>
                                        {c.model_tier}
                                    </span>
                                </div>
                            ))}
                        </div>
                        <p style={{ fontSize: '11px', color: '#9CA3AF', marginTop: '10px', lineHeight: 1.5 }}>
                            This council will be saved so you can reuse and edit it later.
                        </p>
                    </>
                ) : (
                    <p style={{ fontSize: '13px', color: '#374151' }}>
                        Going to use the existing <strong>{proposal.council_id?.replace(/^default-/, '')}</strong> council for this question.
                    </p>
                )}
            </div>

            <div style={{
                display: 'flex', gap: '10px', padding: '12px 22px',
                borderTop: '1px solid rgba(124,92,252,0.12)',
                background: 'rgba(255,255,255,0.4)',
            }}>
                <button
                    onClick={onRun}
                    style={{
                        padding: '8px 18px', fontSize: '13px', fontWeight: 600,
                        borderRadius: '8px', cursor: 'pointer',
                        background: '#7C5CFC', color: '#fff', border: 'none',
                        boxShadow: '0 1px 3px rgba(124,92,252,0.3)',
                    }}
                >
                    Run
                </button>
                <button
                    onClick={onCancel}
                    style={{
                        padding: '8px 16px', fontSize: '13px', fontWeight: 500,
                        borderRadius: '8px', cursor: 'pointer',
                        background: 'transparent', color: '#6B7280',
                        border: '1px solid #E5E7EB',
                    }}
                >
                    Cancel
                </button>
                {typeof proposal.cost_usd === 'number' && (
                    <span style={{ marginLeft: 'auto', alignSelf: 'center', fontSize: '11px', color: '#9CA3AF', fontFamily: 'monospace' }}>
                        Design cost: ${proposal.cost_usd.toFixed(4)} · {proposal.total_tokens || 0} tokens
                    </span>
                )}
            </div>
        </div>
    )
}

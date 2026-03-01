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

export default function Chamber() {
    const { sessionId } = useParams()
    const [councils, setCouncils] = useState([])
    const [selectedCouncil, setSelectedCouncil] = useState('')
    const [statement, setStatement] = useState('')
    const [isRunning, setIsRunning] = useState(false)
    const [responses, setResponses] = useState([])
    const [verdict, setVerdict] = useState(null)
    const [error, setError] = useState('')
    const [thinkingName, setThinkingName] = useState('')
    const [loadedSession, setLoadedSession] = useState(null)
    const [preCheckData, setPreCheckData] = useState(null)
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

    const sleep = (ms) => new Promise(r => setTimeout(r, ms))

    const submit = async (customStatement = null, bypass = false) => {
        const finalStatement = customStatement || statement
        if (!selectedCouncil || !finalStatement.trim() || isRunning) return

        setIsRunning(true)
        setResponses([])
        setVerdict(null)
        setError('')
        setThinkingName('')
        setPreCheckData(null)

        try {
            const res = await fetch('/api/chamber/submit', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    council_id: selectedCouncil,
                    statement: finalStatement.trim(),
                    bypass_pre_check: bypass
                }),
            })
            const data = await res.json()

            if (!res.ok) {
                setError(data.detail || 'Something went wrong.')
                setIsRunning(false)
                return
            }

            const allEvents = data.events || []

            // Progressive reveal — show each councillor one at a time
            for (let i = 0; i < allEvents.length; i++) {
                const ev = allEvents[i]

                if (ev.type === 'councillor_start') {
                    setThinkingName(ev.data.councillor_name)
                    setPreCheckData(null) // Clear pre-check if we are proceeding
                    scrollToBottom()
                    await sleep(800)
                } else if (ev.type === 'councillor_response') {
                    setThinkingName('')
                    setResponses(prev => [...prev, ev.data])
                    scrollToBottom()
                    await sleep(500)
                } else if (ev.type === 'verdict') {
                    setThinkingName('')
                    await sleep(400)
                    setVerdict(ev.data)
                    scrollToBottom()
                } else if (ev.type === 'pre_check') {
                    setThinkingName('')
                    setPreCheckData(ev.data)
                    scrollToBottom()
                } else if (ev.type === 'error') {
                    setError(ev.data.message)
                }
            }
        } catch (err) {
            setError('Failed to submit statement. Is the backend running?')
        }

        setThinkingName('')
        setIsRunning(false)
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
                        onChange={e => setSelectedCouncil(e.target.value)}
                        className="input"
                        style={{ cursor: 'pointer' }}
                    >
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

                {/* Central Loader */}
                {isRunning && !thinkingName && responses.length === 0 && !preCheckData && (
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

                {/* Pre-Check Card */}
                {preCheckData && (
                    <PreCheckCard
                        data={preCheckData}
                        onRevise={(addContext) => {
                            setStatement(`${statement}\n\nAdditional Context: ${addContext}`)
                            submit(`${statement}\n\nAdditional Context: ${addContext}`)
                        }}
                        onBypass={() => submit(null, true)}
                    />
                )}

                {/* Active councillor "thinking" indicator */}
                {thinkingName && (
                    <div className="card animate-fade-in" style={{ padding: '18px 22px', display: 'flex', alignItems: 'center', gap: '14px' }}>
                        <div style={{ display: 'flex', gap: '5px', alignItems: 'center' }}>
                            {[0, 1, 2].map(i => (
                                <span key={i} style={{
                                    width: '7px', height: '7px', borderRadius: '50%',
                                    background: '#4F7DF2',
                                    animation: `pulseDot 1.2s ease-in-out ${i * 0.3}s infinite`,
                                }} />
                            ))}
                        </div>
                        <span style={{ fontSize: '14px', color: '#6B7280' }}>
                            <strong style={{ color: '#111827' }}>{thinkingName}</strong> is deliberating...
                        </span>
                    </div>
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
                                <span style={{
                                    padding: '4px 12px', fontSize: '11px', fontWeight: 600,
                                    borderRadius: '20px', textTransform: 'capitalize',
                                    background: stanceStyle.bg, color: stanceStyle.color,
                                    border: `1px solid ${stanceStyle.border}`,
                                    whiteSpace: 'nowrap',
                                }}>
                                    {d.stance}
                                </span>
                            </div>

                            {/* Body — response text */}
                            <div style={{ padding: '20px 22px' }}>
                                <p style={{
                                    fontSize: '14px',
                                    lineHeight: 1.75,
                                    whiteSpace: 'pre-wrap',
                                    color: '#1F2937',
                                    wordBreak: 'break-word',
                                }}>
                                    {d.response_text}
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
                            <h3 style={{ fontWeight: 700, color: '#7C5CFC', flex: 1, fontSize: '16px' }}>Verdict</h3>
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

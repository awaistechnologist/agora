import { useState } from 'react'
import { AlertCircle, ArrowRight, Play } from 'lucide-react'

export default function PreCheckCard({ data, onRevise, onBypass }) {
    const questions = data.questions || []
    const [answers, setAnswers] = useState(() => questions.map(() => ''))
    const [extra, setExtra] = useState('')

    const updateAnswer = (idx, value) => {
        setAnswers(prev => {
            const next = [...prev]
            next[idx] = value
            return next
        })
    }

    const hasAnyInput =
        answers.some(a => a.trim().length > 0) || extra.trim().length > 0

    // Build a structured clarifications block. We include the questions
    // verbatim so the councillors see the full Q&A — without this they would
    // only see the user's answers and have no idea what was asked.
    const buildClarifications = () => {
        const parts = []
        if (questions.length > 0) {
            parts.push(
                'The council coordinator asked the following clarifying questions before deliberation. The user\'s answers are provided below.'
            )
            parts.push('')
            questions.forEach((q, i) => {
                const a = answers[i]?.trim() || '(no answer provided)'
                parts.push(`Q${i + 1}: ${q}`)
                parts.push(`A${i + 1}: ${a}`)
                parts.push('')
            })
        }
        if (extra.trim()) {
            parts.push('Additional context from the user:')
            parts.push(extra.trim())
        }
        return parts.join('\n').trim()
    }

    const handleRevise = () => {
        if (!hasAnyInput) return
        onRevise(buildClarifications())
    }

    return (
        <div className="animate-fade-in-up" style={{
            background: '#FFFBEB',
            borderRadius: '12px',
            border: '1px solid #FCD34D',
            boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
            overflow: 'hidden',
            marginBottom: '16px'
        }}>
            <div style={{ padding: '20px 24px' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', marginBottom: '16px' }}>
                    <AlertCircle style={{ color: '#D97706', flexShrink: 0, marginTop: '2px' }} size={20} />
                    <div>
                        <h3 style={{ fontSize: '16px', fontWeight: 600, color: '#92400E', marginBottom: '4px' }}>
                            Clarification Needed
                        </h3>
                        <p style={{ fontSize: '14px', color: '#B45309' }}>
                            The council coordinator needs a bit more context to give you the best advice.
                            <br />
                            <span style={{ fontSize: '12px', opacity: 0.9 }}>
                                (Pre-check cost: ${data.cost?.toFixed(4) || '0.0000'})
                            </span>
                        </p>
                    </div>
                </div>

                {/* Understanding */}
                {data.understood && (
                    <div style={{ marginBottom: '16px', padding: '12px 16px', background: 'rgba(255,255,255,0.6)', borderRadius: '8px' }}>
                        <p style={{ fontSize: '13px', fontWeight: 600, color: '#92400E', marginBottom: '4px' }}>
                            Coordinator's Understanding:
                        </p>
                        <p style={{ fontSize: '13px', color: '#78350F', fontStyle: 'italic' }}>
                            "{data.understood}"
                        </p>
                    </div>
                )}

                {/* Per-question inputs */}
                {questions.length > 0 && (
                    <div style={{ marginBottom: '16px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
                        <p style={{ fontSize: '13px', fontWeight: 600, color: '#92400E' }}>
                            Please answer the coordinator's questions:
                        </p>
                        {questions.map((q, i) => (
                            <div key={i}>
                                <label style={{ display: 'block', fontSize: '13px', color: '#78350F', marginBottom: '6px', lineHeight: 1.5 }}>
                                    <span style={{ fontWeight: 700, marginRight: '6px' }}>Q{i + 1}.</span>
                                    {q}
                                </label>
                                <textarea
                                    className="input"
                                    rows={2}
                                    style={{ width: '100%', minHeight: '52px', background: '#fff', resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.5 }}
                                    placeholder="Your answer..."
                                    value={answers[i]}
                                    onChange={e => updateAnswer(i, e.target.value)}
                                />
                            </div>
                        ))}
                    </div>
                )}

                {/* Optional extra context */}
                <div style={{ marginBottom: '20px' }}>
                    <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#92400E', marginBottom: '6px' }}>
                        Anything else? <span style={{ fontWeight: 400, color: '#B45309' }}>(optional)</span>
                    </label>
                    <textarea
                        className="input"
                        rows={3}
                        style={{ width: '100%', minHeight: '70px', background: '#fff', resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.5 }}
                        placeholder="Any extra context the council should know..."
                        value={extra}
                        onChange={e => setExtra(e.target.value)}
                    />
                </div>

                {/* Actions */}
                <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                    <button
                        onClick={handleRevise}
                        disabled={!hasAnyInput}
                        style={{
                            display: 'flex', alignItems: 'center', gap: '8px',
                            padding: '8px 16px', borderRadius: '8px',
                            background: hasAnyInput ? '#D97706' : '#FCD34D',
                            color: '#fff', border: 'none', fontWeight: 600, fontSize: '13px',
                            cursor: hasAnyInput ? 'pointer' : 'not-allowed',
                            boxShadow: '0 1px 2px rgba(0,0,0,0.1)',
                            opacity: hasAnyInput ? 1 : 0.6,
                        }}
                        title={hasAnyInput ? 'Send your answers to the council' : 'Answer at least one question first'}
                    >
                        <ArrowRight size={16} /> Revise & Resubmit
                    </button>

                    <button
                        onClick={onBypass}
                        style={{
                            display: 'flex', alignItems: 'center', gap: '8px',
                            padding: '8px 16px', borderRadius: '8px',
                            background: 'transparent', color: '#92400E',
                            border: '1px solid rgba(146, 64, 14, 0.3)',
                            fontWeight: 600, fontSize: '13px',
                            cursor: 'pointer'
                        }}
                    >
                        <Play size={16} /> Submit Anyway
                    </button>
                </div>
            </div>
        </div>
    )
}

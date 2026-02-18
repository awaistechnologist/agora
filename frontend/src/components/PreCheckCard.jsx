import { useState } from 'react'
import { AlertCircle, ArrowRight, Play } from 'lucide-react'

export default function PreCheckCard({ data, onRevise, onBypass }) {
    const [additionalContext, setAdditionalContext] = useState('')

    const handleRevise = () => {
        onRevise(additionalContext)
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

                {/* Questions */}
                <div style={{ marginBottom: '20px' }}>
                    <p style={{ fontSize: '13px', fontWeight: 600, color: '#92400E', marginBottom: '8px' }}>
                        Questions for you:
                    </p>
                    <ul style={{ listStyle: 'disc', paddingLeft: '20px', color: '#78350F', fontSize: '14px', lineHeight: 1.6 }}>
                        {data.questions?.map((q, i) => (
                            <li key={i}>{q}</li>
                        ))}
                    </ul>
                </div>

                {/* Input */}
                <div style={{ marginBottom: '20px' }}>
                    <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#92400E', marginBottom: '6px' }}>
                        Add context here:
                    </label>
                    <textarea
                        className="input"
                        style={{ width: '100%', minHeight: '80px', background: '#fff' }}
                        placeholder="e.g. The target audience is teenagers..."
                        value={additionalContext}
                        onChange={e => setAdditionalContext(e.target.value)}
                    />
                </div>

                {/* Actions */}
                <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                    <button
                        onClick={handleRevise}
                        style={{
                            display: 'flex', alignItems: 'center', gap: '8px',
                            padding: '8px 16px', borderRadius: '8px',
                            background: '#D97706', color: '#fff',
                            border: 'none', fontWeight: 600, fontSize: '13px',
                            cursor: 'pointer', boxShadow: '0 1px 2px rgba(0,0,0,0.1)'
                        }}
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

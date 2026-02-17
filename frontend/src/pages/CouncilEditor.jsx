import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Plus, Trash2, GripVertical, ChevronDown, ChevronUp, Save, ArrowLeft, RotateCcw, Globe } from 'lucide-react'
import ModelPicker from '../components/ModelPicker'

const PERSPECTIVES = [
    { value: 'supportive', label: 'Supportive', color: '#34B87A' },
    { value: 'neutral', label: 'Neutral', color: '#6B7280' },
    { value: 'critical', label: 'Critical', color: '#F5A623' },
    { value: 'contrarian', label: 'Contrarian', color: '#E5484D' },
]

const ICONS = ['users', 'lightbulb', 'heart', 'activity', 'brain', 'shield', 'star', 'target', 'compass', 'zap']

export default function CouncilEditor() {
    const { id } = useParams()
    const navigate = useNavigate()
    const isEdit = !!id

    const [name, setName] = useState('')
    const [description, setDescription] = useState('')
    const [icon, setIcon] = useState('users')
    const [coordinatorInstructions, setCoordinatorInstructions] = useState('')
    const [webSearchEnabled, setWebSearchEnabled] = useState(false)
    const [webSearchProvider, setWebSearchProvider] = useState('openrouter')
    const [councillors, setCouncillors] = useState([
        { name: '', role_description: '', expertise_area: '', perspective: 'neutral', instructions: '', model_override: null, expanded: true },
        { name: '', role_description: '', expertise_area: '', perspective: 'neutral', instructions: '', model_override: null, expanded: false },
    ])
    const [saving, setSaving] = useState(false)
    const [error, setError] = useState('')
    const [models, setModels] = useState([])
    const [isDefault, setIsDefault] = useState(false)
    const [resetting, setResetting] = useState(false)

    useEffect(() => {
        // Fetch available models
        fetch('/api/models')
            .then(r => r.json())
            .then(data => setModels(data.models || []))
            .catch(() => { })
        if (isEdit) {
            fetch(`/api/councils/${id}`)
                .then(r => r.json())
                .then(data => {
                    setName(data.name)
                    setDescription(data.description)
                    setIcon(data.icon)
                    setCoordinatorInstructions(data.coordinator_instructions || '')
                    setWebSearchEnabled(data.web_search_enabled || false)
                    setWebSearchProvider(data.web_search_provider || 'openrouter')
                    setIsDefault(data.is_default || false)
                    setCouncillors(data.councillors.map(c => ({ ...c, expanded: false })))
                })
                .catch(() => setError('Could not load council.'))
        }
    }, [id])

    const addCouncillor = () => {
        if (councillors.length >= 10) return
        setCouncillors([
            ...councillors.map(c => ({ ...c, expanded: false })),
            {
                name: '', role_description: '', expertise_area: '', perspective: 'neutral', instructions: '', model_override: null, expanded: true,
            }])
    }

    const removeCouncillor = (idx) => {
        if (councillors.length <= 2) return
        setCouncillors(councillors.filter((_, i) => i !== idx))
    }

    const updateCouncillor = (idx, field, value) => {
        const updated = [...councillors]
        updated[idx] = { ...updated[idx], [field]: value }
        setCouncillors(updated)
    }

    const toggleExpand = (idx) => {
        const updated = [...councillors]
        updated[idx] = { ...updated[idx], expanded: !updated[idx].expanded }
        setCouncillors(updated)
    }

    const save = async () => {
        if (!name.trim()) { setError('Council name is required.'); return }
        if (!description.trim()) { setError('Description is required.'); return }
        const validCouncillors = councillors.filter(c => c.name.trim() && c.role_description.trim())
        if (validCouncillors.length < 2) { setError('At least 2 councillors with name and role are required.'); return }

        setSaving(true)
        setError('')

        const payload = {
            name: name.trim(),
            description: description.trim(),
            icon,
            coordinator_instructions: coordinatorInstructions.trim() || null,
            web_search_enabled: webSearchEnabled,
            web_search_provider: webSearchProvider,
            councillors: validCouncillors.map(c => ({
                id: c.id,
                name: c.name.trim(),
                role_description: c.role_description.trim(),
                expertise_area: c.expertise_area?.trim() || '',
                perspective: c.perspective,
                instructions: c.instructions?.trim() || null,
                model_override: c.model_override || null,
            })),
        }

        try {
            const url = isEdit ? `/api/councils/${id}` : '/api/councils'
            const method = isEdit ? 'PUT' : 'POST'
            const res = await fetch(url, {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            })
            if (res.ok) {
                navigate('/councils')
            } else {
                const data = await res.json()
                setError(data.detail || 'Failed to save council.')
            }
        } catch {
            setError('Failed to save council.')
        }
        setSaving(false)
    }

    return (
        <div className="animate-fade-in-up">
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '28px' }}>
                <button
                    onClick={() => navigate('/councils')}
                    className="btn-secondary"
                    style={{ padding: '8px 12px' }}
                >
                    <ArrowLeft size={16} />
                </button>
                <h1 style={{ fontSize: '24px', fontWeight: 700 }}>
                    {isEdit ? 'Edit Council' : 'Create New Council'}
                </h1>
            </div>

            <div style={{ display: 'flex', gap: '28px' }}>
                {/* Left column — Form */}
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '20px' }}>
                    {error && (
                        <div style={{
                            borderRadius: '10px', padding: '14px 18px', fontSize: '13px',
                            background: 'var(--color-error-light)', color: 'var(--color-error)',
                            border: '1px solid rgba(229,72,77,0.15)',
                        }}>
                            {error}
                        </div>
                    )}

                    {/* Metadata */}
                    <div className="card" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '18px' }}>
                        <div>
                            <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, marginBottom: '6px' }}>Council Name</label>
                            <input
                                type="text"
                                value={name}
                                onChange={e => setName(e.target.value)}
                                maxLength={60}
                                placeholder="e.g., Marketing Strategy Panel"
                                className="input"
                            />
                            <span style={{ display: 'block', fontSize: '11px', marginTop: '4px', color: 'var(--color-text-muted)' }}>{name.length}/60</span>
                        </div>

                        <div>
                            <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, marginBottom: '6px' }}>Description</label>
                            <textarea
                                value={description}
                                onChange={e => setDescription(e.target.value)}
                                maxLength={300}
                                rows={3}
                                placeholder="What does this council do? What kind of questions is it best for?"
                                className="input"
                                style={{ resize: 'none', fontFamily: 'inherit', lineHeight: 1.6 }}
                            />
                            <span style={{ display: 'block', fontSize: '11px', marginTop: '4px', color: 'var(--color-text-muted)' }}>{description.length}/300</span>
                        </div>

                        <div>
                            <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, marginBottom: '8px' }}>Icon</label>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                                {ICONS.map(ic => (
                                    <button
                                        key={ic}
                                        onClick={() => setIcon(ic)}
                                        style={{
                                            width: '38px', height: '38px', borderRadius: '8px',
                                            fontSize: '12px', fontWeight: 600,
                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                            cursor: 'pointer', border: 'none',
                                            background: icon === ic ? 'var(--color-sidebar-active)' : 'var(--color-bg-base)',
                                            color: icon === ic ? 'var(--color-primary)' : 'var(--color-text-secondary)',
                                            outline: icon === ic ? '2px solid var(--color-primary)' : 'none',
                                            outlineOffset: '1px',
                                            transition: 'all 0.15s',
                                        }}
                                        title={ic}
                                    >
                                        {ic.charAt(0).toUpperCase()}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>

                    {/* Web Search Toggle */}
                    <div className="card" style={{ padding: '16px', display: 'flex', flexDirection: 'column' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                <Globe size={18} style={{ color: webSearchEnabled ? 'var(--color-primary)' : 'var(--color-text-muted)' }} />
                                <div>
                                    <span style={{ fontSize: '13px', fontWeight: 600 }}>Web Search</span>
                                    <p style={{ fontSize: '11px', color: 'var(--color-text-muted)', marginTop: '2px', lineHeight: 1.4 }}>
                                        Let councillors access real-time web information when responding.
                                    </p>
                                </div>
                            </div>
                            <button
                                onClick={() => setWebSearchEnabled(!webSearchEnabled)}
                                style={{
                                    width: '44px', height: '24px', borderRadius: '12px', border: 'none',
                                    cursor: 'pointer', position: 'relative', transition: 'background 0.2s',
                                    background: webSearchEnabled ? 'var(--color-primary)' : 'var(--color-border)',
                                    flexShrink: 0,
                                }}
                            >
                                <span style={{
                                    position: 'absolute', top: '2px',
                                    left: webSearchEnabled ? '22px' : '2px',
                                    width: '20px', height: '20px', borderRadius: '50%',
                                    background: '#fff', transition: 'left 0.2s',
                                    boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
                                }} />
                            </button>
                        </div>

                        {webSearchEnabled && (
                            <div className="animate-fade-in" style={{
                                marginTop: '16px', paddingTop: '16px',
                                borderTop: '1px solid var(--color-border-light)'
                            }}>
                                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '10px' }}>Search Provider</label>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', cursor: 'pointer' }}>
                                        <input
                                            type="radio"
                                            checked={webSearchProvider === 'openrouter'}
                                            onChange={() => setWebSearchProvider('openrouter')}
                                            style={{ accentColor: 'var(--color-primary)' }}
                                        />
                                        <span>
                                            <strong style={{ fontWeight: 500 }}>OpenRouter</strong> <span style={{ color: 'var(--color-text-muted)', fontSize: '12px' }}>(Native / Paid)</span>
                                        </span>
                                    </label>
                                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', cursor: 'pointer' }}>
                                        <input
                                            type="radio"
                                            checked={webSearchProvider === 'local'}
                                            onChange={() => setWebSearchProvider('local')}
                                            style={{ accentColor: 'var(--color-primary)' }}
                                        />
                                        <span>
                                            <strong style={{ fontWeight: 500 }}>DuckDuckGo</strong> <span style={{ color: '#34B87A', fontSize: '12px', fontWeight: 500 }}>(Local Injection / Free)</span>
                                        </span>
                                    </label>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Coordinator Instructions */}
                    <div className="card" style={{ padding: '16px' }}>
                        <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '8px' }}>
                            Coordinator Prompt
                        </label>
                        <p style={{ fontSize: '11px', color: 'var(--color-text-muted)', marginBottom: '8px', lineHeight: 1.5 }}>
                            Instructions for synthesising councillor responses into a final verdict.
                        </p>
                        <textarea
                            value={coordinatorInstructions}
                            onChange={e => setCoordinatorInstructions(e.target.value)}
                            rows={6}
                            placeholder="Instructions for the coordinator who synthesises all councillor responses into a final verdict..."
                            className="input"
                            style={{ resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.6, minHeight: '80px' }}
                        />
                    </div>

                    {/* Councillors */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                        <h2 style={{ fontSize: '15px', fontWeight: 600 }}>Councillors ({councillors.length}/10)</h2>

                        {councillors.map((c, idx) => (
                            <div
                                key={idx}
                                className="card"
                                style={{ overflow: 'visible' }}
                            >
                                {/* Collapsed header */}
                                <div
                                    onClick={() => toggleExpand(idx)}
                                    style={{
                                        display: 'flex', alignItems: 'center', gap: '12px',
                                        padding: '14px 18px', cursor: 'pointer',
                                        transition: 'background 0.15s',
                                    }}
                                    onMouseEnter={e => e.currentTarget.style.background = 'var(--color-sidebar-hover)'}
                                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                                >
                                    <GripVertical size={14} style={{ color: 'var(--color-text-muted)' }} />
                                    <span style={{ flex: 1, fontSize: '14px', fontWeight: 500 }}>
                                        {c.name || `Councillor ${idx + 1}`}
                                        {c.expertise_area && (
                                            <span style={{ marginLeft: '8px', fontSize: '12px', fontWeight: 400, color: 'var(--color-text-muted)' }}>
                                                — {c.expertise_area}
                                            </span>
                                        )}
                                    </span>
                                    <PerspectiveDot perspective={c.perspective} />
                                    {c.expanded ? <ChevronUp size={14} style={{ color: 'var(--color-text-muted)' }} /> : <ChevronDown size={14} style={{ color: 'var(--color-text-muted)' }} />}
                                </div>

                                {/* Expanded form */}
                                {c.expanded && (
                                    <div className="animate-fade-in" style={{
                                        padding: '18px', paddingTop: '14px',
                                        borderTop: '1px solid var(--color-border-light)',
                                        display: 'flex', flexDirection: 'column', gap: '14px',
                                    }}>
                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                                            <div>
                                                <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, marginBottom: '5px' }}>Name</label>
                                                <input
                                                    type="text"
                                                    value={c.name}
                                                    onChange={e => updateCouncillor(idx, 'name', e.target.value)}
                                                    placeholder="e.g., The Sceptic"
                                                    className="input"
                                                />
                                            </div>
                                            <div>
                                                <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, marginBottom: '5px' }}>Expertise Area</label>
                                                <input
                                                    type="text"
                                                    value={c.expertise_area || ''}
                                                    onChange={e => updateCouncillor(idx, 'expertise_area', e.target.value)}
                                                    placeholder="e.g., Risk Assessment"
                                                    className="input"
                                                />
                                            </div>
                                        </div>

                                        <div>
                                            <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, marginBottom: '5px' }}>Role Description</label>
                                            <textarea
                                                value={c.role_description}
                                                onChange={e => updateCouncillor(idx, 'role_description', e.target.value)}
                                                rows={2}
                                                placeholder="Short description of this councillor's role."
                                                className="input"
                                                style={{ resize: 'none', fontFamily: 'inherit', lineHeight: 1.6 }}
                                            />
                                        </div>

                                        <div>
                                            <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, marginBottom: '5px' }}>System Prompt</label>
                                            <textarea
                                                value={c.instructions || ''}
                                                onChange={e => updateCouncillor(idx, 'instructions', e.target.value)}
                                                rows={6}
                                                placeholder="Detailed instructions for this councillor's LLM system prompt. This defines how the councillor thinks, responds, and what expertise they bring."
                                                className="input"
                                                style={{ resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.6, minHeight: '100px' }}
                                            />
                                        </div>

                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                                            <div>
                                                <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, marginBottom: '5px' }}>Perspective Bias</label>
                                                <select
                                                    value={c.perspective}
                                                    onChange={e => updateCouncillor(idx, 'perspective', e.target.value)}
                                                    className="input"
                                                    style={{ cursor: 'pointer' }}
                                                >
                                                    {PERSPECTIVES.map(p => (
                                                        <option key={p.value} value={p.value}>{p.label}</option>
                                                    ))}
                                                </select>
                                            </div>

                                            <div>
                                                <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, marginBottom: '5px' }}>Model</label>
                                                <ModelPicker
                                                    models={models}
                                                    value={c.model_override}
                                                    onChange={val => updateCouncillor(idx, 'model_override', val)}
                                                />
                                                <span style={{ display: 'block', fontSize: '11px', marginTop: '3px', color: 'var(--color-text-muted)' }}>
                                                    {c.model_override ? 'Custom model' : 'Inherits from Settings'}
                                                </span>
                                            </div>
                                        </div>

                                        {councillors.length > 2 && (
                                            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                                                <button
                                                    onClick={() => removeCouncillor(idx)}
                                                    style={{
                                                        padding: '8px', borderRadius: '8px',
                                                        color: 'var(--color-error)', cursor: 'pointer',
                                                        background: 'none', border: 'none',
                                                        transition: 'background 0.15s',
                                                    }}
                                                    onMouseEnter={e => e.currentTarget.style.background = 'var(--color-error-light)'}
                                                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                                                    title="Remove councillor"
                                                >
                                                    <Trash2 size={16} />
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        ))}

                        {councillors.length < 10 && (
                            <button
                                onClick={addCouncillor}
                                style={{
                                    width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    gap: '8px', padding: '14px', fontSize: '14px', fontWeight: 500,
                                    borderRadius: '12px', border: '2px dashed var(--color-border)',
                                    color: 'var(--color-text-secondary)', background: 'none',
                                    cursor: 'pointer', transition: 'all 0.15s',
                                }}
                                onMouseEnter={e => {
                                    e.currentTarget.style.borderColor = 'var(--color-primary)'
                                    e.currentTarget.style.color = 'var(--color-primary)'
                                }}
                                onMouseLeave={e => {
                                    e.currentTarget.style.borderColor = 'var(--color-border)'
                                    e.currentTarget.style.color = 'var(--color-text-secondary)'
                                }}
                            >
                                <Plus size={16} /> Add Councillor
                            </button>
                        )}
                    </div>

                    {/* Actions */}
                    <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                        <button
                            onClick={save}
                            disabled={saving}
                            className="btn-primary"
                            style={{ padding: '12px 24px', fontSize: '14px' }}
                        >
                            <Save size={16} />
                            {saving ? 'Saving...' : isEdit ? 'Save Changes' : 'Create Council'}
                        </button>

                        {isDefault && (
                            <button
                                onClick={async () => {
                                    if (!confirm('Reset this council to its original default configuration? All your changes will be lost.')) return
                                    setResetting(true)
                                    try {
                                        const res = await fetch(`/api/councils/${id}/reset`, { method: 'POST' })
                                        if (res.ok) {
                                            const data = await res.json()
                                            setName(data.name)
                                            setDescription(data.description)
                                            setIcon(data.icon)
                                            setCouncillors(data.councillors.map(c => ({ ...c, expanded: false })))
                                            setError('')
                                        } else {
                                            setError('Failed to reset council.')
                                        }
                                    } catch {
                                        setError('Failed to reset council.')
                                    }
                                    setResetting(false)
                                }}
                                disabled={resetting}
                                className="btn-secondary"
                                style={{ padding: '12px 20px', fontSize: '14px', color: 'var(--color-text-secondary)' }}
                            >
                                <RotateCcw size={16} />
                                {resetting ? 'Resetting...' : 'Reset to Default'}
                            </button>
                        )}
                    </div>
                </div>

                {/* Right column — Preview */}
                <div style={{ width: '300px', flexShrink: 0 }}>
                    <div className="card" style={{ position: 'sticky', top: '32px', padding: '24px' }}>
                        <h3 style={{ fontSize: '14px', fontWeight: 600, marginBottom: '18px', color: 'var(--color-text-secondary)' }}>Preview</h3>

                        <div style={{ textAlign: 'center', marginBottom: '18px' }}>
                            <h4 style={{ fontSize: '18px', fontWeight: 700 }}>{name || 'Council Name'}</h4>
                            <p style={{ fontSize: '13px', marginTop: '4px', color: 'var(--color-text-muted)', lineHeight: 1.5 }}>
                                {description || 'Council description'}
                            </p>
                        </div>

                        {/* Mini council visual */}
                        <div style={{ display: 'flex', justifyContent: 'center', flexWrap: 'wrap', gap: '8px', marginBottom: '16px' }}>
                            {councillors.filter(c => c.name).map((c, i) => (
                                <div
                                    key={i}
                                    title={c.name}
                                    style={{
                                        width: '42px', height: '42px', borderRadius: '50%',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        fontSize: '12px', fontWeight: 700, color: '#fff',
                                        background: `hsl(${210 + i * 40}, 60%, 55%)`,
                                    }}
                                >
                                    {c.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()}
                                </div>
                            ))}
                        </div>

                        <p style={{ textAlign: 'center', fontSize: '12px', color: 'var(--color-text-muted)' }}>
                            {councillors.filter(c => c.name).length} councillor{councillors.filter(c => c.name).length !== 1 ? 's' : ''}
                        </p>
                    </div>
                </div>
            </div>
        </div>
    )
}

function PerspectiveDot({ perspective }) {
    const p = PERSPECTIVES.find(x => x.value === perspective) || PERSPECTIVES[1]
    return (
        <span
            style={{
                width: '8px', height: '8px', borderRadius: '50%',
                background: p.color, flexShrink: 0, display: 'inline-block',
            }}
            title={p.label}
        />
    )
}

# Agora — Product & Technical Specification v1.1

**Project Name:** Agora  
**Tagline:** "Many voices. Better decisions."  
**Date:** February 2026  
**Status:** Phase 1 Specification  
**License:** Open Source (MIT)  
**Repository:** GitHub (public)  
**Powered by:** [Neuro SAN](https://github.com/cognizant-ai-lab/neuro-san-studio) (credited in UI, docs, and README — never in the product name)  
**Python:** 3.12 or 3.13  
**Frontend:** React 18 + Tailwind CSS 3  
**Backend:** FastAPI + SQLite (via SQLAlchemy)  
**LLM Gateway:** OpenRouter (OpenAI-compatible API)

---

## 1. Vision & Purpose

Agora is an open-source desktop application that lets anyone — regardless of technical skill — create panels of AI advisors ("councils") and run statements, ideas, or questions through them to get multi-perspective analysis. Think of it as a personal boardroom you can summon on your laptop.

Under the hood, Agora is powered by the Neuro SAN multi-agent orchestration framework and routes all LLM calls through OpenRouter, giving users access to hundreds of models with a single API key — and full transparency on what each deliberation costs.

### 1.1 Design Principles

- **Zero-config for beginners.** Clone, install, run. One command.
- **Light, warm, modern UI.** Soft whites, gentle gradients, muted accents. No dark themes, no moody tones. Ever.
- **Non-technical language everywhere.** The UI never says "HOCON", "agent network", "gRPC", or "manifest." Users see "council", "councillor", "chamber", "verdict."
- **Cost transparency.** Every deliberation shows what it cost. Every model shows its price. No surprises.
- **Engine isolation.** All Neuro SAN code lives in a single `/engine/` directory — a self-contained module with its own dependencies, updatable independently of the rest of Agora.

---

## 2. Target Users

The primary audience is non-developers: entrepreneurs, educators, community organisers, health-curious individuals, social impact workers, and anyone who wants structured multi-perspective AI feedback. They should never need to edit a config file, touch a terminal beyond the initial setup, or understand what an "agent" is.

---

## 3. Architecture Overview

```
┌───────────────────────────────────────────────────────┐
│                      AGORA APP                         │
│                                                        │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐ │
│  │  Frontend     │  │  Backend     │  │  Data        │ │
│  │  (React +    │◄►│  (Python     │  │  (SQLite     │ │
│  │   Tailwind)   │  │   FastAPI)   │  │   + HOCON)   │ │
│  └──────────────┘  └──────┬───────┘  └──────────────┘ │
│                            │                           │
│                  ┌─────────▼─────────┐                 │
│                  │     /engine/      │  ◄── ISOLATED   │
│                  │  Neuro SAN module │      submodule   │
│                  └─────────┬─────────┘                 │
│                            │                           │
└────────────────────────────┼───────────────────────────┘
                             │
                   ┌─────────▼──────────┐
                   │    OpenRouter      │
                   │    API Gateway     │
                   │  ┌──────────────┐  │
                   │  │ /api/v1/     │  │
                   │  │  models      │  │ ◄── model list + pricing
                   │  │  completions │  │ ◄── LLM calls + cost tracking
                   │  │  generation  │  │ ◄── async cost lookup
                   │  └──────────────┘  │
                   └────────────────────┘
```

### 3.1 Component Breakdown

**Frontend (React + Tailwind CSS)**  
Runs locally in the user's browser (served by the backend). Single-page app with four main views: Dashboard, Councils, Chamber, and Settings. Uses Tailwind with a custom light colour palette. Pre-built static assets committed to the repo — users never need Node.js.

**Backend (Python / FastAPI)**  
Lightweight HTTP server. Handles council CRUD, session management, OpenRouter model/pricing integration, and orchestrates calls to the engine. Persists data in a local SQLite database. Generates and manages HOCON files on behalf of the user.

**Engine — `/engine/` (Neuro SAN Integration)**  
A self-contained Python package that wraps ALL Neuro SAN interactions. This is the ONLY directory in the entire project that imports from `neuro_san`. It converts Agora's data model into HOCON configurations, manages the neuro-san server lifecycle, and translates responses back into Agora's domain language. Designed to be updatable as a git submodule or independently versioned package. See Section 4 for full detail.

**Data Layer (SQLite + JSON/HOCON files)**  
User settings, council definitions, session history, and cost records all stored in SQLite. Auto-generated HOCON files for neuro-san live in `/registries/`. Default councils ship as read-only templates in `/defaults/`.

---

## 4. Engine Module — Neuro SAN Isolation

### 4.1 Why This Matters

Neuro SAN is under active development (22 releases as of Feb 2026). Agora must be able to track upstream updates without touching core application code. The `/engine/` directory is the firewall: a clean, versioned interface between Agora and Neuro SAN.

### 4.2 Directory Structure

```
/engine/
├── __init__.py               # Exposes public interface only
├── requirements.txt          # Pins neuro-san version (e.g., neuro-san==0.2.5)
├── interface.py              # Abstract base: the contract Agora codes against
├── config_generator.py       # Council data model → HOCON file generation
├── manifest_manager.py       # Manages registries/manifest.hocon
├── server_manager.py         # Starts/stops/restarts neuro-san server process
├── session_client.py         # Sends statements, receives councillor responses
├── openrouter_adapter.py     # Injects OpenRouter config into HOCON llm_config
├── UPGRADE.md                # Step-by-step instructions for updating neuro-san
├── VERSION                   # Current neuro-san version this engine targets
└── tests/
    ├── test_config_generator.py
    ├── test_session_client.py
    └── test_interface_contract.py  # Verifies interface hasn't broken
```

### 4.3 Interface Contract

The rest of Agora ONLY imports from `engine.interface`. This file exposes:

```python
# engine/interface.py — the ONLY import point for the rest of Agora

class AgoraEngine:
    """Public interface. Agora's backend codes against this, never against neuro-san directly."""

    def start() -> bool
    def stop() -> bool
    def is_running() -> bool

    def register_council(council_data: CouncilSchema) -> str        # returns hocon path
    def unregister_council(council_id: str) -> bool
    def reload_council(council_id: str) -> bool

    def submit_statement(council_id: str, statement: str) -> SessionStream
    # SessionStream yields events: councillor_start, councillor_response, verdict, error, complete
    # Each councillor_response event includes token_usage and cost from OpenRouter

    def get_engine_version() -> str
    def get_neuro_san_version() -> str
```

### 4.4 Update Process

To update neuro-san, a developer (or CI pipeline):

1. Updates the version pin in `/engine/requirements.txt`
2. Runs `/engine/tests/test_interface_contract.py` to verify the public interface still works
3. Updates `/engine/VERSION`
4. Commits and merges

End users can run: `python -m agora update-engine` (a CLI helper that pulls the latest compatible engine version).

### 4.5 Submodule Readiness

The `/engine/` directory is structured so that it could be extracted into its own git repository and pulled in as a git submodule in future. For Phase 1, it lives inline in the monorepo for simplicity, but the isolation is already enforced by the interface contract.

---

## 5. OpenRouter Integration — Models, Pricing & Cost Tracking

### 5.1 Model Discovery via API

On startup and when the user opens the model picker, Agora calls:

```
GET https://openrouter.ai/api/v1/models?supported_parameters=tools
```

This returns ONLY models that support tool/function calling, which is required for neuro-san's agent delegation (AAOSA protocol). Each model in the response includes:

```json
{
  "id": "openai/gpt-4o",
  "name": "OpenAI: GPT-4o",
  "context_length": 128000,
  "pricing": {
    "prompt": "0.0000025",
    "completion": "0.00001",
    "image": "0.003613",
    "request": "0"
  },
  "supported_parameters": ["tools", "temperature", "max_tokens", ...],
  ...
}
```

Agora caches this list locally (refreshes every 30 minutes or on manual refresh) and uses it to populate all model selection dropdowns across the app.

### 5.2 Model Picker UI

Wherever the user selects a model (Settings default, or per-councillor override), the picker shows:

```
┌─────────────────────────────────────────────────────────┐
│  Select AI Model                              🔄 Refresh │
│                                                          │
│  ┌─ OpenAI ──────────────────────────────────────────┐  │
│  │  ⚡ GPT-4o              $2.50 / $10.00 per 1M tk  │  │
│  │  ⚡ GPT-4o Mini         $0.15 / $0.60  per 1M tk  │  │
│  │  ⚡ GPT-4.1             $2.00 / $8.00  per 1M tk  │  │
│  └───────────────────────────────────────────────────┘  │
│  ┌─ Anthropic ───────────────────────────────────────┐  │
│  │  ⚡ Claude Sonnet 4     $3.00 / $15.00 per 1M tk  │  │
│  │  ⚡ Claude Haiku 3.5    $0.80 / $4.00  per 1M tk  │  │
│  └───────────────────────────────────────────────────┘  │
│  ┌─ Meta ────────────────────────────────────────────┐  │
│  │  🆓 Llama 4 Scout       FREE                      │  │
│  │  ⚡ Llama 4 Maverick    $0.20 / $0.60  per 1M tk  │  │
│  └───────────────────────────────────────────────────┘  │
│  ┌─ Google ──────────────────────────────────────────┐  │
│  │  ⚡ Gemini 2.5 Pro      $1.25 / $10.00 per 1M tk  │  │
│  │  🆓 Gemini 2.5 Flash    FREE                      │  │
│  └───────────────────────────────────────────────────┘  │
│                                                          │
│  Showing 47 models with tool-calling support             │
│  💰 = input / output price per 1M tokens                 │
│                                                          │
│  Sort: [Cheapest first ▾]  [Provider ▾]  [Name ▾]       │
└─────────────────────────────────────────────────────────┘
```

**Key features of the model picker:**
- Models are grouped by provider (OpenAI, Anthropic, Meta, Google, Mistral, etc.)
- Each model shows input price / output price per 1 million tokens
- Free models are tagged with a 🆓 badge
- Models can be sorted by: cheapest first, most expensive first, provider, name
- A search/filter box at the top for quick lookup
- Only tool-calling-capable models are shown (filtered server-side via `supported_parameters=tools`)
- Pricing is fetched live from OpenRouter and cached locally (30-min TTL)

### 5.3 Cost Tracking Per Deliberation

Every OpenRouter completion response includes a `usage` object:

```json
{
  "usage": {
    "prompt_tokens": 1250,
    "completion_tokens": 340,
    "total_tokens": 1590,
    "cost": 0.00735
  }
}
```

Agora tracks cost at three levels:

**Per-councillor:** Each councillor response is a separate neuro-san agent call → separate OpenRouter completion. The `usage.cost` from each is stored in the `responses` table.

**Per-deliberation:** The sum of all councillor costs + the coordinator/verdict cost = total deliberation cost. Stored in the `sessions` table.

**Cumulative:** A running total across all deliberations, visible in Settings.

If the `usage.cost` field is not returned (rare edge case), Agora falls back to calculating cost from token counts × the model's cached pricing rates.

### 5.4 Cost Display in the UI

**On each councillor response card:**
Small muted text at the bottom-right: `$0.003` (or `< $0.001` for very cheap calls)

**On the verdict card:**
A "Deliberation Cost" line below the verdict: `Total cost: $0.024 · 5 councillors · 14,200 tokens`

**In session history:**
Each past deliberation row shows the cost alongside the timestamp and council name.

**In Settings → Usage:**
A new section showing:
- Total spend across all deliberations
- Number of deliberations run
- Average cost per deliberation
- A simple bar chart of daily/weekly spend (stretch goal for Phase 1, required for Phase 2)

### 5.5 OpenRouter HOCON Configuration

The engine module injects OpenRouter config into every generated HOCON agent:

```hocon
"llm_config": {
    "model_name": "openai/gpt-4o",
    "openai_api_key": "${OPENROUTER_API_KEY}",
    "base_url": "https://openrouter.ai/api/v1"
}
```

Per-councillor model overrides simply change the `model_name` value for that specific agent's HOCON block. The `OPENROUTER_API_KEY` is set as an environment variable when the engine starts.

---

## 6. User Interface Specification

### 6.1 Visual Design Language

| Property          | Value                                                     |
|-------------------|-----------------------------------------------------------|
| Base background   | `#FAFBFC` (very light cool grey)                          |
| Card background   | `#FFFFFF` with subtle `0 1px 3px rgba(0,0,0,0.06)` shadow|
| Primary accent    | `#4F7DF2` (medium blue)                                   |
| Secondary accent  | `#7C5CFC` (soft purple)                                   |
| Success/active    | `#34B87A` (fresh green)                                   |
| Warning           | `#F5A623` (warm amber)                                    |
| Error             | `#E5484D` (clear red)                                     |
| Cost indicators   | `#6B7280` (muted grey, non-alarming)                      |
| Free badge        | `#34B87A` background, white text                          |
| Text primary      | `#1A1D23`                                                 |
| Text secondary    | `#6B7280`                                                 |
| Font              | Inter (system fallback: -apple-system, sans-serif)        |
| Border radius     | `12px` on cards, `8px` on buttons, `6px` on inputs        |
| Iconography       | Lucide icons, stroke-width 1.5                            |
| Dark mode         | **Not included.** Light only.                             |

Overall feel: clean, airy, and confident. Generous whitespace. Soft shadows. Subtle hover transitions. Think Linear or Notion in their lightest mode — but warmer.

### 6.2 Navigation Structure

Persistent left sidebar (240px wide, light background), Agora wordmark + logo at top:

1. **Dashboard** (home icon) — landing page, quick actions
2. **Councils** (users icon) — manage all councils
3. **Chamber** (message-circle icon) — run statements through councils
4. **Settings** (settings icon) — API key, model selection, usage stats

---

### 6.3 Screen-by-Screen Specification

---

#### 6.3.1 — Dashboard

**Purpose:** Landing page. Quick orientation and first-time setup prompt.

**Sections stacked vertically:**

**A) Welcome Banner**  
"Welcome to Agora" with tagline. If OpenRouter key is not set, show a prominent setup card: "Before you begin, add your OpenRouter API key in Settings. It takes 30 seconds." with a "Go to Settings" button.

**B) Quick Actions** — three large clickable cards:  
- "Run a Statement" → Chamber  
- "Browse Councils" → Councils  
- "Create a Council" → Council Editor  

**C) Recent Activity**  
Last 5 deliberations: statement preview, council name, cost, timestamp. Clickable to reopen in Chamber.

**D) Spend Summary** (small card, bottom-right area)  
"You've spent $X.XX across Y deliberations" — links to Settings → Usage.

---

#### 6.3.2 — Settings

**Layout:** Single-column form, centered card (max-width 640px).

**Section A: OpenRouter API Key**  
- Label: "Your OpenRouter API Key"
- Helper text: "Get your key at openrouter.ai/keys — this is how Agora connects to AI models. Your key stays on your computer and is never sent anywhere except OpenRouter."
- Password input with show/hide toggle
- "Save Key" button → on save, test call to `/api/v1/models`. If fails: "This key doesn't seem to work." If succeeds: green checkmark + "Key saved. X models available."

**Section B: Default AI Model**  
- The model picker component (see Section 5.2)
- Helper text: "This model is used for all councillors unless you set an override. More capable models give better results but cost more."
- Default: `openai/gpt-4o`

**Section C: Usage & Costs**  
- Total spend (all time)
- Number of deliberations
- Average cost per deliberation
- "Most expensive deliberation" and "cheapest deliberation" stats
- A table of recent deliberations with: date, council, model used, token count, cost
- OpenRouter credit balance (fetched via OpenRouter API if available)

**Section D: About**  
- Agora version
- Engine version (neuro-san version)
- "Agora is powered by Neuro SAN, an open-source multi-agent framework by Cognizant AI Lab." with link
- Link to GitHub repo
- Credits / license

---

#### 6.3.3 — Councils

**Layout:** Page title "Your Councils" + "Create New Council" button (primary). Below: grid of council cards (2-3 columns).

**Council Card:**
- Council name (bold, 18px)
- Description (2 lines, muted)
- Councillor count (e.g., "5 councillors")
- Active/Inactive toggle (pill-shaped, green when active)
- Badge: "Default" (muted) or "Custom"
- Model indicator: small text showing which model it uses (e.g., "GPT-4o" or "Mixed")
- Actions: "Duplicate" button (always), "Edit" button (custom only)

**Rules:**
- Default councils (4 built-in): CANNOT be edited or deleted. Can be duplicated or toggled active/inactive.
- Custom councils (user-created or duplicated): Can be edited, duplicated, activated/deactivated. CANNOT be deleted.
- Duplicating a default council creates a copy named "[Name] (Copy)" and opens the editor.

---

#### 6.3.4 — Council Editor (Create / Edit)

**Layout:** Two-column. Left (60%): metadata + councillor list. Right (40%): live preview.

**Council Metadata:**
- Council Name (text input, max 60 chars)
- Description (textarea, max 300 chars)
- Icon (pick from ~20 Lucide icons)

**Councillor List:**
Expandable cards. Collapsed: name + role summary. Expanded fields:

- **Name** (e.g., "The Sceptic")
- **Role Description** (textarea — what this councillor does, how they think)
- **Expertise Area** (text input)
- **Perspective Bias** (dropdown: Supportive, Neutral, Critical, Contrarian)
- **Model Override** (optional — the full model picker with pricing, defaults to "Use default model")
  - When a model override is set, show the per-million-token price beneath the dropdown
  - This lets users mix cheap models for simple councillors and expensive ones for critical analysis

"+ Add Councillor" button. Min 2, max 10. Drag-and-drop reorder.

**Right-column Preview:**
Visual mini-council: circular avatar initials in a semi-circle. Also shows an **estimated cost indicator**: "Estimated cost per deliberation: ~$0.02–$0.05" calculated from the number of councillors × average token estimate × model pricing. This is a rough estimate, clearly labelled as such.

**Save:** Validates → generates HOCON via engine → registers in manifest → success toast.

---

#### 6.3.5 — Chamber

**Purpose:** The deliberation room.

**Layout:**  
Top bar: "The Chamber" + council selector dropdown (only active councils). Below: deliberation feed. Input area sticky at bottom.

**Input Area:**
- Large textarea (4 lines, expandable): "Enter your statement, idea, or question..."
- "Submit to Council" button (primary, prominent)
- Subtle text: "Currently consulting: [Council Name] · [X] councillors · Est. cost: ~$0.03"
- The estimated cost updates live based on statement length × councillor count × model pricing

**Deliberation Flow (after submission):**

1. **User's Statement** — card with blue left-border

2. **Individual Councillor Responses** — each appears as a card with:
   - Councillor name (bold) + role tag (muted)
   - Response text
   - Stance dot: green (supportive), amber (mixed), red (critical)
   - Bottom-right: cost for this councillor's response, e.g., `$0.004 · 820 tokens`
   - Responses appear sequentially with staggered animation

3. **Verdict Card** — visually distinct (slightly larger, soft gradient border):
   - "Council Verdict" heading
   - Synthesised summary
   - Key agreements and disagreements
   - Clear recommendation
   - Confidence indicator (Low / Medium / High)
   - **Deliberation Summary Bar** at the bottom of the verdict card:
     ```
     ┌─────────────────────────────────────────────────────┐
     │  💰 Total: $0.024  ·  📊 14,200 tokens  ·  ⏱ 12s   │
     │  Model: GPT-4o  ·  5 councillors responded          │
     └─────────────────────────────────────────────────────┘
     ```
     If councillors used mixed models, show: "Models: GPT-4o (3), Claude Haiku (2)"

**Session History:**  
Collapsible sidebar (right) or tab. Each entry: statement preview + council name + cost + timestamp. Clickable to reload full deliberation.

**Multi-Council Mode:**  
Council selector allows multiple selections (checkboxes). Statement runs through each independently. Results in tabs — one per council. Each tab has its own cost summary. A combined total appears at the top.

---

## 7. Default Councils

Four built-in, read-only councils. HOCON templates in `/defaults/`.

### 7.1 General Council

A well-rounded panel for everyday questions, decisions, and general thinking.

| Councillor     | Role                                                                    | Perspective |
|----------------|-------------------------------------------------------------------------|-------------|
| The Analyst    | Breaks down the statement logically. Identifies assumptions and gaps.    | Neutral     |
| The Optimist   | Looks for opportunities, strengths, and positive outcomes.              | Supportive  |
| The Sceptic    | Challenges claims. Asks "what could go wrong?" Stress-tests reasoning.  | Critical    |
| The Pragmatist | Focuses on feasibility, next steps, and real-world implementation.      | Neutral     |
| The Ethicist   | Considers moral implications, fairness, and who might be affected.      | Neutral     |

**Coordinator:** Collects all perspectives, identifies agreements/disagreements, synthesises a balanced verdict.

### 7.2 Idea Validator

Stress-test a business idea, project concept, or creative proposal.

| Councillor         | Role                                                              | Perspective |
|--------------------|-------------------------------------------------------------------|-------------|
| Market Analyst     | Evaluates demand, audience, competition, timing.                  | Neutral     |
| Financial Advisor  | Assesses cost, revenue potential, financial viability.            | Critical    |
| User Advocate      | Would real people want/use/pay for this?                         | Neutral     |
| Technical Assessor | Is it technically feasible with current technology?              | Neutral     |
| Devil's Advocate   | Actively tries to break the idea. Finds the fatal flaw.          | Contrarian  |

**Coordinator:** Clear viability verdict with caveats and prioritised next steps. Encouraging but honest.

### 7.3 Social Impact Assessor

Evaluate a policy, initiative, or action for social and community impact.

| Councillor             | Role                                                               | Perspective |
|------------------------|--------------------------------------------------------------------|-------------|
| Community Voice        | Who benefits? Who is left out? Who could be harmed?                | Neutral     |
| Equity Analyst         | Equity, inclusion, accessibility, and justice lenses.              | Neutral     |
| Environmental Reviewer | Environmental and sustainability implications.                     | Neutral     |
| Economic Impact Analyst| Jobs, local economy, cost of living, inequality.                   | Neutral     |
| Systems Thinker        | Second/third-order effects. Unintended consequences.              | Critical    |

**Coordinator:** Impact assessment in plain language. Who benefits, who's at risk, mitigations.

### 7.4 Symptom Checker

Help a user think through health symptoms. **NOT a diagnostic tool.**

| Councillor              | Role                                                                       | Perspective |
|-------------------------|----------------------------------------------------------------------------|-------------|
| General Practitioner    | Broad medical perspective on possible causes.                              | Neutral     |
| Mental Health Counsellor| Psychological, emotional, stress-related factors.                          | Supportive  |
| Lifestyle Advisor       | Diet, sleep, exercise, substance use, habits.                             | Neutral     |
| Triage Nurse            | Urgency assessment. See a doctor? A&E? Monitor?                           | Critical    |

**Coordinator:** Always begins with: "This is not medical advice. Always consult a qualified healthcare professional." Then synthesises a calm summary of possible explanations, urgency, and next steps.

**Safety Rules (enforced in HOCON system prompt):**  
Never diagnose. Never prescribe medication. Never discourage seeing a doctor. If emergency symptoms described (chest pain, breathing difficulty, suicidal thoughts), immediately advise calling emergency services.

---

## 8. Council Management Rules

| Action              | Default Councils | Custom Councils |
|---------------------|------------------|-----------------|
| View                | ✅               | ✅              |
| Use in Chamber      | ✅ (if active)   | ✅ (if active)  |
| Edit                | ❌               | ✅              |
| Duplicate           | ✅               | ✅              |
| Delete              | ❌               | ❌              |
| Activate/Deactivate | ✅               | ✅              |

No-delete rationale: target user is non-technical. Accidental deletion = frustration. Deactivate instead. Future: add "Archive" to fully hide.

---

## 9. Installation & First Run

### 9.1 Prerequisites

- Python 3.12 or 3.13
- Git
- An OpenRouter API key (free tier at openrouter.ai)

### 9.2 Installation (3 steps in README)

```bash
# 1. Download Agora
git clone https://github.com/<org>/agora.git
cd agora

# 2. Set up (one command)
python setup.py

# 3. Run
python run.py
```

`setup.py` handles: venv creation, dependency install (including neuro-san via `/engine/requirements.txt`), frontend asset verification, SQLite init, default council HOCON deployment, manifest generation.

`run.py` starts: neuro-san server (background), FastAPI backend (serves API + static frontend), opens browser to `http://localhost:8080`.

**One-command alternative:** `python -m agora` does setup (if needed) + run.

### 9.3 First Launch Experience

1. Browser opens to Dashboard
2. Dashboard shows setup prompt: "Add your OpenRouter API key to get started"
3. User goes to Settings, pastes key, saves
4. Key is validated against OpenRouter → model list loads
5. User returns to Dashboard → "You're ready! Run your first statement."

---

## 10. Data Model

### 10.1 Database Schema (SQLite)

```sql
CREATE TABLE settings (
    id INTEGER PRIMARY KEY DEFAULT 1,
    openrouter_key_encrypted TEXT,
    default_model TEXT DEFAULT 'openai/gpt-4o',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE councils (
    id TEXT PRIMARY KEY,                -- UUID
    name TEXT NOT NULL,
    description TEXT NOT NULL,
    icon TEXT DEFAULT 'users',          -- Lucide icon name
    is_default BOOLEAN DEFAULT FALSE,
    is_active BOOLEAN DEFAULT TRUE,
    source_council_id TEXT,             -- if duplicated, points to original
    hocon_file_path TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE councillors (
    id TEXT PRIMARY KEY,                -- UUID
    council_id TEXT NOT NULL REFERENCES councils(id),
    name TEXT NOT NULL,
    role_description TEXT NOT NULL,
    expertise_area TEXT,
    perspective TEXT DEFAULT 'neutral', -- supportive/neutral/critical/contrarian
    model_override TEXT,                -- null = use global default
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE sessions (
    id TEXT PRIMARY KEY,                -- UUID
    council_id TEXT NOT NULL REFERENCES councils(id),
    statement TEXT NOT NULL,
    verdict TEXT,
    confidence TEXT,                    -- low/medium/high
    status TEXT DEFAULT 'pending',      -- pending/in_progress/completed/error
    total_cost_usd REAL DEFAULT 0.0,   -- sum of all response costs
    total_tokens INTEGER DEFAULT 0,
    duration_seconds REAL,
    model_summary TEXT,                 -- e.g., "GPT-4o (3), Claude Haiku (2)"
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP
);

CREATE TABLE responses (
    id TEXT PRIMARY KEY,                -- UUID
    session_id TEXT NOT NULL REFERENCES sessions(id),
    councillor_id TEXT NOT NULL REFERENCES councillors(id),
    response_text TEXT,
    stance TEXT,                        -- supportive/mixed/critical
    model_used TEXT,                    -- actual model ID used
    prompt_tokens INTEGER DEFAULT 0,
    completion_tokens INTEGER DEFAULT 0,
    total_tokens INTEGER DEFAULT 0,
    cost_usd REAL DEFAULT 0.0,         -- from OpenRouter usage.cost
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Cached model list from OpenRouter (refreshed every 30 min)
CREATE TABLE cached_models (
    id TEXT PRIMARY KEY,                -- model ID e.g., "openai/gpt-4o"
    name TEXT,
    provider TEXT,                      -- extracted from ID prefix
    context_length INTEGER,
    pricing_prompt TEXT,                -- USD per token (string for precision)
    pricing_completion TEXT,
    pricing_image TEXT,
    pricing_request TEXT,
    supports_tools BOOLEAN DEFAULT TRUE,
    last_fetched TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

---

## 11. API Specification

### 11.1 Settings

| Method | Endpoint               | Description                              |
|--------|------------------------|------------------------------------------|
| GET    | `/api/settings`        | Get settings (key masked)                |
| PUT    | `/api/settings`        | Update settings                          |
| POST   | `/api/settings/test`   | Test OpenRouter key validity             |
| GET    | `/api/settings/usage`  | Aggregate cost/usage stats               |

### 11.2 Models (OpenRouter proxy)

| Method | Endpoint                    | Description                              |
|--------|-----------------------------|------------------------------------------|
| GET    | `/api/models`               | List tool-capable models with pricing    |
| GET    | `/api/models/refresh`       | Force-refresh from OpenRouter            |

### 11.3 Councils

| Method | Endpoint                       | Description                     |
|--------|--------------------------------|---------------------------------|
| GET    | `/api/councils`                | List all councils               |
| GET    | `/api/councils/:id`            | Council detail + councillors    |
| POST   | `/api/councils`                | Create new council              |
| PUT    | `/api/councils/:id`            | Update (custom only)            |
| POST   | `/api/councils/:id/duplicate`  | Duplicate a council             |
| PATCH  | `/api/councils/:id/toggle`     | Activate/deactivate             |

### 11.4 Chamber

| Method | Endpoint                           | Description                          |
|--------|------------------------------------|--------------------------------------|
| POST   | `/api/chamber/submit`              | Submit statement to council(s)       |
| GET    | `/api/chamber/sessions`            | List past sessions with costs        |
| GET    | `/api/chamber/sessions/:id`        | Full session with responses + costs  |
| GET    | `/api/chamber/sessions/:id/stream` | SSE stream for real-time responses   |

**SSE Event Types:**
- `councillor_start` — spinner for councillor card
- `councillor_response` — full response + `{ cost_usd, tokens, model_used }`
- `verdict` — final synthesis + total cost summary
- `error` — error details
- `complete` — session finished, final totals

---

## 12. Phase 2: Pre-Submission Coordinator

### 12.1 Concept

Before a statement enters full council deliberation, the Coordinator agent evaluates whether it contains enough detail for the councillors to give meaningful responses. If not, it returns clarifying questions to the user. This saves cost (no wasted councillor calls on vague statements) and improves output quality.

### 12.2 Flow

```
User submits statement
        │
        ▼
┌───────────────────────────────────────┐
│   Coordinator Agent (top-level)       │
│                                       │
│   Phase 2 instructions tell it to:    │
│   1. Evaluate statement completeness  │
│   2. DECIDE: call councillor tools    │
│      or respond directly with Qs      │
└───────────┬───────────────────────────┘
            │
            ├── LLM CALLS TOOLS ──► Councillors run → Verdict
            │   (statement is sufficient)
            │
            └── LLM RESPONDS DIRECTLY ──► Clarifying questions
                (statement needs more detail)    returned to user
                                                  │
                                          ┌───────▼────────┐
                                          │ User sees Qs    │
                                          │ Options:        │
                                          │ • Revise        │
                                          │ • Submit Anyway │
                                          └─────────────────┘
```

### 12.3 Technical Mechanism — No New Technology Required

This works entirely within neuro-san's existing capabilities. Here's how:

**In Phase 1**, every council's coordinator HOCON says (simplified):
```
"Always consult ALL councillors for every statement. Then synthesise a verdict."
```
The coordinator LLM receives the statement, calls all councillor tools, gets responses, and produces a verdict. It always makes tool calls.

**In Phase 2**, the coordinator's HOCON instructions change to:
```
"When you receive a statement, first evaluate whether it contains enough
context for each councillor to provide a meaningful response.

Check for:
- Specificity: Is the statement about something concrete, or is it vague?
- Context: Has the user provided relevant background?
- Scope: Is it clear what kind of feedback they want?
- Constraints: Are key parameters stated (audience, budget, timeline, etc.)?

IF the statement is SUFFICIENTLY DETAILED:
  → Proceed normally. Call all councillor tools and synthesise a verdict.

IF the statement is MISSING KEY DETAILS:
  → Do NOT call any councillor tools.
  → Instead, respond directly with:
    1. A brief acknowledgment of what you understood.
    2. A list of 2-4 specific clarifying questions.
    3. An explanation of why these details would improve the council's response.
  → Format your response as JSON:
    {"status": "needs_clarification", "questions": [...], "understood": "..."}
```

**The backend detection logic** is simple:

```python
# In session_client.py — after receiving coordinator response

response = await engine.submit_statement(council_id, statement)

if response.tool_calls_made:
    # Coordinator called councillor tools → full deliberation in progress
    # Stream councillor responses + verdict as normal
    yield SessionEvent(type="deliberation_started")
    
elif response.is_direct_response:
    # Coordinator responded without calling tools → pre-check failed
    # Parse the clarifying questions from the coordinator's response
    pre_check = parse_pre_check_response(response.content)
    yield SessionEvent(
        type="pre_check",
        questions=pre_check.questions,
        understood=pre_check.understood,
        cost=response.usage.cost  # even the pre-check has a small cost
    )
```

The key insight: neuro-san agents CHOOSE whether to call their tools. The coordinator is an LLM that has councillors registered as callable tools. By changing its instructions, we change its decision-making — without any code changes to neuro-san itself.

### 12.4 "Submit Anyway" Bypass — Using sly_data

When the user clicks "Submit Anyway" (skipping clarification), the backend re-submits the statement with a hidden flag via neuro-san's `sly_data` mechanism. `sly_data` is a data channel that passes information between agents without entering the LLM chat stream — perfect for control flags.

```python
# User clicked "Submit Anyway"
await engine.submit_statement(
    council_id=council_id,
    statement=original_statement,
    sly_data={"bypass_pre_check": True}
)
```

The coordinator's Phase 2 HOCON includes:
```
"If the sly_data contains bypass_pre_check=true, skip the completeness
evaluation and proceed directly to consulting all councillors, regardless
of how detailed the statement is."
```

Note: `sly_data` is a native neuro-san feature designed for exactly this kind of out-of-band signalling. It never touches the LLM — it's passed programmatically between agents.

### 12.5 "Revise & Resubmit" Flow

When the user revises their statement:

1. User sees clarifying questions in the Chamber UI
2. User types additional detail in the text area provided
3. User clicks "Revise & Resubmit"
4. Backend appends the original statement + the new detail into a combined statement:
   ```
   [Original statement]
   
   Additional context: [user's revision]
   ```
5. This combined statement is submitted fresh to the coordinator
6. The coordinator evaluates again — it may now be sufficient, or may ask further questions
7. The pre-check cost accumulates (shown to the user: "Pre-check: $0.002")

There is no limit on revision rounds, but in practice the coordinator should accept after 1-2 rounds. If a user submits the same vague statement three times, the coordinator should proceed anyway and note the gaps in the verdict.

### 12.6 Chamber UI for Pre-Check

When the coordinator returns clarifying questions, the Chamber displays a soft-yellow card between the user's statement and where councillor responses would normally appear:

```
┌─────────────────────────────────────────────────────────┐
│  💬  The council coordinator has a few questions         │
│      before deliberation begins:                         │
│                                                          │
│  The coordinator understood your statement as:           │
│  "[brief paraphrase from coordinator]"                   │
│                                                          │
│  To give you the best possible feedback, it would        │
│  help to know:                                           │
│                                                          │
│  1. Who is the target audience for this?                 │
│  2. What budget or resource constraints apply?           │
│  3. Is there a specific timeframe you're working with?   │
│                                                          │
│  ┌──────────────────────────────────────────────────┐   │
│  │ Add more detail here...                           │   │
│  │                                                    │   │
│  └──────────────────────────────────────────────────┘   │
│                                                          │
│  [  Revise & Resubmit  ]    [ Submit Anyway ]           │
│       (primary)                (secondary/outline)       │
│                                                          │
│  Pre-check cost: $0.001                                  │
└─────────────────────────────────────────────────────────┘
```

### 12.7 Per-Council Completeness Rubrics

Each default council can have a tailored rubric in its coordinator instructions. Examples:

**Idea Validator coordinator** checks for:
- What the idea actually is (product? service? content?)
- Who it's for (target audience)
- How it makes money or creates value (revenue model)
- What stage it's at (napkin sketch? prototype? launched?)

**Social Impact Assessor coordinator** checks for:
- What initiative or policy is being assessed
- Who is implementing it and where
- What scale (local/regional/national/global)
- What communities are affected

**Symptom Checker coordinator** checks for:
- What symptoms are being experienced
- How long they've been present
- Whether they're getting better, worse, or stable
- Any relevant medical history mentioned

**General Council** has the lightest rubric — almost anything is specific enough because the council is designed for broad questions.

### 12.8 Cost Implications

The pre-check is a single LLM call (coordinator evaluating the statement — no councillor tools called). Typical cost: $0.001–$0.005 depending on model. This is much cheaper than a full deliberation ($0.02–$0.10+), so the pre-check saves money when it catches vague statements early.

Total cost accounting:
- Pre-check call(s): tracked and displayed separately
- Full deliberation: tracked per-councillor + verdict as in Phase 1
- Session total = sum of all pre-check calls + full deliberation

---

## 13. Project Structure

```
agora/
├── README.md                    # Non-technical install & usage guide
├── LICENSE                      # MIT
├── setup.py                     # One-command setup
├── run.py                       # One-command run
├── requirements.txt             # Top-level deps (FastAPI, etc.)
│
├── backend/
│   ├── __init__.py
│   ├── main.py
│   ├── api/
│   │   ├── settings.py
│   │   ├── models.py            # OpenRouter model/pricing proxy
│   │   ├── councils.py
│   │   └── chamber.py
│   ├── models/                  # Pydantic schemas
│   │   ├── council.py
│   │   ├── session.py
│   │   ├── settings.py
│   │   └── openrouter.py        # Model/pricing schemas
│   ├── services/
│   │   ├── council_service.py
│   │   ├── chamber_service.py
│   │   ├── model_service.py     # OpenRouter model cache + pricing
│   │   ├── cost_tracker.py      # Aggregates costs across sessions
│   │   └── settings_service.py
│   └── database.py
│
├── engine/                      # ══ ISOLATED NEURO-SAN MODULE ══
│   ├── __init__.py              # Exposes AgoraEngine only
│   ├── interface.py             # Public contract (see Section 4.3)
│   ├── requirements.txt         # neuro-san==0.2.5 (pinned)
│   ├── VERSION                  # "0.2.5"
│   ├── config_generator.py      # Council → HOCON
│   ├── manifest_manager.py      # manifest.hocon management
│   ├── server_manager.py        # neuro-san server lifecycle
│   ├── session_client.py        # Statement → responses
│   ├── openrouter_adapter.py    # OpenRouter llm_config injection
│   ├── UPGRADE.md               # How to update neuro-san
│   └── tests/
│       ├── test_config_generator.py
│       ├── test_session_client.py
│       └── test_interface_contract.py
│
├── frontend/
│   ├── package.json
│   ├── src/
│   │   ├── App.jsx
│   │   ├── pages/
│   │   │   ├── Dashboard.jsx
│   │   │   ├── Settings.jsx
│   │   │   ├── Councils.jsx
│   │   │   ├── CouncilEditor.jsx
│   │   │   └── Chamber.jsx
│   │   ├── components/
│   │   │   ├── Sidebar.jsx
│   │   │   ├── CouncilCard.jsx
│   │   │   ├── CouncillorCard.jsx
│   │   │   ├── ModelPicker.jsx      # Reusable model selector w/ pricing
│   │   │   ├── CostBadge.jsx        # Small cost display component
│   │   │   ├── DeliberationFeed.jsx
│   │   │   ├── VerdictCard.jsx
│   │   │   ├── CostSummaryBar.jsx   # Bottom bar on verdict
│   │   │   └── UsageStats.jsx       # Settings usage section
│   │   └── styles/
│   │       └── tailwind.config.js
│   ├── dist/                    # Pre-built (committed to repo)
│   └── README.md
│
├── defaults/                    # Read-only default council templates
│   ├── general_council.hocon
│   ├── idea_validator.hocon
│   ├── social_impact_assessor.hocon
│   └── symptom_checker.hocon
│
├── registries/                  # Generated at runtime
│   ├── manifest.hocon
│   └── user/                    # User-created HOCONs
│
├── data/
│   └── agora.db                 # SQLite (created at runtime)
│
└── tests/
    ├── test_engine/             # Engine interface tests
    ├── test_api/
    └── test_councils/
```

---

## 14. Non-Functional Requirements

### 14.1 Performance
- App overhead < 200ms. Deliberation latency depends on model choice.
- SSE streaming so councillor responses appear as they arrive.
- Model list cached locally (30-min TTL) to avoid repeated API calls.

### 14.2 Security
- OpenRouter key encrypted at rest (Fernet, machine-derived key).
- No telemetry, no analytics, no phone-home. Data stays local.
- Symptom Checker has mandatory safety disclaimers in HOCON system prompt.

### 14.3 Accessibility
- Full keyboard navigation
- Colour never the sole state indicator (always paired with text/icons)
- 4.5:1 minimum contrast ratio

### 14.4 Platform Support
- Windows 10+, macOS 12+, Linux (Ubuntu 22.04+)
- Python 3.12 or 3.13
- Chrome, Firefox, Safari, Edge (latest)

---

## 15. Development Phases

### Phase 1 (MVP)
- Settings: OpenRouter key, model picker with live pricing, usage stats
- Four default councils (read-only HOCONs)
- Council management: view, duplicate, activate/deactivate, create custom
- Council editor with per-councillor model override + pricing display
- Chamber: submit, streaming councillor responses, verdict, cost per response + total
- Session history with cost column
- Full engine module with OpenRouter integration
- One-command install/run
- Non-technical README

### Phase 2
- Pre-submission coordinator (completeness check)
- Multi-council mode (compare across councils)
- Enhanced session history: search, filter, export (PDF/Markdown)
- Daily/weekly spend chart in Settings
- Cost estimation before submission (refined, based on past averages)

### Future
- Importable/exportable council JSON files
- Community council library
- Archive (soft delete) for councils
- Local model support via Ollama
- OpenRouter credit balance display in Settings

---

## 16. Glossary (User-Facing Terms)

| User-Facing Term | Internal Equivalent                |
|-------------------|------------------------------------|
| Agora             | The application                    |
| Council           | Agent Network (neuro-san)          |
| Councillor        | Agent / Tool (neuro-san)           |
| Chamber           | Deliberation session runner        |
| Statement         | User input / prompt                |
| Verdict           | Coordinator synthesis              |
| Deliberation      | Session / agent network execution  |
| Active / Inactive | Registered / unregistered          |
| OpenRouter Key    | `OPENROUTER_API_KEY`               |
| Engine            | `/engine/` module (neuro-san)      |

---

## 17. Open Questions for Developer

1. **neuro-san server lifecycle:** Recommend long-lived process started with `run.py`, stopped on exit. Per-deliberation spin-up is too slow.

2. **HOCON hot-reload:** When a user edits a council, does neuro-san need a restart? The engine module should handle reload signalling.

3. **OpenRouter cost field reliability:** The `usage.cost` field should be present on all completions, but verify across providers. Fallback calculation from token counts × cached pricing is the backup.

4. **Model picker filtering edge cases:** Some models may claim `tools` support but perform poorly at it. Consider a "recommended" badge on models known to work well (GPT-4o, Claude Sonnet, etc.) and a "may underperform" warning on others.

5. **Frontend build:** Committed pre-built `dist/` means no Node.js for users. But developers need Node for frontend changes. Document this clearly.

---

## 18. Open Source & Repository Hygiene

### 18.1 Files That MUST Be Committed

```
agora/
├── README.md
├── LICENSE                          # MIT license text
├── CONTRIBUTING.md                  # How to contribute
├── CODE_OF_CONDUCT.md               # Community standards
├── .gitignore                       # See 18.2
├── .env.example                     # See 18.3 — template, NO real keys
├── setup.py
├── run.py
├── requirements.txt
├── backend/                         # All source code
├── engine/                          # All source code + requirements.txt
├── frontend/src/                    # All source code
├── frontend/dist/                   # Pre-built static assets (see 18.5)
├── frontend/package.json
├── defaults/                        # Default council HOCON files
└── tests/                           # All test files
```

### 18.2 .gitignore — Files That MUST NEVER Be Committed

```gitignore
# ===== SECRETS — NEVER COMMIT =====
.env
*.key
*.pem

# ===== Runtime data =====
data/agora.db
data/agora.db-journal
data/agora.db-wal

# ===== Generated neuro-san files =====
registries/manifest.hocon
registries/user/

# ===== Python =====
__pycache__/
*.py[cod]
*$py.class
*.egg-info/
dist/
build/
*.egg
venv/
.venv/
env/

# ===== Logs =====
logs/
*.log

# ===== Node (frontend development only) =====
frontend/node_modules/

# ===== IDE =====
.vscode/
.idea/
*.swp
*.swo
.DS_Store
Thumbs.db

# ===== OS =====
*.tmp
*.bak
```

**Critical rule:** The `.env` file contains the user's OpenRouter API key. It must NEVER be committed. The `.env.example` file (with placeholder values) IS committed as a template.

### 18.3 Environment Variables — .env.example

This file is committed to the repo as a template. Users copy it to `.env` and fill in their values. The `setup.py` script prompts the user to do this if `.env` doesn't exist.

```bash
# .env.example — Copy this file to .env and fill in your values
# DO NOT commit your .env file to version control

# =============================================================================
# REQUIRED
# =============================================================================

# Your OpenRouter API key (get one at https://openrouter.ai/keys)
OPENROUTER_API_KEY=

# =============================================================================
# OPTIONAL — defaults are fine for most users
# =============================================================================

# Default AI model (must support tool calling)
AGORA_DEFAULT_MODEL=openai/gpt-4o

# Server configuration
AGORA_HOST=127.0.0.1
AGORA_PORT=8080

# Logging level (DEBUG, INFO, WARNING, ERROR)
AGORA_LOG_LEVEL=INFO

# =============================================================================
# ADVANCED — only change if you know what you're doing
# =============================================================================

# Neuro-SAN server port (used internally, no need to change)
NEUROSAN_PORT=8888

# Database path
AGORA_DB_PATH=data/agora.db

# Path to default council HOCON files
AGORA_DEFAULTS_PATH=defaults/

# Path to generated registries
AGORA_REGISTRIES_PATH=registries/
```

### 18.4 Dual Secret Storage Strategy

The OpenRouter API key has TWO entry points — this is intentional:

1. **`.env` file** — Used by the engine module to set `OPENROUTER_API_KEY` as an environment variable when starting the neuro-san server. This is how neuro-san reads it (via `${OPENROUTER_API_KEY}` in HOCON files).

2. **SQLite database (encrypted)** — Used by Agora's backend for direct OpenRouter API calls (model listing, Gatekeeper in Phase 2). Encrypted at rest using Fernet.

The Settings UI writes to BOTH locations when the user saves their key. The `.env` file is the source of truth on startup; the database is updated to match.

### 18.5 Pre-Built Frontend Assets

The `frontend/dist/` directory IS committed to the repo. This is a deliberate decision:

**Why:** The target user is non-technical. Requiring Node.js, npm, and a build step would be a barrier. By committing pre-built assets, users only need Python.

**Trade-off:** The repo is slightly larger (~2-5MB for static assets). This is acceptable for the target audience.

**Developer workflow:** Contributors working on the frontend must have Node.js 18+ installed. After making frontend changes, they run `npm run build` in the `frontend/` directory and commit the updated `dist/`. The `CONTRIBUTING.md` must document this clearly.

### 18.6 LICENSE

MIT License. Full text in `LICENSE` file at repo root. The MIT license is chosen because it is maximally permissive and well-understood, matching the open-source ethos of the project.

### 18.7 Credits and Attribution

The README and the Settings → About screen must include:

```
Agora is powered by Neuro SAN (https://github.com/cognizant-ai-lab/neuro-san),
an open-source multi-agent orchestration framework by Cognizant AI Lab,
licensed under Apache-2.0.

LLM access is provided via OpenRouter (https://openrouter.ai).
```

The Neuro SAN Apache-2.0 license requires attribution — this satisfies that requirement.

---

## 19. Error Handling Strategy

### 19.1 Error Categories and User-Facing Messages

The app must handle errors gracefully and show non-technical messages. The user should never see a stack trace, HTTP status code, or raw API error.

| Error Scenario | Internal Cause | User-Facing Message |
|---|---|---|
| No API key set | `OPENROUTER_API_KEY` is empty | "Please add your OpenRouter API key in Settings before running a deliberation." |
| Invalid API key | OpenRouter returns 401 | "Your OpenRouter API key doesn't seem to be working. Check it in Settings." |
| Insufficient credits | OpenRouter returns 402 | "Your OpenRouter account doesn't have enough credits. Top up at openrouter.ai." |
| Model unavailable | OpenRouter returns 404 on model | "The selected model is currently unavailable. Try a different model in Settings." |
| Rate limited | OpenRouter returns 429 | "Too many requests. Agora will retry automatically in a moment." |
| Neuro-san server won't start | Engine server_manager fails | "Agora's engine couldn't start. Try restarting with `python run.py`. If this persists, check the logs." |
| Neuro-san server crashes mid-deliberation | Connection lost during session | "Something went wrong during the deliberation. Your statement is saved — try submitting again." |
| Network offline | No internet connectivity | "Agora needs an internet connection to reach AI models. Please check your connection." |
| HOCON generation fails | Malformed council data | "There was a problem preparing this council. Please check the councillor settings and try again." |
| Database locked/corrupt | SQLite error | "Agora's data file has a problem. Try restarting. If this persists, delete `data/agora.db` and reconfigure in Settings." |

### 19.2 Retry Logic

For transient OpenRouter errors (429, 500, 502, 503), the backend should retry up to 3 times with exponential backoff (1s, 2s, 4s) before surfacing the error to the user. The SSE stream should send a `retry` event so the frontend can show a "Retrying..." indicator.

### 19.3 Partial Failure in Deliberations

If 4 out of 5 councillors respond but one fails, the deliberation should still complete. The verdict card notes: "Note: [Councillor Name] was unable to respond. This verdict is based on 4 of 5 councillors." The failed councillor's card shows a muted error state with a "Retry" button.

---

## 20. Logging

### 20.1 Log Files

```
logs/
├── agora.log             # Main application log (backend + API)
├── engine.log            # Neuro-san server output
└── gatekeeper.log        # Phase 2: Gatekeeper conversation logs
```

All logs are written to the `logs/` directory (gitignored). Log rotation: 10MB per file, keep last 5 files.

### 20.2 Log Levels

- **ERROR**: Failures that affect user experience (API errors, engine crashes)
- **WARNING**: Recoverable issues (retries, partial failures, slow responses)
- **INFO**: Normal operations (deliberation started, completed, cost recorded)
- **DEBUG**: Verbose detail (full API request/response bodies, HOCON generation output)

Default level is INFO. Configurable via `AGORA_LOG_LEVEL` in `.env`.

### 20.3 Sensitive Data in Logs

**NEVER log:**
- The full OpenRouter API key (mask to last 4 characters: `sk-...7f2a`)
- Full user statements in production logs (log a truncated preview: first 50 characters)
- Symptom Checker user input (health data is sensitive — log only "Symptom Checker session started/completed")

---

## 21. Testing Strategy

### 21.1 Test Structure

```
tests/
├── unit/
│   ├── test_council_service.py       # Council CRUD logic
│   ├── test_cost_tracker.py          # Cost calculation and aggregation
│   ├── test_model_service.py         # OpenRouter model cache/filtering
│   └── test_gatekeeper.py            # Phase 2: Gatekeeper logic
├── engine/
│   ├── test_config_generator.py      # Council → HOCON conversion
│   ├── test_openrouter_adapter.py    # OpenRouter config injection
│   └── test_interface_contract.py    # Verifies engine interface stability
├── integration/
│   ├── test_api_councils.py          # Council API endpoints
│   ├── test_api_chamber.py           # Chamber submit + session retrieval
│   ├── test_api_settings.py          # Settings CRUD
│   └── test_engine_roundtrip.py      # Statement → engine → response
└── conftest.py                       # Shared fixtures, mock OpenRouter
```

### 21.2 Running Tests

```bash
# All tests (unit only — no API key needed)
python -m pytest tests/unit/

# Integration tests (requires OPENROUTER_API_KEY in .env)
python -m pytest tests/integration/

# Engine interface contract tests
python -m pytest tests/engine/

# Everything
python -m pytest
```

### 21.3 Mocking

Unit tests must NEVER call the real OpenRouter API. Use a mock OpenRouter fixture that returns realistic response shapes with deterministic `usage.cost` values. Integration tests may call the real API (flagged with `@pytest.mark.integration` so they can be skipped in CI without an API key).

---

## 22. Configuration Reference

All configuration is via environment variables (loaded from `.env`). The user never needs to edit any config file except `.env` and even that is optional if they set the key via the UI.

| Variable | Required | Default | Description |
|---|---|---|---|
| `OPENROUTER_API_KEY` | Yes | — | OpenRouter API key |
| `AGORA_DEFAULT_MODEL` | No | `openai/gpt-4o` | Default LLM model ID |
| `AGORA_HOST` | No | `127.0.0.1` | Backend server bind address |
| `AGORA_PORT` | No | `8080` | Backend server port |
| `AGORA_LOG_LEVEL` | No | `INFO` | Logging verbosity |
| `NEUROSAN_PORT` | No | `8888` | Internal neuro-san server port |
| `AGORA_DB_PATH` | No | `data/agora.db` | SQLite database file path |
| `AGORA_DEFAULTS_PATH` | No | `defaults/` | Path to default council HOCONs |
| `AGORA_REGISTRIES_PATH` | No | `registries/` | Path for generated registries |

---

## 23. Graceful Startup and Shutdown

### 23.1 Startup Sequence (`run.py`)

```
1. Load .env file (python-dotenv)
2. Verify Python version (3.12+)
3. Check if setup has been run (venv exists, deps installed)
   → If not, prompt: "Run `python setup.py` first"
4. Initialise SQLite database (create tables if not exist)
5. Copy default council HOCONs to registries/ (if not already there)
6. Generate manifest.hocon from active councils
7. Start neuro-san server (background process on NEUROSAN_PORT)
8. Wait for neuro-san server health check (retry 5x, 2s interval)
   → If fails: "Engine failed to start. Check logs/engine.log"
9. Start FastAPI backend (serves API + frontend static files)
10. Open browser to http://{AGORA_HOST}:{AGORA_PORT}
11. Print: "Agora is running at http://127.0.0.1:8080"
```

### 23.2 Shutdown Sequence

On `Ctrl+C` or `SIGTERM`:

```
1. Stop accepting new deliberation requests
2. Wait for in-progress deliberations to complete (30s timeout)
3. Stop FastAPI server
4. Send SIGTERM to neuro-san server process
5. Wait for neuro-san to exit (10s timeout, then SIGKILL)
6. Close database connections
7. Print: "Agora stopped cleanly."
```

### 23.3 Crash Recovery

If the neuro-san server process dies unexpectedly during operation:
- The engine module's `server_manager.py` detects the process exit
- It attempts an automatic restart (up to 3 times within 5 minutes)
- If restart succeeds: log a warning, resume normal operation
- If restart fails: surface error to user via any active SSE streams, log an error, and show a "Restart Engine" button in the UI

---

## 24. Database Migrations

Phase 1 creates the database from scratch via `CREATE TABLE IF NOT EXISTS` statements in `database.py`. There is no migration framework needed for Phase 1.

For Phase 2 and beyond, when schema changes are required, use [Alembic](https://alembic.sqlalchemy.org/) (SQLAlchemy's migration tool). Migration files live in `backend/migrations/` and are committed to the repo. The `run.py` startup sequence runs pending migrations automatically.

---

## 25. CORS and Frontend-Backend Communication

The FastAPI backend serves the pre-built frontend static files from `frontend/dist/` at the root URL (`/`). All API endpoints are under `/api/`. Because frontend and backend are served from the same origin (`http://127.0.0.1:8080`), CORS is not needed in the default configuration.

If a developer runs the frontend dev server separately (e.g., `npm run dev` on port 5173), CORS must be enabled for `http://localhost:5173`. The backend should accept a `AGORA_CORS_ORIGINS` environment variable (comma-separated list) for this purpose, defaulting to empty (no CORS headers).

---

*End of specification.*
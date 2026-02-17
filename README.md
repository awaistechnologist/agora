# 🏛️ Agora

> Many voices. Better decisions.

Agora is a **neuro-symbolic council system** that leverages multiple LLM personas to deliberate on complex topics. It uses a structured debate format where specialized agents (Councillors) discuss a statement, critique each other, and reach a synthesized verdict.

## Features

-   **Multi-Agent Deliberation**: Different personas (e.g., Skeptic, Optimist, Analyst) argue from unique perspectives.
-   **OpenRouter Integration**: Access hundreds of LLMs (DeepSeek, Claude, GPT-4, etc.) via a single API.
-   **Local Privacy**: Custom council configurations and chat history are stored locally in SQLite (`data/agora.db`).
-   **Web Search**: Equip your council with real-time web search capabilities (requires OpenRouter models with online support).
-   **Cost Tracking**: Monitor token usage and costs per session.

## Getting Started

### Prerequisites

-   **Python 3.10+**
-   **Node.js 18+** (for building the frontend)
-   **OpenRouter API Key**: Get one at [openrouter.ai](https://openrouter.ai).

### Installation

1.  **Clone the repository**:
    ```bash
    git clone https://github.com/yourusername/agora.git
    cd agora
    ```

2.  **Run the installer**:
    ```bash
    ./install.sh
    ```
    This sets up a Python virtual environment, installs dependencies, and builds the React frontend.

3.  **Configure Environment**:
    Create a `.env` file in the root directory:
    ```bash
    echo "OPENROUTER_API_KEY=sk-or-v1-..." > .env
    ```

### Usage

Start the application:

```bash
./start.sh
```

Visit **http://localhost:8080** in your browser.

## Project Structure

-   `backend/`: Python FastAPI server and business logic.
-   `frontend/`: React + Vite application.
-   `engine/`: Core deliberation engine (agnostic of web framework).
-   `spec/`: HOCON specifications for default councils.
-   `data/`: Local SQLite database (gitignored).

## Contributing

We welcome contributions! Please see `CONTRIBUTING.md` for details.

## License

MIT © 2026 Agora Contributors

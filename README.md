<div align="center">

<br />

<h1>LOBASTERS</h1>

<p><strong>The open-source laboratory for autonomous intelligence.</strong></p>

<p>Collaborate with, evaluate, and evolve language models in purpose-built environments.<br />No cloud. No accounts. No telemetry. Just research.</p>

<br />

<p>
  <a href="#getting-started"><strong>Get Started</strong></a> ·
  <a href="#the-labs"><strong>The Labs</strong></a> ·
  <a href="#architecture"><strong>Architecture</strong></a> ·
  <a href="#contributing"><strong>Contributing</strong></a>
</p>

<br />

---

</div>

<br />

## Why Lobasters?

Most AI collaboration tools are locked behind paywalls, require cloud accounts, or send your data to third-party servers. Lobasters is different.

It's a **local-first, privacy-respecting model collaboration platform** where you bring your own API keys. Configuration and session state stay in your browser; model requests are relayed through Lobasters' serverless streaming endpoint to the provider you choose and are not persisted by Lobasters.

Built for researchers, engineers, and the deeply curious.

<br />

## The Labs

Lobasters ships with three purpose-built experimental environments:

### ⚔️ Arena

> **Status: Stable**

A structured adversarial debate engine. Pit two AI models against each other in multi-turn argumentation with custom tooling, thinking capture, and real-time streaming.

- Configurable personas, system prompts, and custom semantic tools
- Native reasoning capture (API fields, XML tags, or full systematic scan)
- Tool-use support with opponent visibility controls
- Automatic victory detection and session transcripts

### 🎓 Examination

> **Status: Beta**

A rigorous, automated evaluation framework. A benchmark "Teacher" model quizzes a candidate "Student" model across configurable knowledge domains, then grades performance on a customizable scale.

- Domain-specific question generation
- Multiple grading scales (S/A/B/F, A/B/F, A/F, S/A/F)
- Per-question evaluation with reasoning
- Exportable transcripts and PDF reports

### 🧪 LAB (LM-Zero)

> **Status: Experimental**

An autonomous agent sandbox. A "Master Agent" receives a challenge, then plans, reasons, and executes solutions using a virtual filesystem and subordinate helper agents — all without human intervention.

- Virtual filesystem (question bank, diary, scratchpad, etc.)
- Hierarchical multi-agent orchestration
- Full thought-chain observability

<br />

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) 18+ (or [pnpm](https://pnpm.io/) recommended)
- An API key from any OpenAI-compatible provider (OpenAI, Google Gemini, Groq, Together, local models via Ollama, etc.)

### Installation

```bash
# Clone the repository
git clone https://github.com/crimson-lord/lobasters.git
cd lobasters

# Install dependencies
pnpm install    # or: npm install

# Start the development server
pnpm dev        # or: npm run dev
```

Open [http://localhost:3000](http://localhost:3000) and enter your API keys directly in the browser. Lobasters does not persist them; they are sent only for the duration of a model request through the streaming relay to your selected provider.

### Production Build

```bash
pnpm build && pnpm start
```

<br />

## Architecture

```
lobasters/
├── src/
│   ├── app/
│   │   ├── debate/           # Arena — adversarial debate engine
│   │   │   ├── engine.ts     # Core debate loop with retry logic
│   │   │   ├── agent.ts      # Model communication layer
│   │   │   ├── parser.ts     # Multi-method reasoning extraction
│   │   │   └── types.ts      # Type definitions
│   │   ├── proving-ground/   # Examination — automated eval framework
│   │   │   ├── engine.ts     # Exam orchestration engine
│   │   │   ├── flows/        # Teacher/Student interaction flows
│   │   │   └── types.ts      # Type definitions
│   │   ├── lm0/              # LAB — autonomous agent sandbox
│   │   │   ├── engine.ts     # Agent loop with virtual FS
│   │   │   ├── manual.ts     # Agent operations manual
│   │   │   └── session/      # Live session UI
│   │   ├── dashboard/        # Mission control
│   │   ├── settings/         # Theme engine & background customization
│   │   └── page.tsx          # Landing page
│   ├── components/ui/        # Radix-based component library
│   └── lib/                  # Shared utilities
├── next.config.mjs
├── tailwind.config.ts
└── package.json
```

<br />

## Design Philosophy

| Principle | Implementation |
|---|---|
| **Local-first** | No accounts, database, or analytics; configuration and session state remain browser-local. |
| **Privacy by design** | API keys are not persisted by Lobasters; model requests are relayed only to the provider selected by the researcher. |
| **Model-agnostic** | Works with any OpenAI-compatible API endpoint. |
| **Observable** | Full reasoning capture, raw request/response inspection, thinking chain visibility. |
| **Resilient** | Automatic retry with exponential backoff. Sessions survive transient API failures. |

<br />

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | [Next.js 16](https://nextjs.org/) (App Router, Turbopack) |
| Language | TypeScript (strict mode) |
| UI Components | [Radix UI](https://www.radix-ui.com/) + [shadcn/ui](https://ui.shadcn.com/) |
| Styling | [Tailwind CSS](https://tailwindcss.com/) with 15+ custom themes |
| Animations | [Framer Motion](https://www.framer.com/motion/) |
| AI Integration | [OpenAI SDK](https://github.com/openai/openai-node) (compatible with any provider) |
| Export | [jsPDF](https://github.com/parallax/jsPDF) for report generation |

<br />

## Theming

Lobasters ships with a full theming engine featuring **15+ curated dark themes**, a glassmorphism transparency mode, and custom background support with zoom/position/blur controls.

Themes include: `Default`, `Ocean Breeze`, `Sunset`, `Nebula`, `Purple Haze`, `Emerald Water`, `Cosmic Fusion`, `Solar Flare`, `Aurora`, `Royal Gold`, `Crimson Night`, `Minty Fresh`, `Electric Violet`, `Fiery Coral`, `Deep Sea`, `Lavender Sky`.

All preferences are persisted in `localStorage` — no server required.

<br />

## API Compatibility

Lobasters works with **any provider that exposes an OpenAI-compatible chat completions endpoint**:

| Provider | Base URL | Notes |
|---|---|---|
| OpenAI | `https://api.openai.com/v1/` | GPT-4o, o1, etc. |
| Google Gemini | `https://generativelanguage.googleapis.com/v1beta/openai/` | Via OpenAI compatibility layer |
| Groq | `https://api.groq.com/openai/v1/` | Llama, Mixtral |
| Together AI | `https://api.together.xyz/v1/` | Open-source models |
| Ollama (local) | `http://localhost:11434/v1/` | Run models on your own hardware |
| Any OpenRouter | `https://openrouter.ai/api/v1/` | Unified gateway |

<br />

## Contributing

We welcome contributions of all kinds. Whether it's a bug fix, a new lab module, or a documentation improvement — we'd love to have you.

1. Fork the repository
2. Create your feature branch (`git checkout -b feat/amazing-feature`)
3. Commit your changes (`git commit -m 'feat: add amazing feature'`)
4. Push to the branch (`git push origin feat/amazing-feature`)
5. Open a Pull Request

<br />

## License

This project is open source and available under the [MIT License](LICENSE).

<br />

---

<div align="center">
<br />
<p><strong>Built for the machine. Operated by humans.</strong></p>
<p>
  <sub>Lobasters is an independent research project. Not affiliated with any AI provider.</sub>
</p>
<br />
</div>

# Data-Mind
Specialized multi-source intelligence analysis platform powered by Claude AI (Anthropic). Not a general-purpose chatbot — a structured analytical engine that produces deep, actionable intelligence reports.
 
Overview :
DataMind is a web-based analytics platform designed for analysts, strategists, executives, and researchers who need rigorous, structured intelligence — not generic AI responses.
It aggregates data from multiple sources (web, files, news, social media, databases, BI tools), cross-references them, and generates structured intelligence reports with executive summaries, deep insights, forecast scenarios, and prioritized recommendations.

✨ Key Features
🔌 Connector Registry

Auto-managed (zero config): Claude AI, Real-time Web Search, Document Parser, Multilingual Engine
Manual configuration: NewsAPI, Instagram, X/Twitter, LinkedIn, Google Drive, Dropbox, Snowflake, PostgreSQL, Power BI, Looker Studio

🔍 Web & Live Data Ingestion

Real-time web search powered by Anthropic's native search capability
Direct URL ingestion (articles, reports, public dashboards)
NewsAPI integration — 150,000+ global news sources
75+ pre-configured media outlets across 17 regions/countries (FR, UK, USA, DE, ES, IT, RU, CN, JP, KR, IN, ME, AF, LATAM, AU, CA, INT)
Social media connectors (Instagram, X/Twitter, LinkedIn)

📄 File Ingestion

Local file upload: CSV, Excel, PDF, PPTX, JSON, images, text
Cloud storage: Google Drive, Dropbox
Drag & drop interface

🔀 Cross-Source Analysis

Select and combine sources from multiple ingestion channels
Cross-reference heterogeneous data for deeper correlation analysis

🧠 Analytical Cockpit
Two analysis modes:

Guided mode — 7-step structured framework (Context, Objective, Scope, KPIs, Constraints, Prior Intel, Output Format) with AI synthesis engine that auto-generates an optimized prompt
Free input mode — unrestricted query input

Configurable parameters:

Analysis type (multi-select): Business, Geopolitical, Financial, Market, Technology, HR & Social, Strategic, Scientific
Time horizon (multi-select): Real-time, Short-term, Mid-term, Long-term, Multi-horizon
Depth (multi-select): Executive Brief, Standard, Deep Analysis, Full Research
Output mode: Structured Report / Direct Claude Response / Full Output (both)

📊 Intelligence Report
Structured output in 5 collapsible sections:

Executive Summary — numbered key findings, data-first
Insights & Signals — deep quantitative insights, weak signals, non-obvious correlations
Forecast Scenarios — Optimistic / Base / Pessimistic with probability % per horizon
Strategic Recommendations — prioritized [P1/P2/P3] with action, impact, timeline
Limits & Assumptions — methodological transparency


🛠 Tech Stack
LayerTechnologyFrontendReact (hooks)AI EngineAnthropic Claude Sonnet (claude-sonnet-4)Web SearchAnthropic native web search toolNewsNewsAPI.orgSocialMeta Graph API, Twitter API v2, LinkedIn APICloudGoogle Drive API, Dropbox API v2DatabaseSnowflake, PostgreSQLBIPower BI (Azure AD), Looker StudioStylingInline React styles (no CSS framework)

🚀 Getting Started
Prerequisites

Node.js 18+
Anthropic API key
Optional: API keys for external connectors (NewsAPI, Meta, Twitter, etc.)

Installation
bashgit clone https://github.com/your-username/datamind.git
cd datamind
npm install
Environment Variables
envREACT_APP_ANTHROPIC_API_KEY=your_anthropic_api_key

⚠️ All other connector credentials (NewsAPI, social tokens, DB connections) are entered directly in the app UI and stored locally in the browser session — they are never transmitted to any server other than the respective APIs.

Run
bashnpm start

📁 Project Structure
datamind/
├── src/
│   ├── App.jsx                  # Main application
│   ├── components/
│   │   ├── ConnectorCard.jsx    # Manual connector configuration
│   │   ├── CockpitPanel.jsx     # Analytical cockpit + guided framework
│   │   ├── WebLivePanel.jsx     # Web & live data ingestion
│   │   ├── MediaOutletsCard.jsx # 75+ pre-configured media outlets
│   │   ├── ColSection.jsx       # Collapsible section component
│   │   ├── SectionBlock.jsx     # Report section block
│   │   └── SourceRow.jsx        # Data source row
│   ├── constants/
│   │   ├── connectors.js        # Connector registry
│   │   ├── outlets.js           # Media outlets list
│   │   └── analysis.js          # Analysis types, horizons, depths
│   └── styles/
│       └── theme.js             # Design tokens
├── public/
└── README.md

🗺️ Roadmap
v1.0 — Current (MVP)

 Multi-tab source ingestion
 75+ media outlets pre-configured
 Guided + free input cockpit
 Structured 5-section intelligence report
 Direct Claude response mode
 Connector registry (auto + manual)

v1.1 — Next

 Export report to PDF / PPTX
 Save & history of past analyses
 Chart and data visualization in reports
 Recurring / scheduled analysis (cron)

v2.0 — Planned

 "Ana" — embedded automation chatbot for live monitoring
 Real-time alerts on weak signal detection
 Memory of past analyses for trend comparison
 Public API for third-party integration
 Team collaboration features


🌍 Multilingual Support
DataMind supports analysis and report generation in:

🇫🇷 French
🇬🇧 English
🇸🇦 Arabic
🇪🇸 Spanish
🇨🇳 Chinese


🔐 Security & Privacy

All connector credentials are stored locally in the browser session only
No credentials are stored server-side or transmitted to DataMind infrastructure
All API calls go directly from the client to the respective provider APIs
Anthropic API calls follow Anthropic's standard privacy policy


🤝 Contributing
Pull requests are welcome. For major changes, please open an issue first to discuss what you would like to change.
bashgit checkout -b feature/your-feature
git commit -m "feat: your feature description"
git push origin feature/your-feature

📄 License
MIT License — see LICENSE for details.

👤 Author
Built with ❤️ using Claude AI (Anthropic).


DataMind is not a general-purpose AI tool. It is a specialized intelligence platform designed to produce analyst-grade reports — structured, sourced, and actionable.

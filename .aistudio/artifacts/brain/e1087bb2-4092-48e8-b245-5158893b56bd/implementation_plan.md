# Sidekick Scientific Intelligence Co-Pilot Integration Plan

Integrate Google AI Studio's scientific database skills into Sidekick as an on-demand, non-disruptive biomedical and literature intelligence module that augments Sidekick's core zero-trust browser companion without replacing its general-purpose automation.

### User Review & Critical Decisions

> [!IMPORTANT]
> **Fit vs. Divergence Evaluation**:
> - **Does it fit?** **Yes.** Sidekick's core identity is zero-trust grounded evidence, click-to-locate page citations, and browser-assisted research. Integrating scientific skills extends Sidekick into an elite research companion for biomedical papers, preprint reading, drug discovery reconnaissance, and structural biology verification.
> - **Is it a different direction?** Only if implemented as a replacement. If Sidekick were transformed solely into a wet-lab workbench, it would lose its general browser automation powers. Therefore, the recommended architecture treats Scientific Skills as a **specialized co-pilot capability and slash-command tier** (`/science`, `/paper`, `/protein`, `/compound`) that seamlessly activates when users browse scientific pages or ask research questions, preserving 100% of Sidekick's existing features.

- **Confirmed Direction**: User asked whether scientific skills fit Sidekick or represent an entirely different direction. The plan establishes a dual-mode coexistence architecture where scientific intelligence is an on-demand expansion module.
- **Scope Choice (Recommended)**: Multi-domain public API integration (PubMed/Europe PMC literature, UniProt/AlphaFold structural biology, PubChem/ChEMBL chemistry, ClinVar genomics) through lightweight side-panel cards with authoritative citations.

---

### 1. Overview & Core Concept

- **What It Does**: Enhances Sidekick with real-time scientific grounding and entity resolution. When reading journal articles, preprints (bioRxiv, arXiv, PubMed), or news, Sidekick automatically detects or responds to queries regarding genes, proteins, chemical compounds, and clinical trials. It fetches authoritative data directly from public repositories (UniProt, AlphaFold DB, RCSB PDB, PubChem, Europe PMC, ClinVar) and displays verifiable, citation-backed summary cards inside Sidekick's side panel.
- **Target Audience / Persona**: Researchers, students, clinicians, biotech engineers, and curious knowledge workers who browse complex scientific literature on the web and require instant fact-checking, structural confidence metrics, and unambiguous accession links.
- **Key Value**: Eliminates LLM hallucinations when reading scientific literature by grounding queries against authoritative primary databases, while providing one-click deep links and inline structural/pharmacological metadata.

---

### 2. User Experience & Visual Design

- **Key User Flows**:
  1. *Scientific Reading Flow*: User opens a paper on PubMed or bioRxiv -> Sidekick's passive parser highlights scientific entities (`TP53`, `Imatinib`, `rs429358`) -> Clicking an entity or typing `/protein TP53` opens an instant Scientific Intelligence Card in Sidekick with function, sequence length, AlphaFold pLDDT confidence tier, and PDB structures.
  2. *Literature Fact-Check Flow*: User selects a controversial claim in a research article -> Sidekick executes a Europe PMC / PubMed citation lookup -> Sidekick confirms or challenges the claim with verified PMID citations and open-access PDF links.
  3. *Chemical & Safety Recon Flow*: User inspects a chemical compound -> Sidekick queries PubChem and openFDA -> Displays 2D structure preview, IUPAC name, molecular weight, Lipinski rule-of-five compliance, and FDA black-box warnings.
  4. *General Browsing Coexistence*: When on standard web pages (GitHub, Amazon, Docs), Sidekick functions exactly as before with JIT CDP automation, DOM navigation, and anti-sludge shields.

- **Visual Identity & Theme**:
  - *Aesthetic Direction*: Publication-grade scientific workbench styling integrated cleanly into Sidekick's minimalist Geist mono/sans dark-and-light UI.
  - *Color Palette & Tokens*:
    - Backgrounds: Crisp `#F8FAFC` (light) / `#0A0E17` (dark) side-panel surface.
    - Scientific Accent: Google DeepMind Scientific Blue (`#1A73E8` / `#0B57D0`) and Teal (`#0D9488`).
    - AlphaFold Confidence Scales: Canonical 4-tier pLDDT palette: Very High (>90, `#0053D6`), Confident (70-90, `#65CBF3`), Low (50-70, `#FFDB13`), Very Low (<50, `#FF7D45`).
    - Pathogenicity Badges: Semantic crimson (`#DC2626` Pathogenic), amber (`#D97706` VUS), and emerald (`#059669` Benign).
  - *Typography*: Monospace font (`GeistMono`) for accessions, PDB IDs, SMILES, genomic coordinates, and IC50 metrics; sans-serif (`Geist`) for abstracts and explanatory summaries.
  - *Card Layout*: Compact multi-tier cards featuring verified provenance badges (`[Experimentally determined]`, `[AlphaFold v6 Predicted]`, `[PubMed Curated]`) and external source link-outs.

- **Interactive Feedback & Motion**:
  - Entity chip popovers with subtle fade/slide-up animation (<150ms).
  - Synchronized page highlighting: clicking a card citation scrolls the browser viewport directly to the matching sentence on the active webpage.

---

### 3. Key Product Decisions & Trade-Offs

- **Decision 1: Modular Co-Pilot vs. Full Application Pivot**
  - *Chosen Approach*: Add Scientific Skills as a specialized Worker & Slash Command tier (`Reading & Scientific Research`) rather than rebuilding Sidekick into a dedicated lab tool.
  - *Why*: Sidekick is already an advanced browser companion with tab automation and security defenses. Retaining these while adding scientific grounding gives users a superpower without losing general utility.
  - *Alternatives Considered*: Creating a separate standalone science app. Rejected because Sidekick's main strength is being right beside active web tabs via the Chrome side panel.

- **Decision 2: Zero-Key Public APIs with Server-Side Rate Limiting**
  - *Chosen Approach*: Leverage the 32 zero-credential public REST/GraphQL endpoints (UniProt, AlphaFold, RCSB PDB, PubChem, Europe PMC, ClinVar) with an Express server proxy (`/api/science/*`) in `server.ts` to handle CORS and backoff.
  - *Why*: Requires zero friction for the user (no sign-ups or paid tokens required), with exponential backoff handling rate limits gracefully.
  - *Alternatives Considered*: Client-only direct fetch. Rejected because several endpoints (e.g. NCBI variations, arXiv Atom, JASPAR) enforce strict CORS policies that require server proxying.

- **Decision 3: Lightweight Vector & Canvas Graphics over Heavy 3D Bundles**
  - *Chosen Approach*: Use 2D SVG / Canvas depictions for chemical structures (SmilesDrawer) and AlphaFold pLDDT coverage strips, with on-demand lazy loading for 3Dmol.js molecular viewers.
  - *Why*: Keeps the Chrome Extension bundle size light (<1MB) and guarantees instant side-panel rendering without bogging down browser tabs.

---

### 4. Technical Architecture & Data Strategy

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                       CHROME ACTIVE TAB (Webpage)                           │
│  PubMed / bioRxiv / Nature / Wikipedia / Chemistry Articles / Gene Pages    │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │ DOM Content & User Selections
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                  SIDEKICK EXTENSION SIDE PANEL (React SPA)                  │
│                                                                             │
│  ┌───────────────────────┐  ┌────────────────────────────────────────────┐  │
│  │  Deterministic Router │  │  Slash Commands: /science, /protein, /paper│  │
│  └───────────┬───────────┘  └─────────────────────┬──────────────────────┘  │
│              │                                    │                         │
│              ▼                                    ▼                         │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │                    Sidekick Coordinator Agent                         │  │
│  └───────────────────┬───────────────────────────────────┬───────────────┘  │
│                      │                                   │                  │
│                      ▼                                   ▼                  │
│  ┌────────────────────────────────────────┐ ┌────────────────────────────┐  │
│  │ Existing Workers (Action, Tab, Critic) │ │ Scientific Grounding Worker│  │
│  └────────────────────────────────────────┘ └────────────┬───────────────┘  │
└──────────────────────────────────────────────────────────┼──────────────────┘
                                                           │
                                                           ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                    EXPRESS BACKEND PROXY (server.ts)                        │
│               /api/science/protein  /api/science/literature                 │
│               /api/science/compound /api/science/clinical                   │
└───────┬──────────────────┬─────────────────┬─────────────────┬──────────────┘
        │                  │                 │                 │
        ▼                  ▼                 ▼                 ▼
 ┌──────────────┐   ┌──────────────┐  ┌─────────────┐   ┌─────────────┐
 │ UniProt & AF │   │ RCSB PDB &   │  │ PubChem &   │   │ Europe PMC &│
 │ (Proteins)   │   │ Foldseek     │  │ openFDA     │   │ PubMed      │
 └──────────────┘   └──────────────┘  └─────────────┘   └─────────────┘
```

- **Data Models**:
  - `ScientificEntity`: `{ type: 'gene' | 'protein' | 'compound' | 'variant' | 'paper'; query: string; accession?: string; title: string; metadata: Record<string, any>; provenance: string; sourceUrl: string }`
  - `ProteinEvidence`: `{ accession: string; gene: string; organism: string; functionSummary: string; plddtMean: number; plddtBand: 'very_high' | 'confident' | 'low' | 'very_low'; pdbIds: string[]; alphaFoldCifUrl: string }`
  - `CompoundEvidence`: `{ cid: number; name: string; smiles: string; molecularWeight: number; drugLikeness: { lipinskiViolations: number }; boxedWarnings: string[] }`
  - `LiteratureEvidence`: `{ pmid?: string; doi?: string; title: string; authors: string[]; journal: string; year: number; abstract: string; isOpenAccess: boolean }`

- **Interactive Component & State Mapping**:
  - `src/scientific/scienceEngine.ts`: Core resolver mapping detected terms to UniProt, PubChem, PubMed, and AlphaFold DB APIs.
  - `src/slashCommands.ts`: Registers `/science`, `/protein`, `/compound`, `/paper`, `/trial` with interactive suggestion pills.
  - `server.ts`: Implements `/api/science/*` proxy routes with polite headers and `fetchWithRetry`.
  - `src/App.tsx` & `public/sidepanel.js`: Renders the new Science Evidence Inspector card alongside the chat history and active tab DOM view.

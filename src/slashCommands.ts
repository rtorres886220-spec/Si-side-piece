/**
 * Sidekick Slash Command Registry & Execution Definitions
 * Implements Tier 1 (Core Essentials), Tier 2 (Action, Data & Audio), and Tier 3 (Power, Tech & Privacy)
 */

export interface SlashCommandDef {
  id: string;
  name: string;
  aliases: string[];
  tier: 1 | 2 | 3;
  tierLabel: "Tier 1: Core Essentials" | "Tier 2: Action, Data & Audio" | "Tier 3: Power, Tech & Security";
  syntax: string;
  description: string;
  category: "Reading & Research" | "Browser Action" | "Data Extraction" | "Writing" | "Utility" | "Audio" | "Developer" | "Security";
  example: string;
  requiresArg?: boolean;
  defaultArg?: string;
  argSuggestions?: string[];
}

export const SLASH_COMMANDS: SlashCommandDef[] = [
  // ================= TIER 1: CORE ESSENTIALS =================
  {
    id: "summarize",
    name: "/summarize",
    aliases: ["/sum", "/brief"],
    tier: 1,
    tierLabel: "Tier 1: Core Essentials",
    syntax: "/summarize [bullets | tldr | deep | executive]",
    description: "Digest page with verbatim citations",
    category: "Reading & Research",
    example: "/summarize bullets",
    argSuggestions: ["bullets", "tldr", "deep", "executive"]
  },
  {
    id: "cite",
    name: "/cite",
    aliases: ["/evidence", "/findquote"],
    tier: 1,
    tierLabel: "Tier 1: Core Essentials",
    syntax: "/cite <claim or question>",
    description: "Find proof and highlight passage",
    category: "Reading & Research",
    example: "/cite What is the training duration and hardware used?",
    requiresArg: true
  },
  {
    id: "explain",
    name: "/explain",
    aliases: ["/eli5", "/simplify"],
    tier: 1,
    tierLabel: "Tier 1: Core Essentials",
    syntax: "/explain [concept or selection]",
    description: "Explain concept in plain English",
    category: "Reading & Research",
    example: "/explain Multi-Head Attention",
    argSuggestions: ["selection", "core concept", "like I am 5"]
  },
  {
    id: "actions",
    name: "/actions",
    aliases: ["/cdp", "/scan"],
    tier: 1,
    tierLabel: "Tier 1: Core Essentials",
    syntax: "/actions",
    description: "Scan clickable buttons and inputs",
    category: "Browser Action",
    example: "/actions"
  },
  {
    id: "clear",
    name: "/clear",
    aliases: ["/reset", "/new"],
    tier: 1,
    tierLabel: "Tier 1: Core Essentials",
    syntax: "/clear",
    description: "Clear conversation thread",
    category: "Utility",
    example: "/clear"
  },
  {
    id: "help",
    name: "/help",
    aliases: ["/shortcuts", "/?"],
    tier: 1,
    tierLabel: "Tier 1: Core Essentials",
    syntax: "/help [command name]",
    description: "Show command cheat sheet",
    category: "Utility",
    example: "/help"
  },
  {
    id: "copy",
    name: "/copy",
    aliases: ["/export", "/save"],
    tier: 1,
    tierLabel: "Tier 1: Core Essentials",
    syntax: "/copy [last | all | markdown]",
    description: "Copy response or chat to clipboard",
    category: "Utility",
    example: "/copy markdown",
    argSuggestions: ["last", "all", "markdown"]
  },

  // ================= TIER 2: ACTION, DATA & AUDIO =================
  {
    id: "click",
    name: "/click",
    aliases: [],
    tier: 2,
    tierLabel: "Tier 2: Action, Data & Audio",
    syntax: "/click <element name or text>",
    description: "Click element via CDP mouse event",
    category: "Browser Action",
    example: "/click Add to Cart",
    requiresArg: true
  },
  {
    id: "fill",
    name: "/fill",
    aliases: ["/type", "/input"],
    tier: 2,
    tierLabel: "Tier 2: Action, Data & Audio",
    syntax: "/fill <field name> = <value>",
    description: "Type into inputs via CDP key events",
    category: "Browser Action",
    example: "/fill Search Store = Wireless Studio Headphones",
    requiresArg: true
  },
  {
    id: "scroll",
    name: "/scroll",
    aliases: [],
    tier: 2,
    tierLabel: "Tier 2: Action, Data & Audio",
    syntax: "/scroll [top | bottom | half | +500px | -500px]",
    description: "Scroll page viewport smoothly",
    category: "Browser Action",
    example: "/scroll bottom",
    argSuggestions: ["bottom", "top", "half", "+500px", "-500px"]
  },
  {
    id: "fillcart",
    name: "/fillcart",
    aliases: ["/checkout-prep", "/dealcheck"],
    tier: 2,
    tierLabel: "Tier 2: Action, Data & Audio",
    syntax: "/fillcart",
    description: "Select options and add to cart",
    category: "Browser Action",
    example: "/fillcart"
  },
  {
    id: "extract",
    name: "/extract",
    aliases: ["/scrape", "/parse"],
    tier: 2,
    tierLabel: "Tier 2: Action, Data & Audio",
    syntax: "/extract [table | links | emails | pricing | json | markdown]",
    description: "Extract tables, links, or JSON",
    category: "Data Extraction",
    example: "/extract table",
    argSuggestions: ["table", "links", "pricing", "emails", "json"]
  },
  {
    id: "reply",
    name: "/reply",
    aliases: ["/respond", "/draft"],
    tier: 2,
    tierLabel: "Tier 2: Action, Data & Audio",
    syntax: "/reply [agree | disagree | professional | concise | inquiring]",
    description: "Draft contextual email or PR reply",
    category: "Writing",
    example: "/reply professional",
    argSuggestions: ["professional", "agree", "disagree", "concise", "inquiring"]
  },
  {
    id: "model",
    name: "/model",
    aliases: [],
    tier: 2,
    tierLabel: "Tier 2: Action, Data & Audio",
    syntax: "/model [default | fallback]",
    description: "Switch between 3.5 Flash-Lite and 3.1 Flash-Lite",
    category: "Utility",
    example: "/model fallback",
    argSuggestions: ["default", "fallback"]
  },
  {
    id: "readaloud",
    name: "/readaloud",
    aliases: ["/tts", "/speak"],
    tier: 2,
    tierLabel: "Tier 2: Action, Data & Audio",
    syntax: "/readaloud [last | selection | stop]",
    description: "Read aloud with speech player",
    category: "Audio",
    example: "/readaloud last",
    argSuggestions: ["last", "selection", "stop"]
  },

  // ================= TIER 3: POWER, TECH & PRIVACY =================
  {
    id: "code",
    name: "/code",
    aliases: ["/snippet", "/refactor"],
    tier: 3,
    tierLabel: "Tier 3: Power, Tech & Security",
    syntax: "/code [explain | typescript | python | optimize | test]",
    description: "Explain, optimize, or convert code",
    category: "Developer",
    example: "/code explain",
    argSuggestions: ["explain", "typescript", "python", "optimize", "test"]
  },
  {
    id: "inspect",
    name: "/inspect",
    aliases: ["/dom", "/selector"],
    tier: 3,
    tierLabel: "Tier 3: Power, Tech & Security",
    syntax: "/inspect <element name>",
    description: "Inspect selector & coordinates",
    category: "Developer",
    example: "/inspect Search Store",
    requiresArg: true
  },
  {
    id: "curl",
    name: "/curl",
    aliases: [],
    tier: 3,
    tierLabel: "Tier 3: Power, Tech & Security",
    syntax: "/curl",
    description: "Generate curl commands for APIs",
    category: "Developer",
    example: "/curl"
  },
  {
    id: "definitions",
    name: "/definitions",
    aliases: ["/terms", "/glossary"],
    tier: 3,
    tierLabel: "Tier 3: Power, Tech & Security",
    syntax: "/definitions",
    description: "Build glossary of terms on page",
    category: "Reading & Research",
    example: "/definitions"
  },
  {
    id: "factcheck",
    name: "/factcheck",
    aliases: ["/verify", "/counter"],
    tier: 3,
    tierLabel: "Tier 3: Power, Tech & Security",
    syntax: "/factcheck",
    description: "Audit claims, sources, and bias",
    category: "Reading & Research",
    example: "/factcheck"
  },
  {
    id: "translate",
    name: "/translate",
    aliases: ["/tr"],
    tier: 3,
    tierLabel: "Tier 3: Power, Tech & Security",
    syntax: "/translate [language, e.g. es, fr, ja, de, zh]",
    description: "Translate text or page content",
    category: "Writing",
    example: "/translate Spanish",
    argSuggestions: ["Spanish", "French", "German", "Japanese", "Mandarin", "Portuguese"]
  },
  {
    id: "rewrite",
    name: "/rewrite",
    aliases: ["/polish", "/fix"],
    tier: 3,
    tierLabel: "Tier 3: Power, Tech & Security",
    syntax: "/rewrite [grammar | punchy | formal | shorter]",
    description: "Polish text for clarity or impact",
    category: "Writing",
    example: "/rewrite punchy",
    argSuggestions: ["punchy", "formal", "shorter", "grammar"]
  },
  {
    id: "quiz",
    name: "/quiz",
    aliases: ["/testme", "/flashcards"],
    tier: 3,
    tierLabel: "Tier 3: Power, Tech & Security",
    syntax: "/quiz [3 | 5 questions]",
    description: "Create comprehension quiz",
    category: "Reading & Research",
    example: "/quiz 3",
    argSuggestions: ["3 questions", "5 questions"]
  },
  {
    id: "timeline",
    name: "/timeline",
    aliases: ["/chrono", "/history"],
    tier: 3,
    tierLabel: "Tier 3: Power, Tech & Security",
    syntax: "/timeline",
    description: "Extract chronological timeline",
    category: "Reading & Research",
    example: "/timeline"
  },
  {
    id: "audit",
    name: "/audit",
    aliases: ["/privacy", "/inspect-data"],
    tier: 3,
    tierLabel: "Tier 3: Power, Tech & Security",
    syntax: "/audit",
    description: "Inspect privacy & sanitized enclave",
    category: "Security",
    example: "/audit"
  },
  {
    id: "sludge-audit",
    name: "/sludge-audit",
    aliases: ["/sludge", "/predatory-audit"],
    tier: 3,
    tierLabel: "Tier 3: Power, Tech & Security",
    syntax: "/sludge-audit",
    description: "Audit page for hidden fees & asymmetric UI",
    category: "Security",
    example: "/sludge-audit"
  },
  {
    id: "disinfect",
    name: "/disinfect",
    aliases: ["/clean-cart", "/uncheck-fees"],
    tier: 2,
    tierLabel: "Tier 2: Action, Data & Audio",
    syntax: "/disinfect",
    description: "Instantly uncheck hidden fees & predatory toggles",
    category: "Browser Action",
    example: "/disinfect"
  },
  {
    id: "cancel",
    name: "/cancel",
    aliases: ["/click-to-cancel", "/unsubscribe-now"],
    tier: 2,
    tierLabel: "Tier 2: Action, Data & Audio",
    syntax: "/cancel",
    description: "Autonomous click-to-cancel roach motel navigator",
    category: "Browser Action",
    example: "/cancel"
  },
  {
    id: "denylist",
    name: "/denylist",
    aliases: ["/block", "/isolate"],
    tier: 3,
    tierLabel: "Tier 3: Power, Tech & Security",
    syntax: "/denylist [add | remove | check]",
    description: "Manage domain automation blocklist",
    category: "Security",
    example: "/denylist check",
    argSuggestions: ["check", "add", "remove"]
  }
];

/**
 * Match a user input starting with / against registered commands
 */
export function matchSlashCommand(query: string): SlashCommandDef[] {
  const clean = query.trim().toLowerCase();
  if (!clean.startsWith("/")) return [];
  const term = clean.slice(1);
  if (!term) return SLASH_COMMANDS;

  return SLASH_COMMANDS.filter((cmd) => {
    if (cmd.name.slice(1).toLowerCase().startsWith(term)) return true;
    if (cmd.aliases.some((a) => a.slice(1).toLowerCase().startsWith(term))) return true;
    if (cmd.category.toLowerCase().includes(term)) return true;
    if (cmd.description.toLowerCase().includes(term)) return true;
    return false;
  });
}

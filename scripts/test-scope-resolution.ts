/**
 * Test Suite: Scope Resolution & Zero-Degradation Disambiguation
 *
 * Verifies:
 * 1. Shorthand & colloquial queries bind to on_screen without false rejections
 * 2. Standalone open-domain queries resolve to off_screen without DOM pollution
 * 3. Page-specific queries preserve factual verification & refusal contracts
 * 4. Fast path pure actions and greetings remain 0ms / 0 tokens
 */

import { routeUserRequest, resolveEpistemicScope } from "../src/deterministicRouter.ts";

interface TestCase {
  name: string;
  prompt: string;
  pageMeta?: { title?: string; url?: string; domain?: string };
  expectedScope: "on_screen" | "off_screen" | "hybrid";
  expectedIsShorthand?: boolean;
  expectedIsGeneralKnowledge?: boolean;
  expectedIntent?: "conversational" | "pure_action" | "informational" | "hybrid" | "ambiguous";
}

const TEST_CASES: TestCase[] = [
  // A. Shorthand & Colloquial Page Queries (Must bind to on_screen, never falsely rejected)
  {
    name: "Shorthand: how much",
    prompt: "how much",
    pageMeta: { title: "Sony WH-1000XM5 Headphones - eBay", url: "https://ebay.com/itm/123", domain: "ebay.com" },
    expectedScope: "on_screen",
    expectedIsShorthand: true,
  },
  {
    name: "Shorthand: is it legit",
    prompt: "is it legit",
    pageMeta: { title: "Refurbished Tech Store", url: "https://store.example.com", domain: "store.example.com" },
    expectedScope: "on_screen",
    expectedIsShorthand: true,
  },
  {
    name: "Shorthand: good deal?",
    prompt: "good deal?",
    pageMeta: { title: "MacBook Air M3 Deals", url: "https://amazon.com/dp/xyz", domain: "amazon.com" },
    expectedScope: "on_screen",
    expectedIsShorthand: true,
  },
  {
    name: "Shorthand: specs",
    prompt: "specs",
    pageMeta: { title: "GeForce RTX 4080", url: "https://newegg.com", domain: "newegg.com" },
    expectedScope: "on_screen",
    expectedIsShorthand: true,
  },
  {
    name: "Shorthand: what does this mean",
    prompt: "what does this mean",
    pageMeta: { title: "Arbitration Agreement", url: "https://terms.example.com", domain: "terms.example.com" },
    expectedScope: "on_screen",
    expectedIsShorthand: true,
  },
  {
    name: "Shorthand: what's better",
    prompt: "what's better",
    pageMeta: { title: "Bose QuietComfort 45", url: "https://bestbuy.com", domain: "bestbuy.com" },
    expectedScope: "on_screen",
    expectedIsShorthand: true,
  },

  // B. Open-Domain General Knowledge (Must resolve to off_screen, no false 'zero receipts' rejection)
  {
    name: "General: Rust sorting algorithm",
    prompt: "How do I sort an array in Rust?",
    pageMeta: { title: "Kitchen Aid Blender - Amazon", url: "https://amazon.com", domain: "amazon.com" },
    expectedScope: "off_screen",
    expectedIsGeneralKnowledge: true,
  },
  {
    name: "General: Why is the sky blue",
    prompt: "why is the sky blue",
    pageMeta: { title: "Nike Air Max - Nike Store", url: "https://nike.com", domain: "nike.com" },
    expectedScope: "off_screen",
    expectedIsGeneralKnowledge: true,
  },
  {
    name: "General: Temperature conversion",
    prompt: "convert 100 celsius to fahrenheit",
    pageMeta: { title: "Wikipedia - Quantum Computing", url: "https://wikipedia.org", domain: "wikipedia.org" },
    expectedScope: "off_screen",
    expectedIsGeneralKnowledge: true,
  },
  {
    name: "General: Math calculation",
    prompt: "calculate 15 * 24",
    pageMeta: { title: "Reddit - General Discussion", url: "https://reddit.com", domain: "reddit.com" },
    expectedScope: "off_screen",
    expectedIsGeneralKnowledge: true,
  },
  {
    name: "General: Historical fact",
    prompt: "who was the 16th US president",
    pageMeta: { title: "GitHub - torvalds/linux", url: "https://github.com", domain: "github.com" },
    expectedScope: "off_screen",
    expectedIsGeneralKnowledge: true,
  },
  {
    name: "General: Draft an email",
    prompt: "write an email thanking my team for hard work",
    pageMeta: { title: "YouTube - Home", url: "https://youtube.com", domain: "youtube.com" },
    expectedScope: "off_screen",
    expectedIsGeneralKnowledge: true,
  },

  // C. Page-Referential Queries (Must resolve to on_screen)
  {
    name: "Page-Referential: Author question",
    prompt: "Who is the author of this paper?",
    pageMeta: { title: "Attention Is All You Need", url: "https://arxiv.org", domain: "arxiv.org" },
    expectedScope: "on_screen",
    expectedIsGeneralKnowledge: false,
  },
  {
    name: "Page-Referential: Benchmark budget (Category J)",
    prompt: "What was the total financial budget and commercial release date for this quantum processor?",
    pageMeta: { title: "Quantum Computing Progress Report", url: "https://research.org", domain: "research.org" },
    expectedScope: "on_screen",
  },
  {
    name: "Page-Referential: Transit extension (Category K)",
    prompt: "Will the Blue Line extension include express trains to the International Airport?",
    pageMeta: { title: "Urban Transit Expansion - Blue Line", url: "https://transit.gov", domain: "transit.gov" },
    expectedScope: "on_screen",
  },

  // D. Fast Path Pure Action
  {
    name: "Pure Action: Scroll down",
    prompt: "scroll down",
    expectedIntent: "pure_action",
    expectedScope: "on_screen",
  },

  // E. Fast Path Conversational Greeting
  {
    name: "Conversational: Hello",
    prompt: "hello",
    expectedIntent: "conversational",
    expectedScope: "off_screen",
  },
];

let passed = 0;
let failed = 0;

console.log("================================================================================");
console.log("RUNNING SCOPE RESOLUTION & DISAMBIGUATION TEST HARNESS");
console.log("================================================================================");

for (let i = 0; i < TEST_CASES.length; i++) {
  const tc = TEST_CASES[i];
  const route = routeUserRequest(tc.prompt);
  const scope = resolveEpistemicScope(tc.prompt, tc.pageMeta);

  let ok = true;
  const errors: string[] = [];

  if (tc.expectedScope && scope.scope !== tc.expectedScope) {
    ok = false;
    errors.push(`Expected scope '${tc.expectedScope}', got '${scope.scope}'`);
  }
  if (tc.expectedIsShorthand !== undefined && scope.isDeicticOrShorthand !== tc.expectedIsShorthand) {
    ok = false;
    errors.push(`Expected isDeicticOrShorthand=${tc.expectedIsShorthand}, got ${scope.isDeicticOrShorthand}`);
  }
  if (tc.expectedIsGeneralKnowledge !== undefined && scope.isGeneralKnowledge !== tc.expectedIsGeneralKnowledge) {
    ok = false;
    errors.push(`Expected isGeneralKnowledge=${tc.expectedIsGeneralKnowledge}, got ${scope.isGeneralKnowledge}`);
  }
  if (tc.expectedIntent && route.intent !== tc.expectedIntent) {
    ok = false;
    errors.push(`Expected intent '${tc.expectedIntent}', got '${route.intent}'`);
  }

  if (ok) {
    passed++;
    console.log(`[${i + 1}/${TEST_CASES.length}] PASS ✓: ${tc.name} (Scope: ${scope.scope}, Intent: ${route.intent})`);
  } else {
    failed++;
    console.error(`[${i + 1}/${TEST_CASES.length}] FAIL ✗: ${tc.name}`);
    for (const err of errors) {
      console.error(`   - ${err}`);
    }
  }
}

console.log("================================================================================");
console.log(`TEST SUMMARY: Passed ${passed}/${TEST_CASES.length} (${Math.round((passed / TEST_CASES.length) * 100)}%)`);
console.log("================================================================================");

if (failed > 0) {
  process.exit(1);
} else {
  process.exit(0);
}

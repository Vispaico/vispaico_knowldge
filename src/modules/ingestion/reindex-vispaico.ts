/**
 * Re‑ingestion script for Vispaico's new positioning.
 *
 * This script:
 * 1. Creates a "note" source in the specified workspace and seeds manual grounding notes.
 * 2. Triggers Firecrawl crawls for the new key pages.
 *
 * Usage:
 *   npx tsx src/modules/ingestion/reindex-vispaico.ts <workspace_id> [<organization_id>]
 *
 * If organization_id is omitted, the script looks up the workspace to discover it.
 */

import { logger } from "../../lib/logger.js";
import { db } from "../../lib/db.js";
import * as wsRepo from "../workspaces/repository.js";
import * as sourceRepo from "../sources/repository.js";
import * as docRepo from "../documents/repository.js";
import * as repo from "./repository.js";

// ── Grounding notes ───────────────────────────────────────────────────

interface GroundingNote {
  title: string;
  sections: Array<{ heading: string; body: string }>;
}

const GROUNDING_NOTES: GroundingNote[] = [
  {
    title: "Vispaico AIOS Overview",
    sections: [
      {
        heading: "What is AIOS",
        body: "AIOS (AI Operating System) is Vispaico's core platform — a private AI operating system deployed on the client's own infrastructure. It gives every company a secure, fully-owned private AI workforce. AIOS replaces scattered SaaS AI tools with a single, unified system that learns your business, analyzes your data, and acts on your behalf. All code, data, and infrastructure remain under the client's full ownership. There is no vendor lock-in and no third-party access to company data.",
      },
      {
        heading: "The Three Phases",
        body: "AIOS is delivered in three phases: Company Brain (phase one) learns your company's knowledge and becomes an expert on your business. Company Analyst (phase two) connects to your data sources and generates insights, reports, and analysis. Company Operator (phase three) takes autonomous action through integrations and workflows. Clients can adopt phases incrementally based on their needs.",
      },
      {
        heading: "Who AIOS Is For",
        body: "AIOS is for any company that wants a private AI workforce. It is especially relevant for knowledge-intensive businesses where internal expertise is critical, regulated industries that require data sovereignty, and teams that need full control over their AI systems without vendor lock-in. Use cases range from support and operations to analytics and process automation.",
      },
      {
        heading: "Private Infrastructure and Ownership",
        body: "AIOS runs entirely on the client's private infrastructure — on-premise or in the client's own cloud account. The client owns all code, data, configurations, and systems built during deployment. There is no data leakage to third parties, no vendor lock-in, and no hidden dependencies. Full ownership means the client can modify, extend, or migrate the system at any time.",
      },
      {
        heading: "Pricing",
        body: "Vispaico offers transparent, straightforward pricing. Plans are based on team size and complexity, with clear monthly fees and setup costs. The exact pricing and plan options are detailed on the website. There are no hidden fees, and clients get full ownership regardless of the plan chosen.",
      },
    ],
  },
  {
    title: "Company Brain — Phase One",
    sections: [
      {
        heading: "What Company Brain Does",
        body: "Company Brain is the first phase of AIOS. It ingests all of a company's internal knowledge — documents, wikis, process guides, historical data, customer interactions, and more — and learns to become an expert on the business. Team members can ask Company Brain anything about the company: policies, procedures, past decisions, technical details. It functions as an always-on, infinitely knowledgeable team member who knows the entire history and context of the organization.",
      },
      {
        heading: "How Company Brain Works",
        body: "Company Brain connects to the company's existing knowledge sources (documentation, databases, communication archives) and builds a comprehensive internal knowledge model. It uses retrieval-augmented generation to ground every answer in the company's actual data. The system is continuously updated as new knowledge is added.",
      },
    ],
  },
  {
    title: "Company Analyst — Phase Two",
    sections: [
      {
        heading: "What Company Analyst Does",
        body: "Company Analyst is the second phase of AIOS. It connects to the company's data sources — databases, analytics platforms, CRMs, financial systems, operational tools — and provides real-time analysis, dashboards, reports, and actionable insights. While Company Brain knows what the company knows, Company Analyst understands what the data says. It can identify trends, anomalies, correlations, and opportunities that humans might miss.",
      },
      {
        heading: "How Company Analyst Works",
        body: "Company Analyst integrates with existing data infrastructure and applies AI-powered analysis to generate reports, visualizations, and natural-language summaries. It answers complex analytical questions, monitors key metrics, and proactively surfaces insights. All analysis is grounded in the company's own data and runs on the company's private infrastructure.",
      },
    ],
  },
  {
    title: "Company Operator — Phase Three",
    sections: [
      {
        heading: "What Company Operator Does",
        body: "Company Operator is the third and most advanced phase of AIOS. It takes autonomous action on behalf of the company through integrations with business systems, APIs, and workflows. While Company Brain knows and Company Analyst analyzes, Company Operator executes. It can trigger processes, update records, send communications, manage workflows, and coordinate multi-step operations across tools.",
      },
      {
        heading: "How Company Operator Works",
        body: "Company Operator connects to the company's operational tools — CRM, ERP, project management, communication platforms, custom APIs — and executes tasks autonomously within defined guardrails. Actions are logged, auditable, and can be reviewed before execution depending on the configured autonomy level.",
      },
    ],
  },
  {
    title: "AI Operations Audit",
    sections: [
      {
        heading: "What the AI Operations Audit Is",
        body: "The AI Operations Audit is a structured assessment that evaluates a company's AI readiness. It examines the company's current data infrastructure, knowledge assets, operational workflows, and team capabilities to identify where AIOS can have the highest impact. The audit produces a clear, actionable roadmap for AI adoption tailored to the company's specific context.",
      },
      {
        heading: "Who the Audit Is For",
        body: "The AI Operations Audit is designed for companies that know they need AI but aren't sure where to start. It provides a concrete, no-obligation assessment that helps leadership understand their AI maturity, identify quick wins, and plan a phased adoption of AIOS. It is the recommended starting point for new clients.",
      },
      {
        heading: "How the Audit Works",
        body: "The audit covers infrastructure assessment, knowledge asset inventory, workflow analysis, team capability evaluation, and opportunity mapping. At the end, the client receives a detailed report with prioritized recommendations, estimated effort, and expected impact for each opportunity area.",
      },
    ],
  },
  {
    title: "Infrastructure and Ownership Model",
    sections: [
      {
        heading: "Private Infrastructure",
        body: "Vispaico AIOS is deployed entirely on the client's private infrastructure. This means the system runs on the client's own servers or cloud accounts, not on Vispaico's infrastructure. The client retains complete control over their data, models, and systems with no third-party access.",
      },
      {
        heading: "Full Ownership",
        body: "At the end of deployment, the client owns everything: the code, the infrastructure configuration, the data models, the content, and all systems built. There is no vendor lock-in. The client can modify, extend, migrate, or dismantle the system at any time without restrictions.",
      },
      {
        heading: "No Vendor Lock-In",
        body: "Unlike SaaS AI tools that hold your data and create dependency, Vispaico's model ensures the client is never locked in. All systems are built on open standards and the client's own infrastructure. If the client decides to take a different direction, they keep everything that was built.",
      },
    ],
  },
  {
    title: "Industries and Use Cases",
    sections: [
      {
        heading: "Industries",
        body: "Vispaico AIOS serves a broad range of industries. It is especially impactful for knowledge-intensive sectors like professional services, consulting, legal, and financial services where institutional knowledge is critical. Regulated industries such as healthcare, finance, and government benefit from the private infrastructure model. Technology companies, SaaS businesses, manufacturing, logistics, and retail all find value in having a private AI workforce.",
      },
      {
        heading: "Use Cases",
        body: "Common use cases include internal knowledge management and support, data analysis and reporting, process automation, customer-facing AI assistants, compliance monitoring, operations optimization, and decision support. AIOS adapts to the specific needs of each client through its phased approach.",
      },
    ],
  },
];

// ── Page URLs to crawl ──────────────────────────────────────────────

const CRAWL_URLS = [
  { name: "Vispaico Homepage", url: "https://www.vispaico.com/", maxPages: 5, includePaths: ["/"] },
  { name: "Vispaico AIOS", url: "https://www.vispaico.com/en/aios", maxPages: 10, includePaths: ["/en/aios", "/en/services/*"] },
];

// ── Helpers ──────────────────────────────────────────────────────────

async function seedGroundingNotes(
  orgId: string,
  wsId: string,
): Promise<void> {
  logger.info("Seeding grounding notes");

  // Create a single note source for all grounding knowledge
  const source = await sourceRepo.createSource({
    organization_id: orgId,
    workspace_id: wsId,
    type: "note",
    name: "Vispaico Grounding Knowledge",
    metadata: { description: "Manual grounding notes for Vispaico positioning, AIOS, phases, ownership, and pricing" },
  });

  const job = await repo.createIngestionJob({
    organization_id: orgId,
    workspace_id: wsId,
    source_id: source.id,
    type: "note_ingest",
    config: { note_count: GROUNDING_NOTES.length },
  });

  let docsInserted = 0;
  let sectionsInserted = 0;

  for (const note of GROUNDING_NOTES) {
    const combinedContent = note.sections.map((s) => `# ${s.heading}\n\n${s.body}`).join("\n\n");

    const doc = await docRepo.createDocument({
      organization_id: orgId,
      workspace_id: wsId,
      source_id: source.id,
      ingestion_job_id: job.id,
      title: note.title,
      url: undefined,
      content: combinedContent,
      metadata: { type: "grounding_note" },
    });
    docsInserted++;

    for (let i = 0; i < note.sections.length; i++) {
      const section = note.sections[i];
      await docRepo.createDocumentSection({
        organization_id: orgId,
        workspace_id: wsId,
        document_id: doc.id,
        title: section.heading,
        content: section.body,
        order_index: i,
      });
      sectionsInserted++;
    }
  }

  await repo.updateIngestionJob(job.id, {
    status: "success",
    raw_response: { docs_inserted: docsInserted, sections_inserted: sectionsInserted },
    completed_at: new Date(),
  });

  logger.info({ source_id: source.id, docsInserted, sectionsInserted }, "Grounding notes seeded");
}

async function clearExistingWebsiteContent(
  wsId: string,
  baseUrlPattern: string,
): Promise<void> {
  // Remove old documents from vispaico.com that match the old crawl
  const oldDocs = await db("documents")
    .where("workspace_id", wsId)
    .where("url", "ILIKE", `%${baseUrlPattern}%`)
    .select("id");

  if (oldDocs.length > 0) {
    const ids = oldDocs.map((d: { id: string }) => d.id);
    logger.info({ count: ids.length }, "Removing old website documents");

    await db("document_sections").whereIn("document_id", ids).del();
    await db("documents").whereIn("id", ids).del();
  }
}

async function main() {
  const args = process.argv.slice(2);
  const workspaceId = args[0];
  let orgId = args[1];

  if (!workspaceId) {
    console.error("Usage: npx tsx src/modules/ingestion/reindex-vispaico.ts <workspace_id> [<organization_id>]");
    process.exit(1);
  }

  const workspace = await wsRepo.findWorkspaceById(workspaceId);
  if (!workspace) {
    console.error(`Workspace not found: ${workspaceId}`);
    process.exit(1);
  }

  orgId = orgId ?? workspace.organization_id;
  const wsId = workspace.id;

  logger.info({ orgId, wsId }, "Starting Vispaico re-index");

  // Step 1: Clear old Vispaico website content to avoid outdated dominance
  logger.info("Clearing old vispaico.com documents");
  await clearExistingWebsiteContent(wsId, "vispaico.com");

  // Step 2: Seed grounding notes
  await seedGroundingNotes(orgId, wsId);

  // Step 3: Trigger crawls for new pages
  // Note: in production, these requests go through POST /ingestion/website-crawl
  // but here we import the service directly.
  const { triggerWebsiteCrawl } = await import("./service.js");

  for (const cfg of CRAWL_URLS) {
    logger.info({ url: cfg.url }, "Creating source and triggering crawl");

    const source = await sourceRepo.createSource({
      organization_id: orgId,
      workspace_id: wsId,
      type: "website",
      name: cfg.name,
      base_url: cfg.url,
    });

    await triggerWebsiteCrawl({
      workspace_id: wsId,
      source_id: source.id,
      config: {
        max_pages: cfg.maxPages,
        include_paths: cfg.includePaths,
      },
    });
  }

  logger.info("Vispaico re-index complete");
  console.log("\nRe-index complete. Grounding notes and fresh crawl pages have been ingested.");
  console.log("You can now test the agent chat with the new queries.");
}

main().catch((err) => {
  console.error("Re-index failed:", err);
  process.exit(1);
});

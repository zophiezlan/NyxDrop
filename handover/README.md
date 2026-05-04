# NaloxoneLocate — Handover Suite

A complete spec-driven handover for building NaloxoneLocate from scratch, designed for use with [GitHub spec-kit](https://github.com/github/spec-kit) or any agentic coding tool.

This suite is for a **fresh repository**. There is an existing implementation at this path — **do not read it**. It is a Frankensteined first draft. Its only useful artefact is the schema and the consensus math, both of which are reproduced inside this suite. Reading the old code will pollute decisions; everything you need is in these eleven files.

## What this is

NaloxoneLocate is a community-sourced map of naloxone access points across Australia, built for people who use drugs and the people who care about them. It is a peer-led harm-reduction tool with no accounts, anonymous-by-default reports, and a layered trust model that explicitly tracks how people are *treated* at the counter — not just whether they got the medication.

## Reading order

Read the files in this order. Don't skip ahead.

| # | File | What it gives you |
|---|---|---|
| 1 | [constitution.md](constitution.md) | The non-negotiable rules of the project. Twelve principles that bind every later decision. Read first, return to often. |
| 2 | [vision.md](vision.md) | The prose north-star. The user portrait, the design philosophy, the feel of "good". Read second. Use it when the spec doesn't cover a decision. |
| 3 | [context.md](context.md) | Domain primer: what naloxone is, how Australian harm-reduction services work, what "soft denial" means and why it's the central feature. |
| 4 | [spec.md](spec.md) | The functional spec. Every screen, sheet, flow, and acceptance criterion. The single source of truth for *what to build*. |
| 5 | [plan.md](plan.md) | Tech architecture. Stack, folder structure, build, deploy. The single source of truth for *how to build it*. |
| 6 | [data-model.md](data-model.md) | Database schema with the reasoning behind every column. |
| 7 | [contracts.md](contracts.md) | API endpoints — request/response shapes for everything. |
| 8 | [algorithms.md](algorithms.md) | The small but critical math: pin status, reliability score, weight decay, barrier surfacing. |
| 9 | [tasks.md](tasks.md) | Phased build plan. Eight phases, each independently demoable. |
| 10 | [prompts.md](prompts.md) | Ready-to-paste agent kickoff prompts, one per phase. |

## How to use with spec-kit

```bash
# In a fresh repo
mkdir -p .specify/memory && cp handover/constitution.md .specify/memory/constitution.md
mkdir -p specs/001-naloxone-locate && cp handover/spec.md handover/plan.md handover/tasks.md specs/001-naloxone-locate/
cp handover/data-model.md handover/contracts.md handover/algorithms.md specs/001-naloxone-locate/
# Keep vision.md and context.md at repo root as project-level reference documents.
# Use prompts.md to drive the agent through each phase of tasks.md.
```

## How to use without spec-kit

Drop the entire `handover/` directory at repo root. Ask your agent to read the files in the order above before writing any code. Use `prompts.md` as the kickoff for each phase.

## What this suite deliberately omits

- Visual design beyond information architecture — leave room for a designer
- Marketing copy — there is none yet
- Legal/compliance review — the project must obtain one before launch
- Specific guardian-org partnerships — to be negotiated separately
- Budget, hosting, domain, and SSL setup — operational, not architectural

## A note on tone

This is a tool for people who are dealing with overdose risk. Build it with seriousness. No gamification, no celebration confetti, no breezy copy. The reward for contributing a report is being part of a quiet collective. That stance is enforced by the constitution.

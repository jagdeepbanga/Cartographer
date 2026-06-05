# Project Brief: Autonomous Shopping Agent

## Purpose
A portfolio flagship project to demonstrate senior AI full-stack capability for "Senior AI Engineer" roles — specifically agentic workflows, LLM tool use, and e-commerce domain depth. Public on GitHub, README written for a hiring manager from the first commit.

## Core concept
An AI agent (not a chatbot) that takes a natural-language shopping goal plus constraints, then autonomously plans, searches a catalogue, compares options, assembles a cart, explains its reasoning, and presents it for human approval before a sandbox checkout.
Example input:

"I need a complete home-office setup under $1,500 — desk, chair, monitor, lighting. Prioritise ergonomics, must arrive before the 20th."

## Differentiator
Pair the buyer agent with a slice of an AI Merchandiser (seller side): an agent that generates/cleans catalogue data (SEO titles, descriptions, category assignment, duplicate detection). This shows both sides of e-commerce AI and is uncommon in portfolios.

## Tech stack
Backend: Node.js + TypeScript (one language across stack; adds the Node evidence the profile currently lacks; mature agent-orchestration libraries)
Frontend: Next.js + React + TypeScript (conversational + cart UI)
Database/search: Postgres with pgvector for semantic search (or Algolia, a known strength)
LLM: Anthropic API
Catalogue source: public products dataset, or a BigCommerce sandbox (doubles as resume evidence)

## Agent tools (function-calling)
search_products, get_product_details, add_to_cart, checkout (sandbox/mock — no real payments)

## Phased scope (each phase independently shippable)
MVP: Agent loop over a seeded catalogue with the four tools; returns a justified cart in terminal or a basic page. No auth, no payments, no real checkout.
Reasoning depth: Proper multi-step plan → search → filter → compare → justify loop with structured outputs.
Frontend: Next.js conversational UI + cart view + the agent's reasoning shown to the user.
Merchandiser slice: Agent that generates/cleans catalogue data.
Polish (optional): Evals (does the agent pick good carts?), semantic search refinement, writeup/blog post.
# Inventory Insight

Build a fully working SAP business-process MVP from the scenario below. Optimize for first-pass correctness, low build complexity, and maximum demo value. Do not sacrifice the required features below.

SAP BUSINESS SCENARIO

"A warehouse has low inventory accuracy."

CORE GOAL

Understand the scenario first, then build the narrowest but deepest end-to-end solution for its primary business problem/decision.

Infer and implement only what the scenario requires:

SAP business process/module/domain

correct process stages, statuses and sequence

relevant SAP business objects and relationships

primary user/actor

core decision/work queue

2–3 scenario-specific KPIs

2–3 meaningful business validations

one data-grounded AI recommendation

Do not build a generic CRUD app, generic dashboard, chatbot, or broad SAP suite.

MVP

Create one polished decision cockpit containing:

KPI tiles

prioritized work queue/list

selected-record detail/context

required business action(s)

visible process/status flow

grounded AI recommendation

validation/error/success states

Prefer one excellent end-to-end workflow over many shallow screens.

SAP FIDELITY

Use realistic SAP terminology, objects, relationships and status transitions appropriate to the scenario. The application must reflect the actual business flow rather than a generic task list with SAP labels.

DATA + STATE INTEGRITY — CRITICAL

Use realistic seeded data containing normal cases and demo-worthy edge cases.

Use one source of truth for all application data.

Every user action must:

validate first

update the underlying record

update all affected related records

recalculate dependent KPIs

refresh queue/status/AI outputs

show success or failure

Never update only the visible UI. Prevent stale data, duplicate actions, invalid transitions, broken relationships, partial updates and contradictory values.

For a failed validation, nothing changes. For a successful action, all dependent data changes together.

VALIDATION

Implement exactly 2–3 scenario-relevant controls, such as:
mandatory fields, tolerance/quantity/amount limits, duplicate prevention, eligibility/approval rules, or valid status sequencing.

DATA-GROUNDED AI — NOT CHATBOT

Do not create chat.

AI must directly support the workflow by recommending, ranking, classifying, scoring or summarising based only on current application data and scenario rules.

Show:

recommended action

short rationale

key data/factors used

confidence/priority when useful

Never hallucinate or recommend an invalid option. Apply business-rule filtering before recommendation generation. The AI output must refresh when relevant data changes.

Use transparent rules/scoring where sufficient; use an LLM only for concise explanation of validated structured data.

KPI TILES

Show 2–3 scenario-specific KPI tiles with:
current value, baseline/previous value, change and status.

KPI values must be calculated from live application data. After every successful user action, KPIs must recalculate automatically and visibly reflect the new state. Use subtle motion/number transitions so the tiles feel live, not decorative.

UI/UX

Create a polished SAP Fiori-inspired responsive interface:
clean enterprise layout, strong hierarchy, compact cards/tables, clear primary actions, readable status indicators, and minimal unnecessary decoration.

Laptop: efficient cockpit with KPI + queue + detail visible.

Mobile: stacked, touch-friendly layout with the important decision/action always accessible.

Use one responsive application, not separate implementations.

SEEDED DATA

Seed enough data to demonstrate:
normal records, high-priority records, validation edge cases, AI-driven differences and observable KPI movement.

RELIABILITY

Before finishing, ensure:

no compile/runtime errors

no broken routes

no dead buttons

no placeholder actions

no undefined/null crashes

every action changes real application state

related records stay consistent

KPI values remain correct

AI refreshes from updated data

loading, empty, error and success states work

mobile and laptop layouts work

Keep the architecture simple and robust. Avoid unnecessary services, dependencies and complexity.

DEMO PATH

The MVP must support this clean 2–3 minute flow:

Problem → prioritized case → SAP data/context → AI recommendation → user action → validation where relevant → successful state update → KPI movement → business impact

PRIORITY

1. SAP process accuracy
2. End-to-end working state changes
3. Data consistency
4. Grounded AI recommendation
5. Validation
6. Live KPI impact
7. UI/UX polish
8. Extra features only after all above are reliable

When the scenario is ambiguous, choose the smallest defensible interpretation that can be completed and demonstrated end-to-end.

Build the complete working MVP now.

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/858cf2e9-8c19-438b-80a8-d137697d2a2d).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```

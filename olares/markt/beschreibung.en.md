# Kurz
Sales CRM that runs entirely on your own box — companies, contacts, deals and an AI assistant that never phones home

# Beschreibung
**Rocket** is a lean sales CRM for teams that cannot send their pipeline to a US cloud.

Companies, contacts, deals on a drag-and-drop pipeline board, an activity timeline on every record, tasks, quotes from a product catalogue, qualification scoring and a weighted forecast — the parts a sales team actually uses, without the rest.

**AI where it saves work**
- A typed call note becomes note, tasks, next step and qualification — proposed by the model, saved by a person
- Daily briefing, questions answered from your own data with sources, quote proposals with prices from the catalogue, never from the model
- Assistant: tell Rocket what to do in a sentence — it searches, opens pages and proposes tasks, notes, contacts and lead moves as cards; nothing is written until you confirm
- Insights: conversation notes are read once and split into customer statements with a verbatim quote, then clustered into themes — each with what it means for the product and the conversations behind it
- Describe instead of type: "building supplies in the Tecklenburg area, the managing director is probably called Sebastian" — Rocket finds candidate companies from search hits, reads imprint and team pages of the one you pick, and proposes company and person with a source per field; a person only counts when a read source names the last name
- New companies and contacts are enriched from the company website and, if you configure a search service, from search hits including LinkedIn pages — every value names its source, contact data must appear verbatim, existing values are never overwritten

**Language model**
Rocket ships with no endpoint configured. Point it at any OpenAI-compatible address under Settings — for example the LiteLLM app on the same box. There is deliberately no default: nothing is sent anywhere until you enter an address, and the app says so plainly.

**Integrations**
Meeting minutes from Insilo arrive through its shared folder on the same box, or by signed webhook; mail goes out through your own SMTP account. A backup is written after every change, at the latest every six hours, and restored automatically after a reinstall.

No telemetry. No phone home. Fonts are served from the box.

**Resource Usage**
CPU: 0.2 cores requested, up to 2
RAM: 1 GB requested, up to 2
Disk: 1 GB (database share, backups)
GPU: none — the language model is external

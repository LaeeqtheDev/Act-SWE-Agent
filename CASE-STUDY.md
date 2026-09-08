# Act — building a browser agent that actually finishes tasks

**Syed Laeeq Ahmed** · [GitHub](https://github.com/LaeeqtheDev) · [LinkedIn](https://www.linkedin.com/in/syed-laeeq-ahmed/)

A full-stack AI agent that drives a real browser to complete real tasks —
applying to jobs, triaging email, researching and writing up findings — with
a human approval gate on anything that submits, sends, or changes state.

Turborepo · Next.js 16 · Express · PostgreSQL/Prisma · Redis/BullMQ ·
Playwright · Clerk · Stripe · 70 tests

---

## The problem worth solving

Most "AI assistants" describe how to do a thing. Ask one to apply for a job
and you get a well-written explanation of how to apply for a job — you still
open the tab, find the form, and type your phone number for the hundredth
time.

Closing that gap is not mainly a model problem. It's a systems problem:
driving a real browser reliably, keeping a small model inside a tight token
budget, and — the part that decides whether anyone will actually use it —
making an autonomous agent safe enough to leave alone with your inbox.

---

## Three decisions that shaped the architecture

### 1. One choke point for every write

Reads run freely. Anything that submits, sends, posts, or mutates state goes
through `proposeAction`, which writes a pending row. Only `performAction` —
reachable solely via an explicit approval endpoint — executes anything.

No tool performs a write directly. That means the entire "can this thing do
something I didn't sanction?" question has exactly one place to audit, and it
holds identically for interactive chat and for workflows running unattended
at 3am.

It also shapes the UX: the agent proposes a *complete* action — an entire
filled form plus the submit button — rather than asking permission per
field. One review, one click.

### 2. Use the browser the user is already signed into

Rather than requesting OAuth scopes for Gmail, LinkedIn, and Slack, the
agent drives the user's own local Chrome profile via Playwright's
`launchPersistentContext`. Every existing session just works. No credentials
are stored, transmitted, or revocable-by-us, because we never hold any.

The trade-off is honest and documented: this is local automation on the
user's own machine, and it can't work in a hosted deployment. Slack and
Notion later got real OAuth integrations, because API calls beat driving a
web UI when an API exists.

### 3. Provider abstraction from day one

The agent loop never imports Anthropic or OpenAI directly — everything goes
through an `AIProvider` interface. Adding a provider that speaks OpenAI's
chat-completions format is a preset entry, not a new file. Users bring their
own key, stored AES-256-GCM encrypted, swappable from the UI.

That decision paid off immediately when free-tier token limits forced
model-switching as a debugging strategy rather than a feature.

---

## Engineering problems worth writing about

### Selectors that matched the wrong element entirely

Typing into Google's search box navigated to a completely different page.

The element collector labelled form fields with a Playwright `text=`
selector. But `text=` matches an element's **visible text content** — which
an `<input>` never has. So the search box labelled "Search" produced
`text=/Search/i`, which matched the **"How Search works" footer link**
instead. The agent clicked a link, landed elsewhere, then ran its
select-all-and-clear fallback on the wrong page.

Fixing it to `role=textbox[name=...]` exposed a second layer: Google's
search box is a `<textarea role="combobox">`, so a hardcoded `textbox` role
matched nothing at all. The fix reads the element's declared role.

**What I took from it:** both bugs presented identically — "typing does
nothing" — with completely different causes. The lesson wasn't about
selectors; it was that a failing selector must report *what it did find*, so
the next attempt has something to work from. That error path now returns the
page's actual interactive elements.

### Ctrl+A selecting an entire page

The clear-field fallback existed because Playwright's `fill()` only works on
`<input>`/`<textarea>` — rich-text editors are contenteditable divs, where
it throws. The fallback was select-all-and-delete.

When a click didn't land focus (an autocomplete overlay intercepting it),
that fallback ran against whatever *was* focused: the document. Users saw an
entire page highlighted blue.

The fix is a focus assertion before and a content assertion after — confirm
the target element holds `document.activeElement` before typing, and confirm
the typed text actually landed afterward. Some sites reset controlled inputs
faster than `pressSequentially` reacts, and it doesn't throw when that
happens, so the agent would report success on an empty field.

**The broader principle:** an agent that can't verify its own work will
confidently tell you it did something it didn't.

### 3,492 tokens spent before any conversation

Tasks kept failing with `413 Request too large` against Groq's 8,000
tokens/minute free tier. The obvious move was trimming conversation history
harder. That helped, and didn't fix it.

Measuring instead of guessing showed the actual shape: **the system prompt
and tool schemas alone cost 3,492 tokens on every single turn** — 44% of the
budget consumed before a single word of history. Six rounds of incremental
prompt patches had left the same rules restated three different ways.

Consolidating the prompt (every rule kept, said once) and gating unused tool
categories behind a flag cut fixed overhead to 1,986 tokens.

Then a live trace showed the remaining failures had a *different* cause:
"recent" tool results were kept **completely uncapped**, on the assumption
that only old history needed shrinking. A single Google Maps page — 25
elements, each with hundreds of characters of tracking data in its href —
exceeded the entire budget by itself. No amount of trimming older history
fixes that.

**What I took from it:** I'd optimised the thing I assumed was expensive.
The profiler was four lines of Python and would have pointed at the real
cost immediately.

### Cancellation that didn't cancel

"Stop" initially only aborted the client request. The server ran the full
agent loop to completion, burning tokens and quota on work nobody was
waiting for. Then, once wired through, a browser could *still* launch after
cancelling — because the check ran at launch entry, and launching takes
seconds. Cancel mid-launch and the in-flight launch completed anyway.

Cancellation now threads a real `AbortController` from the HTTP request
through the agent loop into the provider's HTTP call, with a re-check after
launch that tears down anything that finished late. A pending approved
action also refuses to execute on a cancelled conversation.

**Recurring theme:** every cancellation bug was a gap between "we decided to
stop" and "the thing actually stopped." Checks at entry are not enough for
anything that takes time.

---

## Testing where it's genuinely hard

Playwright can't run in every CI environment, and browser tests are slow and
flaky besides. Rather than skip coverage on the riskiest code, I extracted
the exact `page.evaluate` body that runs in the browser and test it against
jsdom — the real shipped logic, not a reimplementation.

That suite caught real bugs before they shipped, including one in a fix I
was actively writing: a token estimator that converted a character count to
a string and measured *the string's length* — `"8000".length` is 4, not
2000. The function meant to detect oversized requests was silently useless.

70 tests now cover selector generation, the encryption round-trip, usage
limits against a mocked Prisma client, adaptive history trimming, and
guards that fail loudly if a stateful tool is ever marked parallel-safe.

---

## Production hardening

A pre-deployment audit found the Docker image **could not run the product
at all** — `node:24-alpine` has no Chromium, and Alpine's musl libc can't
run Playwright's browsers regardless. Every browser tool would have thrown
on first deploy.

Also fixed in that pass: five endpoints unauthenticated in hosted mode
(including one leaking saved profile details to anonymous callers),
`cors()` with no arguments allowing every origin, no rate limiting on
endpoints that cost provider money, no graceful shutdown (orphaning Chromium
on every redeploy), and local dev tools not being blocked when other people
can sign in.

---

## What I'd tell another engineer

**Measure before optimising.** I spent multiple rounds trimming conversation
history when the fixed per-turn cost was the real problem. Four lines of
Python found it.

**Every guard needs to hold where the work happens.** Cancellation checks,
focus assertions, and size caps all failed the same way: correct in
principle, applied one layer too far from the operation they governed.

**An agent that can't verify itself is worse than a slow one.** "I've
written that for you" when nothing was written destroys trust faster than
taking an extra step to check.

**Say what doesn't work.** The docs state plainly that Google Search and
Cloudflare-protected sites still block automated browsers, that Gmail via
OAuth needs a 4–6 week Google review, and that integration tests against a
real database don't exist yet. Naming limitations is more credible than
claiming there aren't any.

---

## Honest status

**Working and tested:** agent loop, browser automation with focus and
content verification, multi-stage scheduled workflows, Slack/Notion
integrations, spreadsheet output, encrypted BYOK, permission layer,
Prometheus metrics, 70 passing tests.

**Built, not battle-tested:** Clerk auth, Stripe billing, email delivery,
and the OAuth flows typecheck and build clean but haven't run against
production credentials.

**Not built:** Gmail via OAuth (works today through browser automation),
model fine-tuning (a training-data export exists instead), integration tests
against a real database.

MIT licensed · [github.com/LaeeqtheDev/Act-SWE-Agent](https://github.com/LaeeqtheDev/Act-SWE-Agent)

# Using the agent

What it can actually do, and where the boundaries are.

---

## The core idea

The agent has tools. Reading and navigating happen freely — it browses,
clicks through, reads pages, and keeps going until it has a real answer.
Anything that **submits, sends, posts, or changes state** stops and waits
for you to approve it.

That split is the whole design. It's why you can hand it a vague task and
let it run, and why you can schedule it to run unattended without worrying
about what it might do while you're not watching.

---

## What needs approval, and what doesn't

| Action | Approval? |
|---|---|
| Reading a page, searching, looking things up | No |
| Clicking a link, button, tab, "next page", "show more" | No |
| Reading your saved profile details | No |
| Checking service health, Kubernetes pods, incidents | No |
| Reading project files (if dev tools enabled) | No |
| **Submitting a form or application** | **Yes** |
| **Sending an email or message** | **Yes** |
| **Posting or commenting** | **Yes** |
| **Restarting a pod, rolling back** | **Yes** |
| **Editing a file, running a shell command** | **Yes** |

When it does propose something, it proposes the **complete** action — an
entire filled-in form plus the submit button, not one field at a time. You
review it once, approve once, done. After it completes, the agent
automatically continues the task from there.

---

## Available tools

**Reading and navigation (no approval)**
- `browseWeb` — open a URL, read its content, get every clickable element
- `clickToNavigate` — click a button/tab/control and get the resulting page
- `webSearch` — search the web (DuckDuckGo, no API key needed)
- `getUserProfile` — your saved details, for filling forms
- `listServices`, `getServiceHealth`, `getRecentErrors`, `listIncidents`, `getDeploymentHistory`
- `getKubernetesPodStatus`, `getKubernetesEvents`
- `readProjectFile`, `listProjectDirectory`, `openInEditor` *(dev tools only)*

**Write actions (approval required)**
- `proposeAction` with type `form_fill`, `browser_action`, `restart_pod`, `rollback`, `file_edit`, or `shell_command`
- `createDocument` — writes a markdown file

---

## Form filling

Save your details at `/profile` — name, email, phone, location, LinkedIn,
GitHub, website, and a resume/summary for longer fields.

Then a request like *"find SWE roles at Stripe and apply to the backend
one"* works end to end: the agent browses the careers page, clicks into
listings, reads them, finds the application form, pulls your saved details,
and proposes the completed form for you to review before anything is sent.

Your details are read server-side only and never leave your machine except
into the form you explicitly approve.

---

## Sites that work

With `CHROME_USER_DATA_DIR` set, anything you're already signed into in
Chrome: Gmail, Google Calendar, Google Docs, LinkedIn, Slack, Facebook,
Instagram, WhatsApp Web, X, job boards, online compilers — the agent uses
your existing session, so there's no separate login step.

**Two honest caveats:**

1. **Google Search specifically is unreliable.** Google actively fights
   automated browsers with CAPTCHAs and bot detection. Going straight to a
   company's own site, or using `webSearch`, works far better than trying to
   read Google's results page. This is structural, not a bug.

2. **Most platforms' Terms of Service restrict automation.** LinkedIn and
   Slack especially. The risk is account-level (rate limiting, a flagged
   account), the same as any personal browser automation. Keep volume
   modest, particularly on LinkedIn.

---

## Workflows

Scheduled, unattended tasks at `/workflows`. Describe the task in plain
language, pick a cadence, done.

Each workflow keeps **one ongoing conversation across all its runs**, so the
tenth run still remembers what the first nine found — it can tell you what's
genuinely new rather than repeating itself.

Same tools, same approval gate. A workflow that hits something needing
approval leaves it pending for you rather than proceeding.

**Failure handling:** three consecutive failures auto-disables the workflow
and notifies you, rather than failing silently on schedule forever.

Results arrive as in-app notifications, and by email if SMTP is configured.

---

## The dashboard

Two genuinely different things, deliberately separated:

**Live agent issues** — real failures from real sessions. A browse that
couldn't complete, a tool that errored, a provider that timed out. Detected
automatically as the agent works.

**Simulated detection pipeline (demo)** — four fake services
(`payments-api`, `orders-api`, etc.) demonstrating the queue → worker →
rule-based-detection mechanics with real Postgres, Redis, and Kubernetes
underneath. It's a working showcase of the infrastructure, clearly labeled,
not the live product.

Remove the demo data any time:

```bash
cd apps/api && pnpm clear-demo
```

That clears only seeded services and incidents. Conversations, workflows,
agent-detected incidents, and your profile are untouched. Re-seed with
`pnpm exec prisma db seed`.

# Google OAuth verification — preparation guide

Gmail scopes are "restricted", which means Google reviews the app before it
can serve more than 100 users. Typical timeline is 4–6 weeks, and most
rejections are avoidable. This documents what to prepare and — more usefully
— the specific things that get apps rejected.

> Nothing here is legal advice, and Google's requirements change. Treat this
> as a preparation checklist, not a guarantee.

---

## The decision that most affects your outcome

**Ask for the narrowest scope that does the job.** Reviewers reject broad
scopes far more often than narrow ones, and a narrower scope also shortens
the security assessment.

| Scope | Restricted? | Use when |
|---|---|---|
| `gmail.readonly` | Yes | Reading and summarising an inbox |
| `gmail.send` | **No — sensitive only** | Sending mail the user composed |
| `gmail.compose` | Yes | Creating drafts |
| `gmail.modify` | Yes | Reading + labelling + sending |
| `mail.google.com` | Yes | Full access — **avoid, hardest to justify** |

**Recommendation for this product:** `gmail.readonly` + `gmail.send`.
`gmail.send` is only *sensitive*, not *restricted*, which avoids a
third-party security assessment for that half of the functionality. Never
request `mail.google.com`.

---

## Why apps get rejected

Ordered by how often each one is the actual cause.

**1. The demo video doesn't show the OAuth consent screen.**
Reviewers need to see the full flow: sign-in → the consent screen with the
scopes visible → what the app does with the data. Unlisted YouTube, no
narration required.

**2. The privacy policy doesn't name Google user data specifically.**
A generic policy fails. It must explicitly say which Google data you access,
what you do with it, whether it's stored, and how it's deleted.

**3. Scope justification is vague.** "To improve the user experience" gets
rejected. Tie each scope to a visible feature.

**4. The homepage doesn't clearly explain the app.** It must be publicly
reachable, describe the app's function, and link the privacy policy. A
landing page that's mostly a login wall fails.

**5. The domain isn't verified** in Google Search Console. Do this first —
it blocks submission.

---

## Privacy policy — the Google-specific section

Add this to the existing policy. The wording matters: reviewers look for
"Limited Use" explicitly.

> **Google user data**
>
> When you connect your Google account, we request access to read your Gmail
> messages (`gmail.readonly`) and to send messages you have explicitly
> approved (`gmail.send`).
>
> We use this data only to show you summaries of your inbox and to send
> messages you review and approve. Message content is processed to generate
> those summaries and is not stored on our servers beyond your conversation
> history, which you can delete at any time.
>
> We do not sell Google user data, use it for advertising, or use it to
> train machine learning models.
>
> Message content is sent to your chosen AI provider solely to generate the
> summary or draft you requested. You choose the provider, and you can use a
> local model so that no data leaves your machine.
>
> Our use of information received from Google APIs adheres to the
> [Google API Services User Data Policy](https://developers.google.com/terms/api-services-user-data-policy),
> including the Limited Use requirements.
>
> To revoke access, disconnect the account in settings or remove it at
> [myaccount.google.com/permissions](https://myaccount.google.com/permissions).
> Contact: laeeq@northfoundry.co

**That last paragraph is not optional** — the Limited Use link is checked
for directly.

---

## Scope justifications to submit

Copy these into the OAuth consent screen form, adjusted if your features
differ. Be concrete about the user-visible feature each one enables.

**`gmail.readonly`**
> Users ask the assistant to summarise their inbox — for example "what came
> in overnight that needs a reply". We read message headers and bodies to
> produce that summary and to draft contextual replies. Content is not
> stored beyond the user's own conversation history, which they can delete.

**`gmail.send`**
> Users ask the assistant to reply to emails. Every message is shown to the
> user in full and requires their explicit approval before it is sent — the
> app cannot send mail autonomously. This scope is used solely to deliver
> messages the user has reviewed and approved.

---

## Security assessment (restricted scopes only)

If `gmail.readonly` is included, Google may require a third-party
assessment. Costs typically $15k–$75k and takes several weeks.

**Two ways to avoid or defer it:**

1. **Ship with `gmail.send` only** (sensitive, not restricted) plus browser
   automation for reading. Users get the same features; no assessment.
2. **Stay under 100 users** in testing mode while you validate demand. Sign
   up individual testers by email address.

This is worth taking seriously — a five-figure assessment for a product
without paying customers is the wrong order of operations.

---

## Submission checklist

- [ ] Domain verified in Google Search Console
- [ ] Homepage publicly reachable, explains the app, links the privacy policy
- [ ] Privacy policy on the same domain, with the Google section above
- [ ] Terms of service published
- [ ] App name and logo match across the app and consent screen
- [ ] Demo video showing sign-in → consent screen with scopes → data use
- [ ] Scope justifications written per scope, tied to visible features
- [ ] Only the scopes you actually use are requested
- [ ] Test the full flow with an account that has never authorised the app

---

## Practical sequencing

1. **Ship Slack and Notion first** — days to approve, not weeks.
2. **Keep Gmail on browser automation** meanwhile. It works today, needs no
   approval, and users see no missing functionality.
3. **Start Gmail verification once you have paying users.** Real usage makes
   the justifications concrete, and it means you're not spending on an
   assessment before knowing the demand is there.

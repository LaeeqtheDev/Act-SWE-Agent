
export function collect(generation = 1): { id: string; text: string; href?: string }[] {

    // Every collected element gets a stable data-act-id attribute STAMPED
    // DIRECTLY ONTO THE DOM. That id is the ONLY thing the model ever sees
    // or sends back — never a hand-built Playwright query string.
    //
    // This replaces an entire class of bugs that kept recurring: role=
    // selectors matching the wrong element (a form field labelled "Search"
    // matching a footer link with "Search" in its text), truncated names
    // never matching anything, Playwright normalizing whitespace so a raw
    // innerText selector could never match, hrefs drifting or carrying
    // kilobytes of tracking data. An attribute selector doesn't have any
    // of those failure modes — it either exists on the page or it doesn't.
    const els = Array.from(document.querySelectorAll('a, button, input, textarea, select, [role="button"], [role="link"], [role="tab"], [contenteditable="true"]'));
    const results: { id: string; text: string; href?: string }[] = [];

    // Start numbering past the highest id already handed out at this
    // generation. Without this, `counter` would restart at 0 on every
    // collection and a newly-inserted element could be assigned an id that
    // a retained element is still using — reintroducing exactly the
    // wrong-element-execution bug this whole change exists to remove.
    let counter = 0;
    for (const seen of Array.from(document.querySelectorAll("[data-act-id]"))) {
      const existing = seen.getAttribute("data-act-id") ?? "";
      const match = existing.match(new RegExp(`^${generation}:e(\\d+)$`));
      if (match) counter = Math.max(counter, Number(match[1]) + 1);
    }

    for (const el of els) {
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) continue; // skip hidden elements

      let label =
        el.getAttribute("aria-label") ||
        (el as HTMLElement).innerText?.trim() ||
        el.textContent?.trim() ||
        el.getAttribute("placeholder") ||
        el.getAttribute("name") ||
        el.getAttribute("title") ||
        "";
      label = label.replace(/\s+/g, " ").trim(); // collapse newlines for a readable label

      const tag = el.tagName.toLowerCase();
      const isTextInput =
        tag === "textarea" ||
        el.getAttribute("contenteditable") === "true" ||
        (tag === "input" && !["hidden", "submit", "button", "checkbox", "radio"].includes((el as HTMLInputElement).type));

      // An empty <textarea> — a notepad, a comment box, a message field —
      // has no label at all. It still needs an id, so it's still
      // clickable/typeable, just described by what it IS rather than a
      // label it doesn't have.
      if (!label && !isTextInput) continue;

      // The id belongs to the ELEMENT, not to its position in this
      // collection. Previously this assigned `${generation}:e${counter++}`
      // unconditionally on every pass, which meant the id tracked
      // collection ORDER — so anything inserted mid-page (a lazily-loaded
      // ad, a toast, a newly-rendered result) shifted every subsequent
      // element's id by one. Worse than going stale: an id the model was
      // holding would still RESOLVE, just to a different element, and the
      // runtime would report "found it, clicked it, success" while
      // clicking the wrong thing entirely.
      //
      // Reusing an existing attribute makes the mapping stable: a node
      // keeps its id for as long as it's in the document, and only nodes
      // that have never been seen get a new one. The generation prefix
      // still handles the navigation case, where the whole document is
      // replaced and every old id should stop resolving.
      const existingId = el.getAttribute("data-act-id");
      let id: string;
      if (existingId && existingId.startsWith(`${generation}:`)) {
        // Same generation and already stamped — this exact node has been
        // seen before on this page, so it keeps the id the model may
        // already be holding.
        id = existingId;
      } else {
        // Never seen at this generation: brand new node, or one carrying a
        // stale id from before a navigation. Either way it needs a fresh
        // one, numbered past anything already handed out for this
        // generation so it can't collide with an id still in use.
        id = `${generation}:e${counter++}`;
        el.setAttribute("data-act-id", id);
      }

      const text = label
        ? label.slice(0, 80)
        : el.getAttribute("contenteditable") === "true"
          ? "text editor area"
          : `${tag} field (empty)`;

      let href: string | undefined;
      if (tag === "a") {
        const rawHref = (el as HTMLAnchorElement).href;
        // Real bug found from a live trace: Google Maps (and similar sites)
        // embed hundreds of characters of tracking/encoded data in every
        // link's href. With up to 25 elements on a page, that alone was
        // several thousand characters, and "recent" tool results were kept
        // uncapped, so a single Maps page could exceed the whole token
        // budget by itself. A long href is dropped; the element is still
        // clickable via its id either way.
        if (rawHref && !rawHref.startsWith("javascript:") && rawHref.length <= 200) href = rawHref;
      }

      results.push({ id, text, href });
      if (results.length >= 25) break; // keep the payload small — see the TPM note above
    }
    return results;
}

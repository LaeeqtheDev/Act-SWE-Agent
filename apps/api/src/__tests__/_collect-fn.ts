
// The REAL shipped logic, extracted verbatim from collectInteractiveElements.
export function collect(): { selector: string; text: string; href?: string }[] {

    const els = Array.from(document.querySelectorAll('a, button, input, textarea, select, [role="button"], [role="link"], [role="tab"], [contenteditable="true"]'));
    const results: { selector: string; text: string; href?: string }[] = [];
    for (const el of els) {
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) continue; // skip hidden elements
      const label =
        el.getAttribute("aria-label") ||
        (el as HTMLElement).innerText?.trim() ||
        el.textContent?.trim() ||
        el.getAttribute("placeholder") ||
        el.getAttribute("name") ||
        el.getAttribute("title") ||
        "";

      const tag = el.tagName.toLowerCase();
      const role = el.getAttribute("role");
      const isTextInput =
        tag === "textarea" ||
        el.getAttribute("contenteditable") === "true" ||
        (tag === "input" && !["hidden", "submit", "button", "checkbox", "radio"].includes((el as HTMLInputElement).type));

      // An empty <textarea> — a notepad, a comment box, a message field —
      // has no label, no placeholder, and no name. It was being skipped
      // entirely, so the agent could see the page but never saw anywhere to
      // type, and would go off searching for a selector instead. Text
      // inputs now always get an entry, labelled by what they are.
      if (!label && !isTextInput) continue;

      let selector: string;
      let href: string | undefined;

      if (!label && isTextInput) {
        // Positional selector, since there's nothing to match on by name.
        // nth() is stable for the common case of one main editor per page.
        const sameKind = Array.from(document.querySelectorAll(tag === "textarea" ? "textarea" : tag));
        const index = sameKind.indexOf(el);
        const editable = el.getAttribute("contenteditable") === "true";
        results.push({
          selector: editable ? `[contenteditable="true"] >> nth=${index}` : `${tag} >> nth=${index}`,
          text: editable ? "text editor area" : `${tag} field (empty)`,
        });
        if (results.length >= 25) break;
        continue;
      }

      const trimmed = label.slice(0, 60);

      // The label shown to the model is truncated to 60 chars to keep the
      // payload small — but role=NAME matching is EXACT, so a truncated name
      // never matches anything. That silently broke every click on any
      // element with a long label (YouTube video titles, job listings...).
      // Using the first 40 chars as a substring match (i=case-insensitive)
      // finds the real element instead.
      const nameMatch = `/${label.slice(0, 40).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}/i`;

      if (role === "button" || tag === "button") selector = `role=button[name=${nameMatch}]`;
      else if (tag === "a" || role === "link") {
        selector = `role=link[name=${nameMatch}]`;
        // A plain link's destination is just another URL — no reason to
        // require an approval to "click" it when browseWeb can go straight
        // there. This is what cuts the unnecessary approval friction for
        // pure navigation, reserving the gate for things that actually
        // submit, send, or change something.
        const rawHref = (el as HTMLAnchorElement).href;
        // Real bug found from a live trace: Google Maps (and similar sites)
        // embed hundreds of characters of tracking/encoded data in every
        // link's href. With up to 25 elements on a page, that alone was
        // several thousand characters — and because "recent" tool results
        // were kept completely uncapped, a single Maps page could exceed
        // the entire token budget by itself, no matter how well history was
        // trimmed. A long href is dropped; the element is still clickable
        // via its selector, which doesn't carry this cost.
        if (rawHref && !rawHref.startsWith("javascript:") && rawHref.length <= 200) href = rawHref;
      } else if (tag === "input" || tag === "textarea" || tag === "select" || el.getAttribute("contenteditable") === "true") {
        // A `text=` selector matches an element's VISIBLE TEXT CONTENT —
        // which a form field never has. Using it for inputs meant the
        // selector silently matched some other element containing that word
        // instead (on Google, the label "Search" matched the "How Search
        // works" footer LINK), so typing navigated away rather than typing.
        // Match on the accessible role/name, which is what actually
        // identifies a field, and fall back to a positional selector.
        const sameTag = Array.from(document.querySelectorAll(tag));
        const idx = sameTag.indexOf(el);
        // Use the element's OWN role when it declares one. Google's search
        // box is a <textarea role="combobox">, so hardcoding "textbox" here
        // produced a selector that matched nothing at all — which is
        // exactly why typing silently did nothing on google.com.
        const explicitRole = el.getAttribute("role");
        const inputRole = explicitRole || (tag === "select" ? "combobox" : "textbox");
        selector = label ? `role=${inputRole}[name=${nameMatch}]` : `${tag} >> nth=${idx}`;
      } else selector = `text=${nameMatch}`;
      results.push({ selector, text: trimmed, href });
      if (results.length >= 25) break; // keep the payload small — see the TPM note above
    }
    return results;
}

const providerReferralKeys = /^(?:ref|referrer|source)$/iu;
const providerReferralValues = /^(?:openai|chatgpt)(?:\.com)?$/iu;

export function cleanSourceUrl(raw: string) {
  try {
    const url = new URL(raw);
    if (
      (url.protocol === "https:" || url.protocol === "http:") &&
      !url.username &&
      !url.password
    ) {
      const query = url.search.slice(1);
      const parts = query.split("&");
      const kept = parts.filter((part) => {
        const entry = new URLSearchParams(`?${part}`).entries().next().value;
        if (!entry) return true;
        const [name, value] = entry;
        return !(
          /^utm_/iu.test(name) ||
          (providerReferralKeys.test(name) && providerReferralValues.test(value))
        );
      });
      // Keep the original encoding and order for functional query parameters.
      if (kept.length !== parts.length) {
        const search = kept.filter(Boolean).join("&");
        url.search = search ? `?${search}` : "";
      }
      return url.href;
    }
  } catch {
    // An invalid citation cannot be published as a link.
  }
}

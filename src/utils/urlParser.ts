/**
 * Utility to extract OpenProject Work Package (ticket) ID from various inputs:
 * - Full URLs: https://openproject.fingent.net/projects/ixm-d365-integration/work_packages/407348/activity
 * - Query params: ?ticket=407348 or ?url=...
 * - Text containing a ticket reference: "Check #407348" or "407348"
 */
export function extractTicketIdFromUrlOrText(input: string | null | undefined): number | null {
  if (!input) return null;
  const decoded = decodeURIComponent(input.trim());

  // 1. Match /(work_packages|tickets|wp)/<id> (case insensitive)
  const wpMatch = decoded.match(/(?:work_packages|tickets|wp)\/(\d+)/i);
  if (wpMatch && wpMatch[1]) {
    return parseInt(wpMatch[1], 10);
  }

  // 2. Match query params or labels like ticket=407348 or id=407348 or "ticket 407348"
  const paramMatch = decoded.match(/(?:ticket|id|wp|workPackageId)[\s=\/:]*#?(\d+)/i);
  if (paramMatch && paramMatch[1]) {
    return parseInt(paramMatch[1], 10);
  }

  // 3. Match #<id>
  const hashMatch = decoded.match(/#(\d+)/);
  if (hashMatch && hashMatch[1]) {
    return parseInt(hashMatch[1], 10);
  }

  // 4. Exact digit match (e.g. "407348")
  const exactMatch = decoded.match(/^(\d{3,8})$/);
  if (exactMatch && exactMatch[1]) {
    return parseInt(exactMatch[1], 10);
  }

  // 5. Standalone 5-7 digit number in text
  const standaloneMatch = decoded.match(/\b(\d{5,7})\b/);
  if (standaloneMatch && standaloneMatch[1]) {
    return parseInt(standaloneMatch[1], 10);
  }

  return null;
}

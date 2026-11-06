/**
 * Preprocesses OpenProject HTML/Markdown description so images and markup render correctly.
 * Converts raw HTML <img ...> tags into Markdown image syntax ![alt](src) and strips figure wrappers.
 */
export function preprocessOpenProjectMarkdown(content?: string): string {
  if (!content) return '';
  let processed = content;

  // Replace non-breaking spaces
  processed = processed.replace(/&nbsp;/g, ' ');

  // Convert raw HTML <img ...> tags into Markdown image syntax: ![alt](url)
  processed = processed.replace(/<img\b([^>]*?)>/gi, (_match, attrs) => {
    const srcMatch = attrs.match(/\bsrc=["']([^"']+)["']/i);
    if (!srcMatch || !srcMatch[1]) return '';
    const src = srcMatch[1];
    const altMatch = attrs.match(/\balt=["']([^"']*)["']/i);
    const alt = (altMatch && altMatch[1]) ? altMatch[1] : 'Attachment';
    return `\n\n![${alt}](${src})\n\n`;
  });

  // Strip wrapping <figure> tags from CKEditor 5
  processed = processed.replace(/<\/?figure\b[^>]*>/gi, '');

  return processed;
}

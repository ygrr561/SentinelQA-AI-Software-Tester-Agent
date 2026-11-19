import type { Locator, Page } from 'playwright-core';
import type { StepLocator } from '../schemas/testPlan.ts';

type AriaRole = Parameters<Page['getByRole']>[0];

const VALID_ARIA_ROLES = new Set<string>([
  'alert',
  'alertdialog',
  'application',
  'article',
  'banner',
  'blockquote',
  'button',
  'caption',
  'cell',
  'checkbox',
  'code',
  'columnheader',
  'combobox',
  'complementary',
  'contentinfo',
  'definition',
  'deletion',
  'dialog',
  'directory',
  'document',
  'emphasis',
  'feed',
  'figure',
  'form',
  'generic',
  'grid',
  'gridcell',
  'group',
  'heading',
  'img',
  'insertion',
  'link',
  'list',
  'listbox',
  'listitem',
  'log',
  'main',
  'marquee',
  'math',
  'meter',
  'menu',
  'menubar',
  'menuitem',
  'menuitemcheckbox',
  'menuitemradio',
  'navigation',
  'none',
  'note',
  'option',
  'paragraph',
  'presentation',
  'progressbar',
  'radio',
  'radiogroup',
  'region',
  'row',
  'rowgroup',
  'rowheader',
  'scrollbar',
  'search',
  'searchbox',
  'separator',
  'slider',
  'spinbutton',
  'status',
  'strong',
  'subscript',
  'superscript',
  'switch',
  'tab',
  'table',
  'tablist',
  'tabpanel',
  'term',
  'textbox',
  'time',
  'timer',
  'toolbar',
  'tooltip',
  'tree',
  'treegrid',
  'treeitem',
]);

export function formatLocatorSummary(locator?: StepLocator): string {
  if (!locator) return 'page';
  if (locator.strategy === 'role') {
    return `role=${locator.role || 'button'}[name="${locator.value}"]`;
  }
  return `${locator.strategy}="${locator.value}"`;
}

/**
 * Resolves a structured StepLocator into a Playwright Locator, preferring
 * accessible Playwright locator APIs (getByRole, getByLabel, getByPlaceholder, getByText).
 */
export async function resolveLocator(
  page: Page,
  locator: StepLocator,
  options: { allowFallback?: boolean } = {}
): Promise<Locator> {
  const exact = locator.exact ?? false;
  const allowFallback = options.allowFallback ?? true;

  const primary = buildPrimaryLocator(page, locator, exact);
  if (!allowFallback) {
    return primary.first();
  }

  try {
    const count = await primary.count();
    if (count > 0) {
      return primary.first();
    }
  } catch {
    // Try resilient accessible fallbacks below
  }

  // Fallback chain using accessible queries before giving up
  const fallbacks: Locator[] = [];
  if (locator.strategy === 'role' && locator.value) {
    fallbacks.push(page.getByText(locator.value, { exact: false }));
    fallbacks.push(page.getByLabel(locator.value, { exact: false }));
    fallbacks.push(page.getByPlaceholder(locator.value, { exact: false }));
  } else if (locator.strategy === 'label') {
    fallbacks.push(page.getByPlaceholder(locator.value, { exact: false }));
    fallbacks.push(page.getByRole('textbox', { name: locator.value, exact: false }));
  } else if (locator.strategy === 'placeholder') {
    fallbacks.push(page.getByLabel(locator.value, { exact: false }));
  } else if (locator.strategy === 'text') {
    fallbacks.push(page.getByRole('button', { name: locator.value, exact: false }));
    fallbacks.push(page.getByRole('link', { name: locator.value, exact: false }));
  }

  for (const fb of fallbacks) {
    try {
      if ((await fb.count()) > 0) {
        return fb.first();
      }
    } catch {
      // continue
    }
  }

  return primary.first();
}

function buildPrimaryLocator(page: Page, locator: StepLocator, exact: boolean): Locator {
  switch (locator.strategy) {
    case 'role': {
      const normalizedRole = (locator.role || 'button').toLowerCase();
      const safeRole = VALID_ARIA_ROLES.has(normalizedRole) ? (normalizedRole as AriaRole) : 'button';
      return page.getByRole(safeRole, { name: locator.value, exact });
    }
    case 'label':
      return page.getByLabel(locator.value, { exact });
    case 'placeholder':
      return page.getByPlaceholder(locator.value, { exact });
    case 'text':
      return page.getByText(locator.value, { exact });
    case 'testid':
      return page.getByTestId(locator.value);
    case 'css':
      return page.locator(locator.value);
    default:
      return page.getByText(locator.value, { exact: false });
  }
}

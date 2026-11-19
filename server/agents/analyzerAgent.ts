import crypto from 'node:crypto';
import type { ExtractedElement, ExtractedForm, PageAnalysis, StepLocator } from '../schemas/testPlan.ts';
import { createBrowserSession, capturePageScreenshot } from '../browser/playwrightManager.ts';
import { validateTargetUrl } from '../core/security.ts';

interface RawExtractedElement {
  tag: string;
  role: string;
  name: string;
  label: string;
  placeholder: string;
  type: string;
  id: string;
  testId: string;
  href: string;
  required: boolean;
  disabled: boolean;
  options?: string[];
  formIndex: number;
}

function chooseRecommendedLocator(el: RawExtractedElement): StepLocator {
  if (el.testId) {
    return { strategy: 'testid', value: el.testId };
  }
  if (el.label) {
    return { strategy: 'label', value: el.label };
  }
  if (el.role && el.name && ['button', 'link', 'tab', 'checkbox', 'radio', 'combobox', 'textbox', 'searchbox'].includes(el.role)) {
    return { strategy: 'role', role: el.role, value: el.name };
  }
  if (el.placeholder) {
    return { strategy: 'placeholder', value: el.placeholder };
  }
  if (el.name) {
    return { strategy: 'text', value: el.name };
  }
  if (el.id) {
    return { strategy: 'css', value: `#${el.id}` };
  }
  return { strategy: 'css', value: el.tag };
}

function toExtractedElement(raw: RawExtractedElement): ExtractedElement {
  return {
    tag: raw.tag,
    role: raw.role,
    name: raw.name,
    label: raw.label,
    placeholder: raw.placeholder,
    type: raw.type,
    id: raw.id,
    testId: raw.testId,
    href: raw.href,
    required: raw.required,
    disabled: raw.disabled,
    options: raw.options,
    recommendedLocator: chooseRecommendedLocator(raw),
  };
}

/**
 * Web Analyzer Agent:
 * Opens the target URL in real headless Chromium via Playwright and extracts a
 * bounded, accessible-first semantic representation of the interface.
 */
export async function analyzeWebApplication(params: {
  url: string;
  runId?: string;
  allowLocalhostOverride?: boolean;
}): Promise<{ analysis: PageAnalysis; normalizedUrl: string; isBuiltinSandbox: boolean }> {
  const started = Date.now();
  const validation = await validateTargetUrl(params.url, {
    allowLocalhostOverride: params.allowLocalhostOverride,
  });

  if (!validation.allowed || !validation.normalizedUrl) {
    throw new Error(validation.reason || 'Target URL rejected by security policy.');
  }

  const session = await createBrowserSession({
    isBuiltinSandbox: validation.isBuiltinSandbox,
    allowLocalhostOverride: params.allowLocalhostOverride,
  });

  try {
    const response = await session.page.goto(validation.normalizedUrl, {
      waitUntil: 'domcontentloaded',
      timeout: 22000,
    });

    // Give SPAs a brief window to hydrate visible elements
    await session.page.waitForTimeout(500);

    const status = response?.status() ?? 200;
    const warnings: string[] = [];
    if (status >= 400) {
      warnings.push(`Initial navigation returned HTTP ${status}.`);
    }

    const extracted = await session.page.evaluate<{
      title: string;
      finalUrl: string;
      headings: Array<{ level: string; text: string }>;
      landmarks: string[];
      buttons: RawExtractedElement[];
      inputs: RawExtractedElement[];
      selects: RawExtractedElement[];
      checkboxes: RawExtractedElement[];
      links: RawExtractedElement[];
      formsMeta: Array<{ index: number; id: string; name: string; action: string; method: string }>;
      visibleTextExcerpt: string;
      hasCaptcha: boolean;
      hasPayment: boolean;
    }>(`(() => {
      function isVisible(el) {
        var style = window.getComputedStyle(el);
        if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
          return false;
        }
        var rect = el.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      }

      function clean(val, max) {
        var limit = max || 120;
        return (val || '').replace(/\\s+/g, ' ').trim().slice(0, limit);
      }

      function getLabelText(el) {
        var ariaLabel = clean(el.getAttribute('aria-label'));
        if (ariaLabel) return ariaLabel;

        var labelledBy = el.getAttribute('aria-labelledby');
        if (labelledBy) {
          var text = labelledBy
            .split(/\\s+/)
            .map(function (id) {
              var target = document.getElementById(id);
              return target ? target.textContent || '' : '';
            })
            .join(' ');
          if (clean(text)) return clean(text);
        }

        var id = el.getAttribute('id');
        if (id) {
          var explicit = document.querySelector('label[for="' + CSS.escape(id) + '"]');
          if (explicit && clean(explicit.textContent)) {
            return clean(explicit.textContent);
          }
        }

        var wrapping = el.closest('label');
        if (wrapping) {
          var clone = wrapping.cloneNode(true);
          clone.querySelectorAll('input, select, textarea').forEach(function (n) { n.remove(); });
          var t = clean(clone.textContent);
          if (t) return t;
        }
        return '';
      }

      function inferRole(el) {
        var explicit = clean(el.getAttribute('role'));
        if (explicit) return explicit.toLowerCase();
        var tag = el.tagName.toLowerCase();
        if (tag === 'a' && el.hasAttribute('href')) return 'link';
        if (tag === 'button') return 'button';
        if (tag === 'select') return 'combobox';
        if (tag === 'textarea') return 'textbox';
        if (tag === 'input') {
          var type = (el.getAttribute('type') || 'text').toLowerCase();
          if (type === 'submit' || type === 'button' || type === 'reset') return 'button';
          if (type === 'checkbox') return 'checkbox';
          if (type === 'radio') return 'radio';
          if (type === 'search') return 'searchbox';
          return 'textbox';
        }
        return tag;
      }

      var formsList = Array.from(document.querySelectorAll('form')).slice(0, 10);

      function findFormIndex(el) {
        var form = el.closest('form');
        return form ? formsList.indexOf(form) : -1;
      }

      function mapEl(el) {
        var tag = el.tagName.toLowerCase();
        var type = tag === 'input' ? (el.getAttribute('type') || 'text').toLowerCase() : tag;
        var label = getLabelText(el);
        var placeholder = clean(el.getAttribute('placeholder'));
        var textName =
          tag === 'input' && (type === 'submit' || type === 'button' || type === 'reset')
            ? clean(el.value)
            : clean(el.innerText || el.textContent);
        var name = label || clean(el.getAttribute('aria-label')) || textName || placeholder || clean(el.getAttribute('name'));
        var options =
          tag === 'select'
            ? Array.from(el.options)
                .slice(0, 12)
                .map(function (o) { return clean(o.text || o.value, 60); })
                .filter(Boolean)
            : undefined;

        return {
          tag: tag,
          role: inferRole(el),
          name: name,
          label: label,
          placeholder: placeholder,
          type: type,
          id: clean(el.getAttribute('id'), 60),
          testId: clean(el.getAttribute('data-testid') || el.getAttribute('data-test'), 60),
          href: tag === 'a' ? clean(el.getAttribute('href'), 160) : '',
          required: el.hasAttribute('required') || el.getAttribute('aria-required') === 'true',
          disabled: el.hasAttribute('disabled') || el.getAttribute('aria-disabled') === 'true',
          options: options,
          formIndex: findFormIndex(el)
        };
      }

      var headings = Array.from(document.querySelectorAll('h1, h2, h3'))
        .filter(isVisible)
        .slice(0, 15)
        .map(function (h) { return { level: h.tagName.toLowerCase(), text: clean(h.textContent, 120) }; })
        .filter(function (h) { return h.text.length > 0; });

      var landmarks = Array.from(
        new Set(
          Array.from(document.querySelectorAll('header, nav, main, footer, aside, [role="navigation"], [role="main"], [role="search"], [role="tablist"]'))
            .filter(isVisible)
            .map(function (el) { return el.getAttribute('role') || el.tagName.toLowerCase(); })
        )
      ).slice(0, 10);

      var buttons = Array.from(
        document.querySelectorAll('button, input[type="submit"], input[type="button"], [role="button"], [role="tab"]')
      )
        .filter(isVisible)
        .slice(0, 35)
        .map(mapEl)
        .filter(function (e) { return e.name.length > 0 || e.id.length > 0 || e.testId.length > 0; });

      var inputs = Array.from(
        document.querySelectorAll('input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="checkbox"]):not([type="radio"]), textarea')
      )
        .filter(isVisible)
        .slice(0, 30)
        .map(mapEl);

      var selects = Array.from(document.querySelectorAll('select'))
        .filter(isVisible)
        .slice(0, 15)
        .map(mapEl);

      var checkboxes = Array.from(document.querySelectorAll('input[type="checkbox"], input[type="radio"]'))
        .filter(isVisible)
        .slice(0, 20)
        .map(mapEl);

      var links = Array.from(document.querySelectorAll('a[href]'))
        .filter(isVisible)
        .slice(0, 30)
        .map(mapEl)
        .filter(function (e) { return e.name.length > 0; });

      var formsMeta = formsList.map(function (f, idx) {
        return {
          index: idx,
          id: clean(f.getAttribute('id'), 60) || 'form-' + (idx + 1),
          name: clean(f.getAttribute('aria-label') || f.getAttribute('name') || f.getAttribute('id'), 80) || 'Form ' + (idx + 1),
          action: clean(f.getAttribute('action'), 140),
          method: (f.getAttribute('method') || 'GET').toUpperCase()
        };
      });

      var visibleTextExcerpt = clean(document.body ? document.body.innerText : '', 1800);
      var bodyLower = visibleTextExcerpt.toLowerCase();
      var hasCaptcha = Boolean(
        document.querySelector('iframe[src*="recaptcha"], iframe[src*="hcaptcha"], .g-recaptcha, [data-sitekey]') ||
          /i am not a robot|verify you are human|captcha/i.test(bodyLower)
      );
      var hasPayment = Boolean(
        document.querySelector('input[autocomplete*="cc-"], input[name*="cardnumber"], iframe[src*="stripe"]') ||
          /credit card number|cvv|billing address/i.test(bodyLower)
      );

      return {
        title: document.title || '(Untitled Page)',
        finalUrl: window.location.href,
        headings: headings,
        landmarks: landmarks,
        buttons: buttons,
        inputs: inputs,
        selects: selects,
        checkboxes: checkboxes,
        links: links,
        formsMeta: formsMeta,
        visibleTextExcerpt: visibleTextExcerpt,
        hasCaptcha: hasCaptcha,
        hasPayment: hasPayment
      };
    })()`);

    const mappedButtons = extracted.buttons.map(toExtractedElement);
    const mappedInputs = extracted.inputs.map(toExtractedElement);
    const mappedSelects = extracted.selects.map(toExtractedElement);
    const mappedCheckboxes = extracted.checkboxes.map(toExtractedElement);
    const mappedLinks = extracted.links.map(toExtractedElement);

    const forms: ExtractedForm[] = extracted.formsMeta.map((fm) => {
      const fields = [
        ...extracted.inputs.filter((i) => i.formIndex === fm.index).map(toExtractedElement),
        ...extracted.selects.filter((s) => s.formIndex === fm.index).map(toExtractedElement),
        ...extracted.checkboxes.filter((c) => c.formIndex === fm.index).map(toExtractedElement),
      ];
      const submitButtons = extracted.buttons
        .filter((b) => b.formIndex === fm.index)
        .map(toExtractedElement);
      return {
        id: fm.id,
        name: fm.name,
        action: fm.action,
        method: fm.method,
        fields,
        submitButtons,
      };
    });

    const detectedFeatures: string[] = [];
    const combinedText = `${extracted.title} ${extracted.visibleTextExcerpt}`.toLowerCase();
    if (mappedInputs.some((i) => i.type === 'password')) detectedFeatures.push('Authentication / Password Input');
    if (forms.length > 0) detectedFeatures.push(`${forms.length} Interactive Form(s)`);
    if (mappedInputs.some((i) => i.type === 'search' || /search|filter/i.test(i.name + i.placeholder))) {
      detectedFeatures.push('Search / Filter Interface');
    }
    if (mappedLinks.length >= 2 || extracted.landmarks.includes('nav') || extracted.landmarks.includes('tablist')) {
      detectedFeatures.push('Navigation / Tabbed Sections');
    }
    if (mappedSelects.length > 0) detectedFeatures.push('Dropdown Select Controls');
    if (mappedCheckboxes.length > 0) detectedFeatures.push('Checkbox / Toggle Controls');
    if (/register|sign up|create account/i.test(combinedText)) detectedFeatures.push('Registration Workflow');

    if (extracted.hasCaptcha) {
      warnings.push('CAPTCHA detected on page. Security policy prohibits bypassing CAPTCHA controls.');
    }
    if (extracted.hasPayment) {
      warnings.push('Payment form fields detected. Security policy blocks submitting real payment forms.');
    }

    let initialScreenshotFile: string | undefined;
    try {
      const shotId = params.runId || `scan_${crypto.randomBytes(3).toString('hex')}`;
      const shot = await capturePageScreenshot(session.page, shotId, 'initial_analysis');
      initialScreenshotFile = shot.filename;
    } catch {
      warnings.push('Initial preview screenshot could not be captured.');
    }

    const analysis: PageAnalysis = {
      url: params.url,
      finalUrl: extracted.finalUrl,
      title: extracted.title,
      analyzedAt: new Date().toISOString(),
      analysisDurationMs: Date.now() - started,
      headings: extracted.headings,
      visibleTextExcerpt: extracted.visibleTextExcerpt,
      landmarks: extracted.landmarks,
      forms,
      buttons: mappedButtons,
      inputs: mappedInputs,
      links: mappedLinks,
      selects: mappedSelects,
      checkboxes: mappedCheckboxes,
      detectedFeatures,
      initialScreenshotFile,
      hasCaptchaOrPaymentWarning: extracted.hasCaptcha || extracted.hasPayment,
      warnings,
    };

    return {
      analysis,
      normalizedUrl: validation.normalizedUrl,
      isBuiltinSandbox: validation.isBuiltinSandbox,
    };
  } finally {
    await session.close();
  }
}

'use strict';

(() => {
  const PREFIX = '[Open Soundcraft MIDI]';
  if (window.__openSoundcraftMidiContentInstalled) return;
  window.__openSoundcraftMidiContentInstalled = true;
  let picker = null;
  let pickerLanguage = 'de';
  let hoveredElement = null;
  let previousOutline = null;
  let lastPickerEventAt = 0;

  function humanLabel(element) {
    const candidates = [
      element.getAttribute('aria-label'),
      element.getAttribute('title'),
      element.getAttribute('name'),
      element.getAttribute('data-testid'),
      element.innerText,
      element.value,
      element.getAttribute('role')
    ];
    const value = candidates.find((item) => typeof item === 'string' && item.trim());
    const text = (value || element.tagName.toLowerCase()).trim().replace(/\s+/g, ' ');
    return text.slice(0, 80);
  }

  function quoteAttribute(value) {
    if (window.CSS && typeof CSS.escape === 'function') return CSS.escape(value);
    return value.replace(/[^a-zA-Z0-9_-]/g, (char) => `\\${char}`);
  }

  function selectorFor(element) {
    if (!(element instanceof Element)) return null;
    if (element.id) {
      const byId = `#${quoteAttribute(element.id)}`;
      if (document.querySelectorAll(byId).length === 1) return byId;
    }

    const parts = [];
    let node = element;
    for (let depth = 0; node && node.nodeType === Node.ELEMENT_NODE && depth < 7; depth += 1) {
      if (node.id) {
        parts.unshift(`#${quoteAttribute(node.id)}`);
        break;
      }
      const tag = node.tagName.toLowerCase();
      let part = tag;
      const usefulAttrs = ['aria-label', 'title', 'name', 'role', 'data-testid'];
      const attr = usefulAttrs.find((name) => node.hasAttribute(name));
      if (attr) {
        const attrValue = node.getAttribute(attr);
        const candidate = `${tag}[${attr}="${quoteAttribute(attrValue)}"]`;
        try {
          if (document.querySelectorAll(candidate).length === 1) {
            parts.unshift(candidate);
            break;
          }
        } catch (_) { /* Continue with a positional selector. */ }
      }
      if (node.parentElement) {
        const sameTag = Array.from(node.parentElement.children).filter((child) => child.tagName === node.tagName);
        if (sameTag.length > 1) part += `:nth-of-type(${sameTag.indexOf(node) + 1})`;
      }
      parts.unshift(part);
      const candidate = parts.join(' > ');
      try {
        if (document.querySelectorAll(candidate).length === 1) break;
      } catch (_) { /* Keep building the path. */ }
      node = node.parentElement;
    }
    return parts.join(' > ');
  }

  function guessMode(element) {
    if (element instanceof HTMLInputElement) {
      if (['range', 'number'].includes(element.type)) return 'fader';
      if (['checkbox', 'radio'].includes(element.type)) return 'toggle';
    }
    const role = element.getAttribute('role');
    if (role === 'slider' || element.hasAttribute('aria-valuenow')) return 'fader';
    const text = `${element.className || ''} ${element.getAttribute('aria-label') || ''} ${element.title || ''}`;
    if (/fader|slider|volume|gain|level|pan/i.test(String(text))) return 'fader';
    return 'toggle';
  }

  function getMixerCanvas() {
    const explicit = document.getElementById('mixer');
    if (explicit instanceof HTMLCanvasElement) return explicit;
    return [...document.querySelectorAll('canvas')]
      .map((canvas) => ({ canvas, rect: canvas.getBoundingClientRect() }))
      .filter(({ rect }) => rect.width > 20 && rect.height > 20)
      .sort((a, b) => (b.rect.width * b.rect.height) - (a.rect.width * a.rect.height))[0]?.canvas || null;
  }

  function pickableDomElement(target) {
    if (!(target instanceof Element)) return null;
    return target.closest('input,button,select,textarea,[role="button"],[role="slider"],[aria-valuenow],[tabindex],a,.slider,.fader,.volume-control') || target;
  }

  function domValue(element) {
    if (!element) return null;
    if (element instanceof HTMLInputElement && ['range', 'number'].includes(element.type)) {
      const min = element.min !== '' ? Number(element.min) : 0;
      const max = element.max !== '' ? Number(element.max) : 1;
      const value = Number(element.value);
      if (Number.isFinite(value) && max > min) return Math.max(0, Math.min(1, (value - min) / (max - min)));
    }
    if (!element.hasAttribute('aria-valuenow')) return null;
    const now = Number(element.getAttribute('aria-valuenow'));
    const min = Number(element.getAttribute('aria-valuemin') ?? 0);
    const max = Number(element.getAttribute('aria-valuemax') ?? 1);
    if (Number.isFinite(now) && Number.isFinite(min) && Number.isFinite(max) && max > min) return Math.max(0, Math.min(1, (now - min) / (max - min)));
    return null;
  }

  function setStatusBanner() {
    if (!picker) return;
    picker.banner.textContent = pickerLanguage === 'en' ? 'MIDI target: click a fader, button, switch or web control. Press ESC to cancel.' : 'MIDI-Ziel: Klicke auf einen Fader, Button, Schalter oder ein Webseiten-Steuerelement. ESC bricht ab.';
  }

  function teardownPicker() {
    if (!picker) return;
    document.removeEventListener('pointerdown', onPickerPointerDown, true);
    document.removeEventListener('mousedown', onPickerMouseDown, true);
    document.removeEventListener('keydown', onPickerKeyDown, true);
    picker.host.remove();
    picker = null;
    document.documentElement.style.cursor = '';
  }

  function isPickerChrome(element) {
    return Boolean(picker && (element === picker.host || picker.host.contains(element)));
  }

  // Intercept pointer events while picking so a real mixer control is not
  // accidentally changed. Canvas clicks are resolved against the mixer widget
  // tree; ordinary DOM controls use a stable CSS selector fallback.
  function onPickerPointerDown(event) {
    if (!picker || isPickerChrome(event.target)) return;
    event.stopImmediatePropagation();
  }

  function onPickerMouseDown(event) {
    if (!picker || isPickerChrome(event.target)) return;
    const canvas = getMixerCanvas();
    event.preventDefault();
    event.stopImmediatePropagation();
    if (canvas && event.target === canvas) {
      const target = {
        pageX: Number(event.pageX), pageY: Number(event.pageY),
        clientX: Number(event.clientX), clientY: Number(event.clientY)
      };
      teardownPicker();
      chrome.runtime.sendMessage({ type: 'TARGET_PICKED', target }).catch((error) => console.warn(PREFIX, error));
      return;
    }

    const element = pickableDomElement(event.target);
    if (!element || element === document.documentElement || element === document.body) {
      setStatusBanner();
      return;
    }
    const domTarget = {
      selector: selectorFor(element), label: humanLabel(element), mode: guessMode(element), tagName: element.tagName.toLowerCase()
    };
    if (!domTarget.selector) { setStatusBanner(); return; }
    teardownPicker();
    chrome.runtime.sendMessage({
      type: 'TARGET_PICKED',
      target: { pageX: Number(event.pageX), pageY: Number(event.pageY), clientX: Number(event.clientX), clientY: Number(event.clientY), domTarget }
    }).catch((error) => console.warn(PREFIX, error));
  }

  function onPickerKeyDown(event) {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopImmediatePropagation();
      teardownPicker();
      chrome.runtime.sendMessage({ type: 'PICKER_CANCELLED' }).catch(() => {});
    }
  }

  function startPicker(language = 'de') {
    teardownPicker();
    pickerLanguage = language === 'en' ? 'en' : 'de';
    const host = document.createElement('div');
    host.id = 'open-soundcraft-midi-picker-host';
    const shadow = host.attachShadow({ mode: 'open' });
    const style = document.createElement('style');
    style.textContent = `
      :host { all: initial; }
      .banner { position: fixed; z-index: 2147483647; left: 50%; top: 12px; transform: translateX(-50%); background: #17211a; color: #eafff0; border: 2px solid #4ade80; border-radius: 10px; padding: 12px 18px; box-shadow: 0 5px 28px #0009; font: 600 14px/1.35 system-ui, sans-serif; text-align: center; pointer-events: none; max-width: calc(100vw - 32px); }
    `;
    const banner = document.createElement('div');
    banner.className = 'banner';
    banner.textContent = pickerLanguage === 'en' ? 'MIDI target: click a fader, button, switch or web control. Press ESC to cancel.' : 'MIDI-Ziel: Klicke auf einen Fader, Button, Schalter oder ein Webseiten-Steuerelement. ESC bricht ab.';
    shadow.append(style, banner);
    document.documentElement.append(host);
    picker = { host, banner };
    document.documentElement.style.cursor = 'crosshair';
    document.addEventListener('pointerdown', onPickerPointerDown, true);
    document.addEventListener('mousedown', onPickerMouseDown, true);
    document.addEventListener('keydown', onPickerKeyDown, true);
  }

  function findSliderSurface(element) {
    if (!(element instanceof Element)) return null;
    return element.closest('input[type="range"], [role="slider"], [aria-valuenow], .slider, .fader, .range, .volume-control') || element;
  }

  function setNativeInput(element, normalized) {
    if (!(element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement)) return false;
    if (element instanceof HTMLInputElement && !['range', 'number'].includes(element.type)) return false;
    const min = Number.isFinite(Number(element.min)) && element.min !== '' ? Number(element.min) : 0;
    const max = Number.isFinite(Number(element.max)) && element.max !== '' ? Number(element.max) : 1;
    const value = min + Math.min(1, Math.max(0, normalized)) * (max - min);
    element.value = String(value);
    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  }

  function dispatchMouseLike(element, phase, x, y, buttons) {
    const common = { bubbles: true, cancelable: true, view: window, clientX: x, clientY: y, button: 0, buttons };
    const mouseType = ({ down: 'mousedown', move: 'mousemove', up: 'mouseup' })[phase];
    try {
      element.dispatchEvent(new PointerEvent(`pointer${phase}`, { ...common, pointerId: 1, pointerType: 'mouse', isPrimary: true }));
    } catch (_) { /* PointerEvent may not be supported by the target browser. */ }
    element.dispatchEvent(new MouseEvent(mouseType, common));
  }

  function setCustomFader(element, normalized) {
    const surface = findSliderSurface(element);
    if (!surface) return false;
    const rect = surface.getBoundingClientRect();
    if (rect.width < 4 || rect.height < 4) return false;
    const vertical = rect.height > rect.width;
    const x = vertical ? rect.left + rect.width / 2 : rect.left + normalized * rect.width;
    const y = vertical ? rect.bottom - normalized * rect.height : rect.top + rect.height / 2;
    const startX = rect.left + rect.width / 2;
    const startY = rect.top + rect.height / 2;
    dispatchMouseLike(surface, 'down', startX, startY, 1);
    dispatchMouseLike(surface, 'move', x, y, 1);
    dispatchMouseLike(surface, 'up', x, y, 0);
    return true;
  }

  function applyMapping(message) {
    const { mapping, value, pressed } = message;
    const language = message.language === 'en' ? 'en' : 'de';
    const text = (de, en) => language === 'en' ? en : de;
    if (!mapping || !mapping.target || !mapping.target.selector) return { ok: false, error: text('Zuordnung ohne CSS-Selektor.', 'Mapping has no CSS selector.') };
    let element;
    try {
      element = document.querySelector(mapping.target.selector);
    } catch (error) {
      return { ok: false, error: text(`Ungültiger Selektor: ${error.message}`, `Invalid selector: ${error.message}`) };
    }
    if (!element) return { ok: false, error: text(`Ziel nicht gefunden: ${mapping.target.selector}`, `Target not found: ${mapping.target.selector}`) };

    if (mapping.mode === 'fader') {
      const normalized = Math.min(1, Math.max(0, Number(value) / 127));
      const native = setNativeInput(element, normalized);
      const applied = native || setCustomFader(element, normalized);
      if (!applied) return { ok: false, error: text('Fader-Ziel konnte nicht bedient werden.', 'Could not control the fader target.') };
      return { ok: true };
    }

    if (mapping.mode === 'toggle' && pressed) {
      if (element instanceof HTMLInputElement && ['checkbox', 'radio'].includes(element.type)) {
        element.click();
      } else if (element instanceof HTMLButtonElement || element.getAttribute('role') === 'button' || element.tabIndex >= 0) {
        element.click();
      } else {
        element.click();
      }
      return { ok: true };
    }
    return { ok: true, ignored: true };
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (!message || typeof message.type !== 'string') return false;
    if (message.type === 'START_PICKER') {
      startPicker(message.language);
      sendResponse({ ok: true });
      return false;
    }
    if (message.type === 'CANCEL_PICKER') {
      teardownPicker();
      sendResponse({ ok: true });
      return false;
    }
    if (message.type === 'APPLY_MIDI_MAPPING') {
      sendResponse(applyMapping(message));
      return false;
    }
    if (message.type === 'READ_DOM_VALUES') {
      const values = (Array.isArray(message.targets) ? message.targets : []).map((item) => {
        let element = null;
        try { element = item.target && document.querySelector(item.target.selector); } catch (_) { /* Invalid selector. */ }
        return { id: item.id, value: domValue(element) };
      });
      sendResponse({ ok: true, values });
      return false;
    }
    if (message.type === 'READ_DOM_LABELS') {
      const labels = (Array.isArray(message.targets) ? message.targets : []).map((item) => {
        let element = null;
        try { element = item.target && document.querySelector(item.target.selector); } catch (_) { /* Invalid selector. */ }
        return { id: item.id, label: element ? humanLabel(element) : null };
      });
      sendResponse({ ok: true, labels });
      return false;
    }
    if (message.type === 'PING') {
      sendResponse({ ok: true, title: document.title, url: location.href, ready: Date.now() - lastPickerEventAt > 0 });
      return false;
    }
    return false;
  });
})();

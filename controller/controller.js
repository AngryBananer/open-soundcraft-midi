function soundcraftPageBridge(action, payload) {
  const language = payload && payload.language === 'en' ? 'en' : 'de';
  const text = (de, en) => language === 'en' ? en : de;
  const mainRoots = Array.isArray(window.widgets) ? window.widgets : [];
  const modalRoots = Array.isArray(window.mWidgets) ? window.mWidgets : [];

  function widgetName(widget) {
    return widget && typeof widget.widgetName === 'string' ? widget.widgetName : 'Widget';
  }

  function isCustomWidgetMethod(widget, method) {
    const base = window.Widget && window.Widget.prototype;
    return Boolean(widget && typeof widget[method] === 'function' && (!base || widget[method] !== base[method]));
  }

  function getWidgetPropertyName(parent, widget) {
    if (!parent || !widget) return null;
    try {
      return Object.keys(parent).find((name) => name !== 'widgets' && parent[name] === widget) || null;
    } catch (_) {
      return null;
    }
  }

  function getGlobalName(widget) {
    try {
      return widget && typeof widget.globalWidgetName === 'function' ? String(widget.globalWidgetName()) : '';
    } catch (_) {
      return '';
    }
  }

  function isStableChannelPrefix(prefix) {
    return typeof prefix === 'string' && /^(?:[ialfsp]\.\d+\.|m\.)$/i.test(prefix.trim());
  }

  function inferChannelPrefixFromTarget(target) {
    if (!target) return '';
    if (isStableChannelPrefix(target.channelPrefix)) return target.channelPrefix.trim();
    if (isStableChannelPrefix(target.ownerName)) return target.ownerName.trim();
    const keyMatch = typeof target.key === 'string' && target.key.match(/^((?:[ialfsp]\.\d+\.|m\.))/i);
    if (keyMatch) return keyMatch[1];
    if (Array.isArray(target.path)) {
      for (let i = target.path.length - 1; i >= 0; i -= 1) {
        const segment = target.path[i];
        if (isStableChannelPrefix(segment && segment.name)) return segment.name.trim();
        const segmentKey = segment && typeof segment.key === 'string' && segment.key.match(/^((?:[ialfsp]\.\d+\.|m\.))/i);
        if (segmentKey) return segmentKey[1];
        const widgetNameMatch = segment && typeof segment.widgetName === 'string' && segment.widgetName.match(/(?:Strip|Channel)\(((?:[ialfsp]\.\d+\.|m\.))\)/i);
        if (widgetNameMatch) return widgetNameMatch[1];
      }
    }
    const globalMatch = typeof target.globalName === 'string' && target.globalName.match(/(?:Strip|Channel)\(((?:[ialfsp]\.\d+\.|m\.))\)/i);
    return globalMatch ? globalMatch[1] : '';
  }

  function getChannelPrefix(widget, target = null) {
    for (let current = widget, depth = 0; current && depth < 16; depth += 1, current = current.parent) {
      const prefix = typeof current.name === 'string' ? current.name.trim() : '';
      // Soundcraft strip prefixes are stable identifiers (for example i.7., a.0., f.1. or m.).
      // The display name is stored separately in the `<prefix>name` parameter.
      if (isStableChannelPrefix(prefix) && /strip|channel/i.test(widgetName(current))) return prefix;
    }
    // A stored prefix allows labels to survive firmware redraws or when the
    // individual button widget has been rebuilt/replaced.
    return inferChannelPrefixFromTarget(target);
  }

  function findStripByPrefix(prefix, chain = []) {
    if (!isStableChannelPrefix(prefix)) return null;
    const inChain = chain.find((item) => item && typeof item.name === 'string' && item.name.trim() === prefix.trim());
    if (inChain) return inChain;
    return getAllWidgets().map((item) => item.widget).find((item) => item && typeof item.name === 'string'
      && item.name.trim() === prefix.trim() && /strip|channel/i.test(widgetName(item))) || null;
  }

  function getChannelName(widget, savedPrefix = '') {
    const chain = [];
    for (let current = widget, depth = 0; current && depth < 16; depth += 1, current = current.parent) chain.push(current);
    // Prefer the Soundcraft strip's own getName() API. It returns the live name
    // and handles firmware-specific default names. Saved channel prefixes and
    // the page parameter API keep name refresh working even if a button widget
    // has been rebuilt or no longer resolves using its original hierarchy path.
    const prefix = getChannelPrefix(widget, { channelPrefix: savedPrefix });
    const strip = findStripByPrefix(prefix, chain)
      || chain.find((item) => /strip|channel/i.test(widgetName(item)) && typeof item.name === 'string' && item.name.trim());
    if (strip && typeof strip.getName === 'function') {
      try {
        const name = strip.getName();
        if (typeof name === 'string' && name.trim()) return name.trim();
      } catch (_) { /* Continue with the parameter API. */ }
    }
    if (prefix && typeof window.getValue === 'function') {
      try {
        const name = window.getValue(`${prefix.replace(/\.$/, '')}.name`);
        if (typeof name === 'string' && name.trim()) return name.trim();
      } catch (_) { /* Fall through to other supported name APIs. */ }
    }
    if (strip && typeof strip.getNameValue === 'function') {
      try {
        const name = strip.getNameValue('name');
        if (typeof name === 'string' && name.trim()) return name.trim();
      } catch (_) { /* Continue with display text. */ }
    }
    if (strip && typeof strip.text === 'string' && strip.text.trim()) return strip.text.trim();
    // Last resort for firmware widgets whose strip does not implement getName().
    for (const current of chain) {
      if (current === strip || typeof current.getName !== 'function') continue;
      try {
        const name = current.getName();
        if (typeof name === 'string' && name.trim() && name.trim() !== 'generic widget label') return name.trim();
      } catch (_) { /* Some non-channel widgets implement getName without a value. */ }
    }
    return '';
  }

  function currentWidgetValue(widget) {
    let value;
    try {
      if (widget && typeof widget.getVal === 'function') value = widget.getVal();
      else if (widget && typeof widget.getValue === 'function') value = widget.getValue();
      else if (widget && typeof widget.key === 'string' && typeof window.getValue === 'function') value = window.getValue(widget.key);
      else if (widget && Number.isFinite(Number(widget.value))) value = Number(widget.value);
    } catch (_) { return null; }
    if (value === null || value === undefined || value === '') return null;
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return null;
    // Mixer faders/sliders normally expose normalized values from 0.0 to 1.0.
    return Math.max(0, Math.min(1, numeric));
  }

  function tailOfKey(key) {
    return typeof key === 'string' && key ? key.split('.').filter(Boolean).pop() || '' : '';
  }

  function friendlyControlName(widget, propertyName) {
    const keyTail = tailOfKey(widget && widget.key).toLowerCase();
    const property = String(propertyName || '').toLowerCase();
    const param = String(widget && widget.param || '').toLowerCase();
    const names = {
      mute: 'Mute', solo: 'Solo', sl: text('Fader', 'Fader'), slider: text('Fader', 'Fader'), mix: text('Fader', 'Fader'), value: text('Fader', 'Fader'),
      level: text('Fader', 'Fader'), fader: text('Fader', 'Fader'), pan: 'Pan', panslider: 'Pan', gain: text('Verstärkung', 'Gain'), slgain: text('Verstärkung', 'Gain'),
      post: 'Pre/Post', postproc: 'Pre/Post Proc', phantom: '48 V', hiz: 'Hi-Z', polarity: text('Polarität', 'Polarity'),
      rec: text('Aufnahme', 'Record'), record: text('Aufnahme', 'Record'), play: text('Wiedergabe', 'Play'), stop: text('Stopp', 'Stop'), pre: 'Pre/Post',
      delay: text('Verzögerung', 'Delay'), phantompower: '48 V', bypass: 'Bypass', stereo: 'Stereo'
    };
    const semantic = [property, keyTail, param, widgetName(widget).toLowerCase()]
      .map((token) => token.replace(/[^a-z0-9]/g, ''))
      .find((token) => names[token]);
    if (semantic) return names[semantic];
    const widgetText = widget && [widget.text, widget.label, widget.title].find((value) => typeof value === 'string' && value.trim());
    if (widgetText) return widgetText.trim().replace(/\s+/g, ' ').slice(0, 60);
    if (widget && Array.isArray(widget.items) && widget.items.length) {
      return widget.items.slice(0, 4).map((item) => String(item)).join(' / ').slice(0, 60);
    }
    const token = property || keyTail || widgetName(widget);
    return token.replace(/[_-]+/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, (c) => c.toUpperCase());
  }

  function isFaderWidget(widget) {
    if (!widget) return false;
    const name = widgetName(widget);
    const looksLikeControl = /slider|knob|fader/i.test(name);
    const hasSetter = typeof widget.setValue === 'function' || typeof widget.setVal === 'function';
    const hasParameter = typeof widget.key === 'string' && widget.key.length > 0;
    // Only select controls with a real backing parameter. This avoids mapping
    // decorative knobs/meters whose visual value is not connected to the mixer.
    return looksLikeControl && hasSetter && hasParameter;
  }

  function isButtonWidget(widget) {
    if (!widget || isFaderWidget(widget)) return false;
    const name = widgetName(widget);
    const custom = (method) => isCustomWidgetMethod(widget, method);
    const actionCallbacks = ['onPress', 'onToggle', 'onToggleUp', 'onToggleDown', 'doClick', 'valueFunc', 'onSelect', 'click'];
    const hasActionCallback = actionCallbacks.some(custom);
    const hasPointerAction = custom('onDown') || custom('onUp');
    // The interface reuses the name "CheckBox" for a non-interactive indicator, so
    // a class-name match alone is insufficient: require a real action handler.
    const knownControlName = /(button|checkbox|switchbox|stereosel|^radio$|inputbox|submenu|pedal|^lock$|^led$|menu_|show_menu|^r_grid$)/i.test(name);
    if (knownControlName && (hasActionCallback || hasPointerAction)) return true;
    if (hasActionCallback) return true;
    // Include non-standard one-shot controls, but not draggable graphs/sliders.
    return custom('onDown') && !custom('onMove');
  }

  function globalPosition(widget, axis) {
    const method = axis === 'x' ? 'globalX' : 'globalY';
    if (widget && typeof widget[method] === 'function') {
      try { return Number(widget[method]()) || 0; } catch (_) { /* Fall back below. */ }
    }
    let value = 0;
    let current = widget;
    for (let depth = 0; current && depth < 20; depth += 1, current = current.parent) {
      value += Number(current[axis]) || 0;
      if (current.parent) value -= Number(current.parent[axis === 'x' ? 'offsetX' : 'offsetY']) || 0;
    }
    return value;
  }

  function describePath(path, rootKind, rootList) {
    return path.map((widget, index) => {
      const parent = widget.parent || null;
      const siblings = parent && Array.isArray(parent.widgets) ? parent.widgets : rootList;
      return {
        widgetName: widgetName(widget),
        key: typeof widget.key === 'string' && widget.key ? widget.key : null,
        name: typeof widget.name === 'string' ? widget.name : null,
        name2: typeof widget.name2 === 'string' ? widget.name2 : null,
        id: typeof widget.id === 'number' && Number.isFinite(widget.id) ? widget.id : null,
        subId: typeof widget.subId === 'number' && Number.isFinite(widget.subId) ? widget.subId : null,
        index: siblings.indexOf(widget),
        propertyName: getWidgetPropertyName(parent, widget),
        rootKind: index === 0 ? rootKind : undefined
      };
    });
  }

  function hitPath(list, px, py) {
    if (!Array.isArray(list)) return null;
    for (const widget of list) {
      if (!widget || typeof widget.contains !== 'function') continue;
      let hit = false;
      try { hit = widget.contains(px, py); } catch (_) { hit = false; }
      if (!hit) continue;
      const childX = px - (Number(widget.x) || 0) + (Number(widget.offsetX) || 0);
      const childY = py - (Number(widget.y) || 0) + (Number(widget.offsetY) || 0);
      const childPath = hitPath(widget.widgets, childX, childY);
      return childPath ? [widget, ...childPath] : [widget];
    }
    return null;
  }

  function getAllWidgets() {
    const all = [];
    const seen = new Set();
    function visit(list, rootKind) {
      if (!Array.isArray(list)) return;
      for (const widget of list) {
        if (!widget || seen.has(widget)) continue;
        seen.add(widget);
        all.push({ widget, rootKind });
        visit(widget.widgets, rootKind);
      }
    }
    visit(mainRoots, 'main');
    visit(modalRoots, 'modal');
    return all;
  }

  function signatureMatches(widget, signature) {
    if (!widget || !signature || widgetName(widget) !== signature.widgetName) return false;
    if (signature.key != null && widget.key !== signature.key) return false;
    // `name` and `name2` are not reliable identity fields: some Soundcraft
    // firmware widgets reuse them for visible labels that may change on rename.
    // The widget type, hierarchy index and parent property still identify the
    // control; parameter key/id/subId remain validated when available.
    if (signature.id != null && widget.id !== signature.id) return false;
    if (signature.subId != null && widget.subId !== signature.subId) return false;
    if (signature.propertyName != null && getWidgetPropertyName(widget.parent, widget) !== signature.propertyName) return false;
    return true;
  }

  function resolveTarget(target) {
    if (!target) return null;
    const all = getAllWidgets();

    // First try the widget's hierarchy indexes while validating each segment.
    if (Array.isArray(target.path) && target.path.length) {
      const rootKind = target.rootKind || target.path[0].rootKind || 'main';
      const roots = rootKind === 'modal' ? modalRoots : mainRoots;
      let currentList = roots;
      let current = null;
      let valid = true;
      for (const segment of target.path) {
        const candidate = Number.isInteger(segment.index) ? currentList[segment.index] : null;
        if (!candidate || !signatureMatches(candidate, segment)) { valid = false; break; }
        current = candidate;
        currentList = Array.isArray(candidate.widgets) ? candidate.widgets : [];
      }
      if (valid && current) return current;
    }

    // A keyed parameter is the most stable identity across redraws and renames.
    if (typeof target.key === 'string' && target.key) {
      const keyed = all.filter(({ widget }) => widgetName(widget) === target.widgetName && widget.key === target.key);
      const exact = keyed.find(({ widget }) => !target.globalName || getGlobalName(widget) === target.globalName);
      if (exact) return exact.widget;
      if (keyed.length === 1) return keyed[0].widget;
      if (keyed.length > 1 && Array.isArray(target.path)) {
        const expectedParent = target.path[target.path.length - 2];
        const parentMatch = keyed.find(({ widget }) => expectedParent && signatureMatches(widget.parent, expectedParent));
        if (parentMatch) return parentMatch.widget;
      }
    }

    // For unkeyed controls, identify the owning strip/property plus hierarchy.
    let best = null;
    let bestScore = -1;
    const lastSignature = Array.isArray(target.path) ? target.path[target.path.length - 1] : null;
    for (const item of all) {
      const widget = item.widget;
      if (widgetName(widget) !== target.widgetName) continue;
      const property = getWidgetPropertyName(widget.parent, widget);
      let score = 10;
      if (target.controlName && property === target.controlName) score += 25;
      else if (target.controlName && property && property !== target.controlName) continue;
      if (target.ownerName && widget.parent && widget.parent.name === target.ownerName) score += 30;
      if (target.ownerName2 != null && widget.parent && widget.parent.name2 === target.ownerName2) score += 10;
      if (target.ownerId != null && widget.parent && widget.parent.id === target.ownerId) score += 8;
      if (target.ownerSubId != null && widget.parent && widget.parent.subId === target.ownerSubId) score += 8;
      if (target.globalName && getGlobalName(widget) === target.globalName) score += 12;
      if (lastSignature && signatureMatches(widget, lastSignature)) score += 20;
      if (target.rootKind && item.rootKind === target.rootKind) score += 2;
      if (score > bestScore) { bestScore = score; best = widget; }
    }
    return bestScore >= 10 ? best : null;
  }

  function makeTarget(path, rootKind, rootList, hitX, hitY) {
    let control = null;
    for (let i = path.length - 1; i >= 0; i -= 1) {
      const candidate = path[i];
      if (isFaderWidget(candidate) || isButtonWidget(candidate)) {
        control = candidate;
        break;
      }
    }
    if (!control) {
      const leaf = path[path.length - 1];
      return { ok: false, error: text(`Das angeklickte Widget (${getGlobalName(leaf) || widgetName(leaf)}) ist kein unterstütztes Fader- oder Bedienelement.`, `The clicked widget (${getGlobalName(leaf) || widgetName(leaf)}) is not a supported fader or control.`) };
    }

    const propertyName = getWidgetPropertyName(control.parent, control);
    const mode = isFaderWidget(control) ? 'fader' : 'toggle';
    const channelPrefix = getChannelPrefix(control);
    const channelName = getChannelName(control, channelPrefix);
    const controlLabel = friendlyControlName(control, propertyName);
    const controlX = globalPosition(control, 'x');
    const controlY = globalPosition(control, 'y');
    const controlWidth = Math.max(1, Number(control.w) || 1);
    const controlHeight = Math.max(1, Number(control.h) || 1);
    const hitXRatio = Number.isFinite(hitX) ? Math.max(0, Math.min(1, (hitX - controlX) / controlWidth)) : 0.5;
    const hitYRatio = Number.isFinite(hitY) ? Math.max(0, Math.min(1, (hitY - controlY) / controlHeight)) : 0.5;
    let ownerGlobalName = getGlobalName(control.parent);
    const target = {
      backend: 'web',
      origin: window.location && window.location.origin ? window.location.origin : null,
      pageUrl: window.location && window.location.href ? window.location.href : null,
      hitXRatio,
      hitYRatio,
      key: typeof control.key === 'string' && control.key ? control.key : null,
      widgetName: widgetName(control),
      globalName: getGlobalName(control),
      controlName: propertyName || tailOfKey(control.key) || widgetName(control),
      propertyName,
      ownerGlobalName,
      ownerWidgetName: control.parent ? widgetName(control.parent) : null,
      ownerName: control.parent && typeof control.parent.name === 'string' ? control.parent.name : null,
      ownerName2: control.parent && typeof control.parent.name2 === 'string' ? control.parent.name2 : null,
      ownerId: control.parent && typeof control.parent.id === 'number' ? control.parent.id : null,
      ownerSubId: control.parent && typeof control.parent.subId === 'number' ? control.parent.subId : null,
      path: describePath(path, rootKind, rootList),
      rootKind,
      mode,
      capabilities: [mode],
      channelName,
      channelPrefix,
      controlLabel,
      label: channelName ? `${channelName} · ${controlLabel}` : controlLabel
    };
    return { ok: true, target };
  }

  function currentLabel(target, widget) {
    const channelPrefix = getChannelPrefix(widget, target);
    const channelName = getChannelName(widget, channelPrefix) || (target && target.channelName) || '';
    const propertyName = (widget ? getWidgetPropertyName(widget.parent, widget) : null) || target.controlName || target.propertyName;
    const controlLabel = friendlyControlName(widget, propertyName);
    return {
      id: target.id || null,
      label: channelName ? `${channelName} · ${controlLabel}` : controlLabel,
      channelName,
      channelPrefix,
      controlLabel
    };
  }

  if (action === 'inspect') {
    const roots = modalRoots.length ? modalRoots : mainRoots;
    const rootKind = modalRoots.length ? 'modal' : 'main';
    if (!roots.length) return { ok: false, error: text('Die Mixer-Widget-Struktur ist noch nicht verfügbar. Ist die Mixer-Seite vollständig geladen?', 'The mixer widget tree is not available yet. Has the mixer page finished loading?') };
    let x = Number(payload && payload.pageX);
    let y = Number(payload && payload.pageY);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return { ok: false, error: text('Ungültige Klickkoordinaten.', 'Invalid click coordinates.') };
    if (window.isSmall && Number.isFinite(window.gScaleEvt)) { x *= window.gScaleEvt; y *= window.gScaleEvt; }
    const path = hitPath(roots, x, y);
    if (!path || !path.length) return { ok: false, error: text('An dieser Position wurde kein aktives Mixer-Steuerelement getroffen.', 'No active mixer control was found at that position.') };
    return makeTarget(path, rootKind, roots, x, y);
  }

  if (action === 'apply') {
    const target = payload && payload.target;
    const mode = payload && payload.mode;
    const value = payload && payload.value;
    const pressed = Boolean(payload && payload.pressed);
    const widget = resolveTarget(target);
    if (!widget) return { ok: false, error: text(`Mixer-Steuerelement nicht gefunden: ${(target && (target.label || target.key || target.globalName)) || 'unbekannt'}. Lade die Seite neu und wähle das Ziel erneut.`, `Mixer control not found: ${(target && (target.label || target.key || target.globalName)) || 'unknown'}. Reload the page and select the target again.`) };
    if (widget.disabled || widget.dsbld || widget.readOnly || (typeof widget.globalEnabled === 'function' && !widget.globalEnabled())) {
      return { ok: false, error: text('Dieses Steuerelement ist im aktuellen Mixer-Modus deaktiviert.', 'This control is disabled in the current mixer mode.') };
    }

    if (mode === 'fader') {
      const normalized = Math.max(0, Math.min(1, Number.isFinite(Number(value)) ? Number(value) / 127 : 0));
      if (typeof widget.setValue === 'function') {
        widget.setValue(normalized);
      } else if (typeof widget.setVal === 'function' && typeof widget.key === 'string' && widget.key) {
        widget.setVal(normalized);
        if (typeof widget.onValue === 'function') widget.onValue();
        if (typeof window.regUpdate === 'function') window.regUpdate(widget.parent || widget);
      } else {
        return { ok: false, error: text(`Widget ${widgetName(widget)} besitzt keine unterstützte Wert-Einstellung.`, `Widget ${widgetName(widget)} does not expose a supported value setter.`) };
      }
      return { ok: true, value: normalized };
    }

    if (mode === 'toggle' && pressed) {
      try {
        if (typeof widget.getState === 'function') widget.getState();
        // Use the selected point inside the canvas widget, not Widget.click()'s
        // hard-coded (0,0). Radio lists, switchboxes and stereo selectors need
        // the original click position to choose the intended item/half.
        const customDown = isCustomWidgetMethod(widget, 'onDown');
        const customUp = isCustomWidgetMethod(widget, 'onUp');
        if (customDown || customUp) {
          const width = Math.max(1, Number(widget.w) || 1);
          const height = Math.max(1, Number(widget.h) || 1);
          const xRatio = Number.isFinite(Number(target.hitXRatio)) ? Math.max(0, Math.min(1, Number(target.hitXRatio))) : 0.5;
          const yRatio = Number.isFinite(Number(target.hitYRatio)) ? Math.max(0, Math.min(1, Number(target.hitYRatio))) : 0.5;
          const x = globalPosition(widget, 'x') + Math.min(width - 1, Math.max(0, xRatio * width));
          const y = globalPosition(widget, 'y') + Math.min(height - 1, Math.max(0, yRatio * height));
          if (typeof widget.onDown === 'function') widget.onDown(x, y, 0);
          if (typeof widget.onUp === 'function') widget.onUp(0);
        } else if (isCustomWidgetMethod(widget, 'doClick')) widget.doClick();
        else if (isCustomWidgetMethod(widget, 'click')) widget.click();
        else if (isCustomWidgetMethod(widget, 'onPress')) widget.onPress();
        else if (isCustomWidgetMethod(widget, 'onSelect')) widget.onSelect();
        else if (isCustomWidgetMethod(widget, 'onToggle')) widget.onToggle();
        else if (isCustomWidgetMethod(widget, 'valueFunc')) widget.valueFunc();
        else return { ok: false, error: text(`Widget ${widgetName(widget)} kann nicht ausgelöst werden.`, `Widget ${widgetName(widget)} cannot be triggered.`) };
      } catch (error) {
        return { ok: false, error: text(`Aktion auf ${widgetName(widget)} fehlgeschlagen: ${error.message}`, `Action on ${widgetName(widget)} failed: ${error.message}`) };
      }
      if (typeof window.regUpdate === 'function') window.regUpdate(widget.parent || widget);
      let state = typeof widget.state !== 'undefined' ? widget.state : (typeof widget.pressed !== 'undefined' ? widget.pressed : null);
      try { if (typeof widget.getState === 'function') { widget.getState(); state = typeof widget.state !== 'undefined' ? widget.state : state; } } catch (_) {}
      return { ok: true, value: state };
    }
    return { ok: true, ignored: true };
  }

  if (action === 'labels') {
    const targets = Array.isArray(payload && payload.targets) ? payload.targets : [];
    return targets.map((item) => {
      const widget = resolveTarget(item.target);
      // The control itself may disappear/rebuild when a mixer mode or strip view
      // changes. A stable channel prefix is enough to refresh the displayed name.
      const label = currentLabel(item.target, widget);
      if (!widget && !label.channelName) return { id: item.id, label: null };
      label.id = item.id;
      return label;
    });
  }

  if (action === 'values') {
    const targets = Array.isArray(payload && payload.targets) ? payload.targets : [];
    return targets.map((item) => {
      const widget = resolveTarget(item.target);
      if (!widget) return { id: item.id, value: null };
      return { id: item.id, value: currentWidgetValue(widget) };
    });
  }

  return { ok: false, error: `Unknown action: ${action}` };
}

const $ = (id) => document.getElementById(id);
const STORAGE_KEY = 'openSoundcraftMidiMappings';
const MIXER_SETTINGS_KEY = 'openSoundcraftMidiMixerSettings';
const MIDI_SETTINGS_KEY = 'openSoundcraftMidiMidiSettings';
const LANGUAGE_KEY = 'openSoundcraftMidiLanguage';

const I18N = {
  de: {
    subtitle:'Open-Source-Beta · MIDI-Steuerung für Soundcraft-Ui-Mixer im Browser', language:'Sprache', notConnected:'Nicht verbunden',
    midiDeviceTitle:'1. MIDI-Gerät', midiDeviceDescription:'Verbinde den Controller und wähle bei Bedarf einen MIDI-Ausgang für LED- und Motorfader-Feedback.', connectMidi:'MIDI verbinden',
    midiInput:'MIDI-Eingang', allMidiInputs:'Alle MIDI-Eingänge', refresh:'Aktualisieren', midiOutput:'MIDI-Ausgang', noMidiOutput:'Kein MIDI-Ausgang ausgewählt',
    faderFeedback:'Fader-Feedback senden', feedbackFormat:'Feedback-Format', feedbackAuto:'Automatisch', feedbackCC:'Control Change (7 Bit)', feedbackPitchBend:'Pitch Bend (14 Bit)',
    midiNotRequested:'MIDI-Zugriff wurde noch nicht angefordert.', feedbackHint:'Wähle einen MIDI-Ausgang, um aktuelle Fader-Werte an LED-Ringe oder Motorfader zurückzusenden.', lastMidiMessage:'Letzte MIDI-Nachricht',
    mixerWebsiteTitle:'2. Mixer-Webseite', mixerWebsiteDescription:'Die Steuerung erfolgt direkt über die im Browser geöffnete Mixer-Weboberfläche.', mixerAddress:'Mixer-Adresse',
    openFindMixer:'Mixer öffnen / finden', permissionHint:'Beim ersten Zugriff fragt der Browser nach Berechtigung für die angegebene Mixer-Adresse.', mixerTab:'Mixer-Tab', noMixerTab:'Kein Mixer-Tab gefunden',
    refreshTabs:'Tabs suchen', chooseTarget:'Ziel wählen', targetHint:'Wähle einen Tab und klicke danach auf den Fader, Button, Schalter oder ein anderes Bedienelement.', mappingType:'Zuordnungstyp',
    faderAbsolute:'Fader / Wert (absoluter MIDI-Wert)', buttonToggle:'Taste (Toggle)', startMidiLearn:'MIDI Learn starten', cancel:'Abbrechen',
    learnHint:'Ziel auswählen und MIDI Learn starten. Für Werte einen CC-Regler oder Pitch Bend, für Tasten einen MIDI-Taster verwenden.', mappingsTitle:'3. Zuordnungen',
    mappingsDescription:'Profile werden lokal im Browser gespeichert und können als JSON gesichert werden.', exportJson:'JSON exportieren', importJson:'JSON importieren', noMappings:'Noch keine Zuordnungen angelegt.',
    footerBeta:'Open-Source-Beta für Browser-Mixer-Weboberflächen.', footerDisclaimer:'Unabhängiges Community-Projekt, nicht mit Soundcraft/HARMAN verbunden.',
    channelShort:'Kan.', contentScriptNoResponse:'Das Steuerungsskript hat nicht geantwortet.', pickerNoStart:'Die Zielauswahl konnte nicht gestartet werden.', midiReady:'MIDI bereit', noMidiDeviceBadge:'Kein MIDI-Gerät', midiUnsupported:'Nicht unterstützt', midiError:'MIDI-Fehler', midiConnected:'MIDI verbunden',
    midiPermissionFail:'MIDI-Zugriff fehlgeschlagen: {error}. Prüfe Browser-Unterstützung und die MIDI-Berechtigung.', webMidiUnsupported:'Web MIDI wird von diesem Browser nicht unterstützt. Verwende einen aktuellen Chromium-Browser auf dem Desktop.',
    midiInputsAvailable:'{count} MIDI-Eingang/-Eingänge verfügbar. {scope}', allInputsMonitored:'Alle Eingänge werden überwacht.', oneInputMonitored:'Ein Eingang wird überwacht.', noMidiInputFound:'MIDI-Zugriff erlaubt, aber kein MIDI-Eingang gefunden.',
    midiAccessReady:'MIDI-Zugriff ist bereit.', feedbackNeedsMidi:'Verbinde zuerst MIDI und wähle einen MIDI-Ausgang.', feedbackDisabled:'Fader-Feedback ist deaktiviert.', feedbackNoOutput:'Kein MIDI-Ausgang ausgewählt. Fader-Feedback wartet.',
    feedbackActive:'Fader-Feedback aktiv: aktuelle Fader-Werte werden als {format} ausgegeben.', feedbackFailure:'MIDI-Feedback fehlgeschlagen: {error}',
    refreshMixerFirst:'Zuerst die Mixer-Adresse öffnen oder einen passenden Tab wählen.', invalidMixerAddress:'Ungültige Mixer-Adresse. Verwende eine HTTP- oder HTTPS-URL, z. B. http://10.10.2.1.',
    permissionDenied:'Keine Berechtigung für {origin}. Bitte erlaube den Zugriff, wenn der Browser danach fragt.', openingMixer:'Mixer-Webseite wird geöffnet …', mixerOpened:'Mixer-Webseite bereit: {url}',
    noMatchingTab:'Kein passender Mixer-Tab gefunden. Öffne die angegebene Adresse oder klicke auf „Mixer öffnen / finden“.', mixerTabsFound:'{count} passender Tab / passende Tabs gefunden.',
    selectMixerTab:'Wähle zuerst einen Mixer-Tab aus.', pickerStarted:'Zielauswahl läuft im Mixer-Tab. Klicke direkt auf einen Fader, Button oder Schalter.', clickMixerNow:'Klicke jetzt im Mixer-Tab auf das gewünschte Bedienelement.',
    pickerInjectFail:'Zielauswahl konnte nicht gestartet werden: {error}. Prüfe die Seitenberechtigung für die Mixer-Adresse.', selectedTarget:'Ausgewählt: {label}', targetNotRecognized:'Das Bedienelement konnte nicht erkannt werden. Klicke genauer auf den Fadergriff oder die Taste.',
    targetReady:'Ziel übernommen. Prüfe den Zuordnungstyp und starte MIDI Learn.', selectTargetAgain:'Zuordnung erstellt. Wähle erneut ein Ziel, um weitere Bedienelemente zuzuweisen.',
    targetPicked:'Mixer-Ziel erkannt: {label}', waitingMidi:'Warte auf einen MIDI-CC-Regler, Pitch Bend oder eine Note-Taste. Bediene genau ein Element.',
    needMidiFirst:'Bitte zuerst MIDI verbinden.', needLearnTarget:'Wähle zuerst ein Ziel.', faderNeedsCC:'Fader-Zuordnungen benötigen einen absoluten CC-Regler oder Pitch Bend. Bitte erneut lernen.',
    midiAlreadyMapped:'Dieser MIDI-Befehl ist bereits „{label}“ zugeordnet. Alte Zuordnung ersetzen?', mappingSaved:'MIDI-Zuordnung gespeichert.',
    mappingStored:'Gespeichert: {label} ← {midi}', mappingPaused:'deaktiviert', mappingActive:'aktiv', fader:'Fader', toggle:'Taste (Toggle)', feedback:'Feedback',
    delete:'Löschen', pause:'Pause', enable:'Aktivieren', outputChannel:'Out-Kanal', outputNumber:'Out-CC', unknownTarget:'Unbekanntes Ziel',
    importNoMappings:'JSON enthält kein mappings-Array.', invalidImport:'Eine oder mehrere Zuordnungen haben ein ungültiges Format.', importFailed:'Import fehlgeschlagen: {error}', imported:'{count} Zuordnung(en) importiert.',
    exportDone:'MIDI-Profil exportiert.', profileLoadFailed:'MIDI-Profil konnte nicht geladen werden: {error}',
    mixerTabUnavailable:'Mixer-Tab konnte nicht ermittelt werden.', inspectingTarget:'Prüfe das angeklickte Bedienelement …',
    pageWidgetUnavailable:'Mixer-Steuerelement nicht gefunden: {target}. Lade die Seite neu und wähle das Ziel erneut.', pageUnavailable:'Mixer-Tab nicht erreichbar: {error}. Prüfe, ob die Mixer-Seite geöffnet ist.',
    valuesUnavailable:'Fader-Wert konnte nicht gelesen werden.', webDomTarget:'Webseiten-Element', legacyTarget:'Diese Zuordnung stammt aus einem älteren, nicht mehr unterstützten Zielformat. Bitte lege sie über die Mixer-Webseite neu an.',
    mappingModeLabel:'Steuerung', languageSaved:'Sprache gespeichert.', waitingMidiShort:'Warte auf MIDI …'
  },
  en: {
    subtitle:'Open-source beta · MIDI control for Soundcraft Ui mixer web interfaces', language:'Language', notConnected:'Not connected',
    midiDeviceTitle:'1. MIDI device', midiDeviceDescription:'Connect your controller and optionally choose a MIDI output for LED-ring and motor-fader feedback.', connectMidi:'Connect MIDI',
    midiInput:'MIDI input', allMidiInputs:'All MIDI inputs', refresh:'Refresh', midiOutput:'MIDI output', noMidiOutput:'No MIDI output selected',
    faderFeedback:'Send fader feedback', feedbackFormat:'Feedback format', feedbackAuto:'Automatic', feedbackCC:'Control Change (7-bit)', feedbackPitchBend:'Pitch Bend (14-bit)',
    midiNotRequested:'MIDI access has not been requested yet.', feedbackHint:'Select a MIDI output to send current fader values back to LED rings or motorised faders.', lastMidiMessage:'Last MIDI message',
    mixerWebsiteTitle:'2. Mixer website', mixerWebsiteDescription:'Control is sent directly through the mixer web interface opened in your browser.', mixerAddress:'Mixer address',
    openFindMixer:'Open / find mixer', permissionHint:'The browser will request permission for this mixer address on first access.', mixerTab:'Mixer tab', noMixerTab:'No mixer tab found',
    refreshTabs:'Find tabs', chooseTarget:'Choose target', targetHint:'Choose a tab, then click a fader, button, switch or another control.', mappingType:'Mapping type',
    faderAbsolute:'Fader / value (absolute MIDI value)', buttonToggle:'Button (toggle)', startMidiLearn:'Start MIDI Learn', cancel:'Cancel',
    learnHint:'Choose a target and start MIDI Learn. Use an absolute CC knob or Pitch Bend for values, and a MIDI button for switches.', mappingsTitle:'3. Mappings',
    mappingsDescription:'Profiles are saved locally in your browser and can be backed up as JSON.', exportJson:'Export JSON', importJson:'Import JSON', noMappings:'No mappings created yet.',
    footerBeta:'Open-source beta for browser-based mixer interfaces.', footerDisclaimer:'Independent community project; not affiliated with Soundcraft/HARMAN.',
    channelShort:'Ch', contentScriptNoResponse:'The control script did not respond.', pickerNoStart:'Target picking could not be started.', midiReady:'MIDI ready', noMidiDeviceBadge:'No MIDI device', midiUnsupported:'Unsupported', midiError:'MIDI error', midiConnected:'MIDI connected',
    midiPermissionFail:'MIDI access failed: {error}. Check browser support and MIDI permissions.', webMidiUnsupported:'Web MIDI is not supported by this browser. Use a current desktop Chromium browser.',
    midiInputsAvailable:'{count} MIDI input(s) available. {scope}', allInputsMonitored:'All inputs are monitored.', oneInputMonitored:'One input is monitored.', noMidiInputFound:'MIDI access granted, but no MIDI input was found.',
    midiAccessReady:'MIDI access is ready.', feedbackNeedsMidi:'Connect MIDI first and select a MIDI output.', feedbackDisabled:'Fader feedback is disabled.', feedbackNoOutput:'No MIDI output selected. Fader feedback is waiting.',
    feedbackActive:'Fader feedback active: current fader values are sent as {format}.', feedbackFailure:'MIDI feedback failed: {error}',
    refreshMixerFirst:'Open the mixer address or choose a matching tab first.', invalidMixerAddress:'Invalid mixer address. Use an HTTP or HTTPS URL, e.g. http://10.10.2.1.',
    permissionDenied:'Permission was not granted for {origin}. Allow access when prompted by the browser.', openingMixer:'Opening mixer website …', mixerOpened:'Mixer website ready: {url}',
    noMatchingTab:'No matching mixer tab found. Open the address or click “Open / find mixer”.', mixerTabsFound:'Found {count} matching tab(s).',
    selectMixerTab:'Select a mixer tab first.', pickerStarted:'Target selection is active in the mixer tab. Click a fader, button or switch.', clickMixerNow:'Now click the desired control in the mixer tab.',
    pickerInjectFail:'Could not start target selection: {error}. Check site permissions for the mixer address.', selectedTarget:'Selected: {label}', targetNotRecognized:'Could not identify the control. Click more precisely on the fader handle or button.',
    targetReady:'Target selected. Check the mapping type and start MIDI Learn.', selectTargetAgain:'Mapping created. Choose another target to assign more controls.',
    targetPicked:'Mixer target found: {label}', waitingMidi:'Waiting for a MIDI CC knob, Pitch Bend or Note button. Operate only one control.',
    needMidiFirst:'Connect MIDI first.', needLearnTarget:'Choose a target first.', faderNeedsCC:'Fader mappings require an absolute CC control or Pitch Bend. Please learn again.',
    midiAlreadyMapped:'This MIDI message is already mapped to “{label}”. Replace the existing mapping?', mappingSaved:'MIDI mapping saved.',
    mappingStored:'Saved: {label} ← {midi}', mappingPaused:'paused', mappingActive:'active', fader:'Fader', toggle:'Button (toggle)', feedback:'Feedback',
    delete:'Delete', pause:'Pause', enable:'Enable', outputChannel:'Out ch.', outputNumber:'Out CC', unknownTarget:'Unknown target',
    importNoMappings:'JSON does not contain a mappings array.', invalidImport:'One or more mappings have an invalid format.', importFailed:'Import failed: {error}', imported:'Imported {count} mapping(s).',
    exportDone:'MIDI profile exported.', profileLoadFailed:'Could not load MIDI profile: {error}',
    mixerTabUnavailable:'Could not identify the mixer tab.', inspectingTarget:'Checking the selected control …',
    pageWidgetUnavailable:'Mixer control not found: {target}. Reload the page and select the target again.', pageUnavailable:'Mixer tab is unavailable: {error}. Check that the mixer website is open.',
    valuesUnavailable:'Could not read the fader value.', webDomTarget:'Web page element', legacyTarget:'This mapping uses an older target format that is no longer supported. Please recreate it through the mixer website.',
    mappingModeLabel:'Control', languageSaved:'Language saved.', waitingMidiShort:'Waiting for MIDI …'
  }
};

let currentLanguage = 'de';
function t(key, vars = {}) {
  const template = (I18N[currentLanguage] && I18N[currentLanguage][key]) || I18N.de[key] || key;
  return template.replace(/\{(\w+)\}/g, (_match, name) => vars[name] === undefined ? '' : String(vars[name]));
}
function applyLanguage() {
  document.documentElement.lang = currentLanguage;
  for (const element of document.querySelectorAll('[data-i18n]')) {
    element.textContent = t(element.dataset.i18n);
  }
  for (const element of document.querySelectorAll('[data-i18n-placeholder]')) element.setAttribute('placeholder', t(element.dataset.i18nPlaceholder));
  for (const element of document.querySelectorAll('[data-i18n-title]')) element.setAttribute('title', t(element.dataset.i18nTitle));
  if (els.languageSelect) els.languageSelect.value = currentLanguage;
  renderMappings();
  void refreshMappingLabels();
  if (!midiAccess) setNote(els.midiStatus, t('midiNotRequested'));
  if (!selectedMixerTabId) setNote(els.targetStatus, t('noMatchingTab'), 'warning');
  if (!pendingTarget && !midiLearnArmed) setNote(els.learnStatus, t('learnHint'));
  updateFeedbackStatus();
}

let midiAccess = null;
let selectedMidiInput = '*';
let selectedMidiOutput = '';
let selectedMixerTabId = null;
let midiLearnArmed = false;
let pendingTarget = null;
let mappings = [];
let logCounter = 0;
let feedbackPollRunning = false;
const ccToggleHigh = new Map();
const lastFeedbackValues = new Map();
const recentFeedbackEchoes = new Map();

const els = {
  connectionBadge: $('connectionBadge'), languageSelect: $('languageSelect'), connectMidiBtn: $('connectMidiBtn'), refreshMidiBtn: $('refreshMidiBtn'),
  midiInputSelect: $('midiInputSelect'), midiOutputSelect: $('midiOutputSelect'), midiStatus: $('midiStatus'), lastMidi: $('lastMidi'), midiLog: $('midiLog'),
  feedbackEnabled: $('feedbackEnabled'), feedbackFormatSelect: $('feedbackFormatSelect'), feedbackStatus: $('feedbackStatus'),
  mixerAddressInput: $('mixerAddressInput'), openMixerBtn: $('openMixerBtn'), refreshTabsBtn: $('refreshTabsBtn'), mixerTabSelect: $('mixerTabSelect'), pickTargetBtn: $('pickTargetBtn'),
  targetStatus: $('targetStatus'), mappingModeSelect: $('mappingModeSelect'), armLearnBtn: $('armLearnBtn'), cancelLearnBtn: $('cancelLearnBtn'), learnStatus: $('learnStatus'),
  mappingList: $('mappingList'), exportBtn: $('exportBtn'), importBtn: $('importBtn'), importFile: $('importFile'), toast: $('toast')
};

function toast(message) {
  els.toast.textContent = message;
  els.toast.classList.add('show');
  window.clearTimeout(toast.timer);
  toast.timer = window.setTimeout(() => els.toast.classList.remove('show'), 2800);
}

function setNote(element, message, kind = '') {
  element.textContent = message;
  element.classList.toggle('success', kind === 'success');
  element.classList.toggle('warning', kind === 'warning');
}

function updateBadge(text, state = 'neutral') {
  els.connectionBadge.textContent = text;
  els.connectionBadge.className = `badge ${state}`;
}

function currentMidiInput() {
  if (!midiAccess || selectedMidiInput === '*') return null;
  return midiAccess.inputs.get(selectedMidiInput) || null;
}

function rebuildMidiInputs() {
  const previous = els.midiInputSelect.value || selectedMidiInput;
  els.midiInputSelect.replaceChildren();
  els.midiInputSelect.add(new Option(t('allMidiInputs'), '*'));
  if (midiAccess) {
    for (const input of midiAccess.inputs.values()) {
      const name = input.name || input.manufacturer || `MIDI input ${input.id}`;
      els.midiInputSelect.add(new Option(name, input.id));
    }
  }
  els.midiInputSelect.value = [...els.midiInputSelect.options].some((option) => option.value === previous) ? previous : '*';
  selectedMidiInput = els.midiInputSelect.value;
  attachMidiInputs();
  rebuildMidiOutputs();
}

function rebuildMidiOutputs() {
  const previous = els.midiOutputSelect.value || selectedMidiOutput;
  lastFeedbackValues.clear();
  els.midiOutputSelect.replaceChildren();
  els.midiOutputSelect.add(new Option(t('noMidiOutput'), ''));
  if (midiAccess) {
    for (const output of midiAccess.outputs.values()) {
      const name = output.name || output.manufacturer || `MIDI output ${output.id}`;
      els.midiOutputSelect.add(new Option(name, output.id));
    }
  }
  const exists = [...els.midiOutputSelect.options].some((option) => option.value === previous);
  els.midiOutputSelect.value = exists ? previous : '';
  selectedMidiOutput = els.midiOutputSelect.value;
  updateFeedbackStatus();
}

function attachMidiInputs() {
  if (!midiAccess) return;
  for (const input of midiAccess.inputs.values()) {
    input.onmidimessage = null;
    if (selectedMidiInput === '*' || selectedMidiInput === input.id) input.onmidimessage = (event) => onMidiMessage(event, input);
  }
  const count = [...midiAccess.inputs.values()].length;
  const scope = selectedMidiInput === '*' ? t('allInputsMonitored') : t('oneInputMonitored');
  setNote(els.midiStatus, count ? t('midiInputsAvailable', { count, scope }) : t('noMidiInputFound'), count ? 'success' : 'warning');
  updateBadge(count ? t('midiReady') : t('noMidiDeviceBadge'), count ? 'good' : 'bad');
}

async function connectMidi() {
  if (!navigator.requestMIDIAccess) {
    setNote(els.midiStatus, t('webMidiUnsupported'), 'warning');
    updateBadge(t('midiUnsupported'), 'bad');
    return;
  }
  try {
    midiAccess = await navigator.requestMIDIAccess({ sysex: false });
    midiAccess.onstatechange = () => rebuildMidiInputs();
    const settings = await chrome.storage.local.get(MIDI_SETTINGS_KEY);
    selectedMidiOutput = settings[MIDI_SETTINGS_KEY]?.outputId || '';
    rebuildMidiInputs();
    els.connectMidiBtn.textContent = t('midiConnected');
    setNote(els.midiStatus, t('midiAccessReady'), 'success');
    toast(t('midiAccessReady'));
  } catch (error) {
    setNote(els.midiStatus, t('midiPermissionFail', { error: error.message }), 'warning');
    updateBadge(t('midiError'), 'bad');
  }
}

function decodeMidi(event) {
  const data = [...event.data];
  if (data.length < 2) return null;
  const status = data[0] & 0xf0;
  const channel = data[0] & 0x0f;
  if (status === 0xb0 && data.length >= 3) return { kind: 'cc', channel, number: data[1], value: data[2], pressed: data[2] >= 64, raw: data };
  if ((status === 0x90 || status === 0x80) && data.length >= 3) {
    const pressed = status === 0x90 && data[2] > 0;
    return { kind: 'note', channel, number: data[1], value: status === 0x90 ? data[2] : 0, pressed, raw: data };
  }
  if (status === 0xe0 && data.length >= 3) return { kind: 'pitchbend', channel, number: 0, value: (data[2] << 7) | data[1], pressed: true, raw: data };
  return { kind: `status-${status.toString(16)}`, channel, number: data[1], value: data[2] ?? 0, pressed: false, raw: data };
}

function midiDescription(msg) {
  const channel = msg.channel + 1;
  const channelLabel = currentLanguage === 'de' ? `Kanal ${channel}` : `Ch ${channel}`;
  if (msg.kind === 'cc') return `CC ${msg.number} · ${channelLabel} · ${msg.value}`;
  if (msg.kind === 'note') return `Note ${msg.number} · ${channelLabel} · ${msg.pressed ? (currentLanguage === 'de' ? 'An' : 'On') : (currentLanguage === 'de' ? 'Aus' : 'Off')} · ${msg.value}`;
  if (msg.kind === 'pitchbend') return `Pitch Bend · ${channelLabel} · ${msg.value}`;
  return `${msg.kind} · ${channelLabel} · ${msg.raw.join(' ')}`;
}

function addLog(text, raw) {
  const row = document.createElement('div');
  row.className = 'log-row';
  const left = document.createElement('span');
  left.textContent = text;
  const right = document.createElement('code');
  right.textContent = raw.join(' ');
  row.append(left, right);
  els.midiLog.prepend(row);
  while (els.midiLog.children.length > 6) els.midiLog.lastElementChild.remove();
}

function sameMidi(mapping, msg) {
  return mapping.midi.kind === msg.kind && mapping.midi.channel === msg.channel && mapping.midi.number === msg.number;
}

function isRecentFeedbackEcho(msg) {
  const signature = msg.kind === 'pitchbend'
    ? `pitchbend:${msg.channel}:${msg.value}`
    : msg.kind === 'cc' ? `cc:${msg.channel}:${msg.number}:${msg.value}` : '';
  if (!signature) return false;
  const sentAt = recentFeedbackEchoes.get(signature);
  return Number.isFinite(sentAt) && Date.now() - sentAt < 160;
}

function onMidiMessage(event, input) {
  const msg = decodeMidi(event);
  if (!msg) return;
  const description = midiDescription(msg);
  els.lastMidi.textContent = `${input.name || input.id}: ${description}`;
  addLog(description, msg.raw);
  // Ignore a controller echo caused by an LED/motor-fader feedback message.
  if (isRecentFeedbackEcho(msg)) return;

  if (midiLearnArmed && pendingTarget) {
    if (msg.kind === 'cc' || (msg.kind === 'note' && msg.pressed) || msg.kind === 'pitchbend') createMapping(msg);
    return;
  }

  for (const mapping of mappings) {
    if (mapping.enabled === false || !sameMidi(mapping, msg)) continue;
    let shouldApply = false;
    if (mapping.mode === 'fader') shouldApply = msg.kind === 'cc' || msg.kind === 'pitchbend';
    else if (mapping.mode === 'toggle') {
      if (msg.kind === 'note') shouldApply = msg.pressed;
      else if (msg.kind === 'cc') {
        const wasHigh = ccToggleHigh.get(mapping.id) === true;
        const isHigh = msg.value >= 64;
        ccToggleHigh.set(mapping.id, isHigh);
        shouldApply = isHigh && !wasHigh;
      }
    }
    if (shouldApply) void applyMapping(mapping, msg);
  }
}

function updateLearnButtons() {
  els.armLearnBtn.disabled = !pendingTarget || midiLearnArmed;
  els.cancelLearnBtn.disabled = !midiLearnArmed && !pendingTarget;
  els.armLearnBtn.classList.toggle('armed', midiLearnArmed);
  els.armLearnBtn.textContent = midiLearnArmed ? t('waitingMidiShort') : t('startMidiLearn');
}

function parseMixerAddress() {
  let raw = els.mixerAddressInput.value.trim();
  if (!raw) throw new Error(t('invalidMixerAddress'));
  if (!/^https?:\/\//i.test(raw)) raw = `http://${raw}`;
  let url;
  try { url = new URL(raw); } catch (_) { throw new Error(t('invalidMixerAddress')); }
  if (!['http:', 'https:'].includes(url.protocol) || !url.hostname || url.username || url.password) throw new Error(t('invalidMixerAddress'));
  url.hash = '';
  return url;
}

function sameOriginTab(tab, origin) {
  if (!tab || !tab.url) return false;
  try { return new URL(tab.url).origin === origin; } catch (_) { return false; }
}

async function waitForTabComplete(tabId, timeoutMs = 12000) {
  const tab = await chrome.tabs.get(tabId).catch(() => null);
  if (tab && tab.status === 'complete') return tab;
  return new Promise((resolve) => {
    let done = false;
    const finish = async (updated) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      chrome.tabs.onUpdated.removeListener(listener);
      resolve(updated || await chrome.tabs.get(tabId).catch(() => null));
    };
    const listener = (id, changeInfo, updated) => {
      if (id === tabId && changeInfo.status === 'complete') void finish(updated);
    };
    chrome.tabs.onUpdated.addListener(listener);
    const timer = setTimeout(() => void finish(null), timeoutMs);
  });
}

async function openOrFindMixer() {
  let url;
  try { url = parseMixerAddress(); }
  catch (error) { setNote(els.targetStatus, error.message, 'warning'); return; }
  const originPattern = `${url.origin}/*`;
  let permitted = false;
  try { permitted = await chrome.permissions.request({ origins: [originPattern] }); }
  catch (error) { setNote(els.targetStatus, `${t('permissionDenied', { origin: url.origin })} (${error.message})`, 'warning'); return; }
  if (!permitted) {
    setNote(els.targetStatus, t('permissionDenied', { origin: url.origin }), 'warning');
    return;
  }
  els.openMixerBtn.disabled = true;
  setNote(els.targetStatus, t('openingMixer'));
  try {
    const tabs = await chrome.tabs.query({});
    let match = tabs.find((tab) => sameOriginTab(tab, url.origin));
    if (match && Number.isInteger(match.id)) {
      await chrome.tabs.update(match.id, { active: true });
      selectedMixerTabId = match.id;
    } else {
      match = await chrome.tabs.create({ url: url.href, active: true });
      selectedMixerTabId = match.id;
      if (Number.isInteger(match.id)) await waitForTabComplete(match.id);
    }
    await refreshMixerTabs();
    if (Number.isInteger(selectedMixerTabId)) els.mixerTabSelect.value = String(selectedMixerTabId);
    await ensureContentScript(selectedMixerTabId);
    setNote(els.targetStatus, t('mixerOpened', { url: url.href }), 'success');
    toast(t('mixerOpened', { url: url.origin }));
  } catch (error) {
    setNote(els.targetStatus, t('pickerInjectFail', { error: error.message }), 'warning');
  } finally {
    els.openMixerBtn.disabled = false;
  }
}

async function ensureContentScript(tabId) {
  if (!Number.isInteger(tabId)) throw new Error(t('mixerTabUnavailable'));
  const tab = await chrome.tabs.get(tabId);
  if (!tab.url || !/^https?:/i.test(tab.url)) throw new Error(t('invalidMixerAddress'));
  try {
    const existing = await chrome.tabs.sendMessage(tabId, { type: 'PING' });
    if (existing && existing.ok) return;
  } catch (_) { /* Inject below after the user has granted host permission. */ }
  await chrome.scripting.executeScript({ target: { tabId }, files: ['content/soundcraft-ui.js'] });
  const response = await chrome.tabs.sendMessage(tabId, { type: 'PING' });
  if (!response || !response.ok) throw new Error(t('contentScriptNoResponse'));
}

async function chooseMidiTarget() {
  const tabId = Number(els.mixerTabSelect.value);
  if (!Number.isInteger(tabId)) {
    toast(t('selectMixerTab'));
    return;
  }
  selectedMixerTabId = tabId;
  try {
    await ensureContentScript(tabId);
    const response = await chrome.tabs.sendMessage(tabId, { type: 'START_PICKER', language: currentLanguage });
    if (!response || !response.ok) throw new Error(t('pickerNoStart'));
    setNote(els.targetStatus, t('pickerStarted'), 'success');
    toast(t('clickMixerNow'));
  } catch (error) {
    setNote(els.targetStatus, t('pickerInjectFail', { error: error.message }), 'warning');
  }
}

function createMapping(msg) {
  const mode = els.mappingModeSelect.value;
  if (mode === 'fader' && msg.kind !== 'cc' && msg.kind !== 'pitchbend') {
    setNote(els.learnStatus, t('faderNeedsCC'), 'warning');
    midiLearnArmed = false;
    updateLearnButtons();
    return;
  }
  const mapping = {
    id: crypto.randomUUID(), enabled: true, mode,
    midi: { kind: msg.kind, channel: msg.channel, number: msg.number },
    feedback: { enabled: mode === 'fader', kind: 'auto', channel: msg.channel, number: msg.kind === 'cc' ? msg.number : 0 },
    target: { ...pendingTarget }, createdAt: new Date().toISOString()
  };
  const duplicate = mappings.find((item) => sameMidi(item, msg));
  if (duplicate) {
    const replace = window.confirm(t('midiAlreadyMapped', { label: duplicate.target.label }));
    if (!replace) {
      midiLearnArmed = false;
      updateLearnButtons();
      return;
    }
    mappings = mappings.filter((item) => item.id !== duplicate.id);
  }
  mappings.push(mapping);
  midiLearnArmed = false;
  pendingTarget = null;
  updateLearnButtons();
  void saveMappings();
  renderMappings();
  setNote(els.learnStatus, t('mappingStored', { label: mapping.target.label, midi: midiDescription(msg) }), 'success');
  setNote(els.targetStatus, t('selectTargetAgain'));
  toast(t('mappingSaved'));
  lastFeedbackValues.clear();
}

async function findTabForTarget(target) {
  if (target && target.origin) {
    const tabs = await chrome.tabs.query({});
    const match = tabs.find((tab) => sameOriginTab(tab, target.origin) && Number.isInteger(tab.id));
    return match ? match.id : null;
  }
  return Number.isInteger(selectedMixerTabId) ? selectedMixerTabId : null;
}

async function applyMapping(mapping, msg) {
  if (mapping.target && mapping.target.backend === 'hardware') {
    setNote(els.learnStatus, t('legacyTarget'), 'warning');
    return;
  }
  let value = msg.value;
  if (msg.kind === 'pitchbend') value = Math.round((msg.value / 16383) * 127);
  const tabId = await findTabForTarget(mapping.target);
  if (!Number.isInteger(tabId)) {
    setNote(els.learnStatus, t('pageUnavailable', { error: 'no matching tab' }), 'warning');
    return;
  }
  try {
    if (mapping.target.backend === 'web-dom' || mapping.target.selector) {
      const response = await chrome.tabs.sendMessage(tabId, {
        type: 'APPLY_MIDI_MAPPING', mapping, value, pressed: msg.pressed, language: currentLanguage
      });
      if (response && response.ok === false) setNote(els.learnStatus, `${mapping.target.label}: ${response.error}`, 'warning');
      return;
    }
    const results = await chrome.scripting.executeScript({
      target: { tabId }, world: 'MAIN', func: soundcraftPageBridge,
      args: ['apply', { target: mapping.target, mode: mapping.mode, value, pressed: msg.pressed, language: currentLanguage }]
    });
    const response = results && results[0] ? results[0].result : null;
    if (response && response.ok === false) {
      const message = response.error || t('valuesUnavailable');
      setNote(els.learnStatus, `${mapping.target.label}: ${message}`, 'warning');
    }
  } catch (error) {
    setNote(els.learnStatus, t('pageUnavailable', { error: error.message }), 'warning');
  }
}

function updateFeedbackStatus() {
  if (!els.feedbackStatus) return;
  if (!els.feedbackEnabled.checked) {
    setNote(els.feedbackStatus, t('feedbackDisabled'));
    return;
  }
  if (!midiAccess) {
    setNote(els.feedbackStatus, t('feedbackNeedsMidi'));
    return;
  }
  const output = midiAccess.outputs.get(els.midiOutputSelect.value);
  if (!output) {
    setNote(els.feedbackStatus, t('feedbackNoOutput'), 'warning');
    return;
  }
  const format = els.feedbackFormatSelect.value === 'auto' ? 'CC / Pitch Bend' : (els.feedbackFormatSelect.value === 'cc' ? 'CC' : 'Pitch Bend');
  setNote(els.feedbackStatus, t('feedbackActive', { format }), 'success');
}

function feedbackMessageFor(mapping, normalized) {
  const settings = mapping.feedback || {};
  let kind = els.feedbackFormatSelect.value;
  if (kind === 'auto') kind = mapping.midi.kind === 'pitchbend' ? 'pitchbend' : 'cc';
  const channel = Number.isInteger(settings.channel) ? Math.max(0, Math.min(15, settings.channel)) : mapping.midi.channel;
  if (kind === 'pitchbend') {
    const value = Math.round(Math.max(0, Math.min(1, normalized)) * 16383);
    return { kind, channel, number: 0, value, bytes: [0xe0 | channel, value & 0x7f, (value >> 7) & 0x7f] };
  }
  const number = Number.isInteger(settings.number) ? Math.max(0, Math.min(127, settings.number)) : mapping.midi.number;
  const value = Math.round(Math.max(0, Math.min(1, normalized)) * 127);
  return { kind: 'cc', channel, number, value, bytes: [0xb0 | channel, number, value] };
}

function sendFaderFeedback(mapping, normalized) {
  if (!midiAccess || !els.feedbackEnabled.checked) return;
  const output = midiAccess.outputs.get(els.midiOutputSelect.value);
  if (!output || !mapping.feedback || mapping.feedback.enabled === false) return;
  const message = feedbackMessageFor(mapping, normalized);
  const signature = `${output.id}:${message.kind}:${message.channel}:${message.number}`;
  if (lastFeedbackValues.get(signature) === message.value) return;
  try {
    output.send(message.bytes);
    lastFeedbackValues.set(signature, message.value);
    const echoSignature = message.kind === 'pitchbend'
      ? `pitchbend:${message.channel}:${message.value}`
      : `cc:${message.channel}:${message.number}:${message.value}`;
    recentFeedbackEchoes.set(echoSignature, Date.now());
    while (recentFeedbackEchoes.size > 300) recentFeedbackEchoes.delete(recentFeedbackEchoes.keys().next().value);
  } catch (error) {
    setNote(els.feedbackStatus, t('feedbackFailure', { error: error.message }), 'warning');
  }
}

async function pollFaderFeedback() {
  if (feedbackPollRunning || !els.feedbackEnabled.checked || !midiAccess || !midiAccess.outputs.get(els.midiOutputSelect.value)) return;
  const activeMappings = mappings.filter((mapping) => mapping.enabled !== false && mapping.mode === 'fader' && mapping.feedback?.enabled !== false && mapping.target && mapping.target.backend !== 'hardware');
  if (!activeMappings.length) return;
  feedbackPollRunning = true;
  try {
    const groups = new Map();
    for (const mapping of activeMappings) {
      const target = mapping.target;
      const key = target.origin ? `origin:${target.origin}` : `fallback:${selectedMixerTabId}`;
      if (!groups.has(key)) groups.set(key, { firstTarget: target, mappings: [] });
      groups.get(key).mappings.push(mapping);
    }
    for (const baseGroup of groups.values()) {
      const tabId = await findTabForTarget(baseGroup.firstTarget);
      if (!Number.isInteger(tabId)) continue;
      const group = { tabId, widgets: baseGroup.mappings.filter((mapping) => mapping.target.backend !== 'web-dom' && !mapping.target.selector), dom: baseGroup.mappings.filter((mapping) => mapping.target.backend === 'web-dom' || mapping.target.selector) };
      if (group.widgets && group.widgets.length) {
        try {
          const resultList = await chrome.scripting.executeScript({
            target: { tabId: group.tabId }, world: 'MAIN', func: soundcraftPageBridge,
            args: ['values', { targets: group.widgets.map((mapping) => ({ id: mapping.id, target: mapping.target })), language: currentLanguage }]
          });
          const values = resultList?.[0]?.result;
          if (Array.isArray(values)) for (const item of values) if (Number.isFinite(item.value)) {
            const mapping = group.widgets.find((candidate) => candidate.id === item.id);
            if (mapping) sendFaderFeedback(mapping, item.value);
          }
        } catch (_) { /* A closed page or temporarily unavailable widget should not stop other mappings. */ }
      }
      if (group.dom && group.dom.length) {
        try {
          const response = await chrome.tabs.sendMessage(group.tabId, { type: 'READ_DOM_VALUES', targets: group.dom.map((mapping) => ({ id: mapping.id, target: mapping.target })) });
          if (Array.isArray(response?.values)) for (const item of response.values) if (Number.isFinite(item.value)) {
            const mapping = group.dom.find((candidate) => candidate.id === item.id);
            if (mapping) sendFaderFeedback(mapping, item.value);
          }
        } catch (_) { /* Ignore closed tabs. */ }
      }
    }
  } finally {
    feedbackPollRunning = false;
  }
}

async function saveMixerSettings() {
  await chrome.storage.local.set({ [MIXER_SETTINGS_KEY]: { address: els.mixerAddressInput.value.trim() } });
}
async function loadSettings() {
  const data = await chrome.storage.local.get([MIXER_SETTINGS_KEY, MIDI_SETTINGS_KEY, LANGUAGE_KEY]);
  const mixer = data[MIXER_SETTINGS_KEY] || {};
  const midi = data[MIDI_SETTINGS_KEY] || {};
  if (mixer.address) els.mixerAddressInput.value = mixer.address;
  if (typeof midi.feedbackEnabled === 'boolean') els.feedbackEnabled.checked = midi.feedbackEnabled;
  if (midi.feedbackFormat) els.feedbackFormatSelect.value = midi.feedbackFormat;
  if (midi.outputId) selectedMidiOutput = midi.outputId;
  currentLanguage = data[LANGUAGE_KEY] === 'en' ? 'en' : 'de';
  applyLanguage();
}
async function saveMidiSettings() {
  await chrome.storage.local.set({ [MIDI_SETTINGS_KEY]: {
    outputId: els.midiOutputSelect.value || '', feedbackEnabled: els.feedbackEnabled.checked,
    feedbackFormat: els.feedbackFormatSelect.value
  } });
}

let mappingLabelRefreshRunning = false;
async function refreshMappingLabels() {
  if (mappingLabelRefreshRunning || !mappings.length) return;
  mappingLabelRefreshRunning = true;
  let changed = false;
  try {
    const browserGroups = new Map();
    for (const mapping of mappings) {
      if (!mapping.target || mapping.target.backend === 'hardware' || mapping.target.backend === 'web-dom' || mapping.target.selector) continue;
      if (!(mapping.target.path || mapping.target.key || mapping.target.widgetName)) continue;
      const tabId = await findTabForTarget(mapping.target);
      if (!Number.isInteger(tabId)) continue;
      const group = browserGroups.get(tabId) || [];
      group.push(mapping);
      browserGroups.set(tabId, group);
    }
    for (const [tabId, group] of browserGroups) {
      try {
        const resultList = await chrome.scripting.executeScript({
          target: { tabId }, world: 'MAIN', func: soundcraftPageBridge,
          args: ['labels', { targets: group.map((mapping) => ({ id: mapping.id, target: mapping.target })), language: currentLanguage }]
        });
        const labels = resultList?.[0]?.result;
        if (!Array.isArray(labels)) continue;
        for (const item of labels) {
          const mapping = mappings.find((entry) => entry.id === item.id);
          if (mapping && item.label) {
            let itemChanged = false;
            if (mapping.target.label !== item.label) { mapping.target.label = item.label; itemChanged = true; }
            if (item.channelName && mapping.target.channelName !== item.channelName) { mapping.target.channelName = item.channelName; itemChanged = true; }
            if (item.controlLabel && mapping.target.controlLabel !== item.controlLabel) { mapping.target.controlLabel = item.controlLabel; itemChanged = true; }
            if (itemChanged) changed = true;
          }
        }
      } catch (_) { /* A selected page may be closed or reloading. */ }
    }
    const domGroups = new Map();
    for (const mapping of mappings) {
      if (!mapping.target || (mapping.target.backend !== 'web-dom' && !mapping.target.selector)) continue;
      const tabId = await findTabForTarget(mapping.target);
      if (!Number.isInteger(tabId)) continue;
      if (!domGroups.has(tabId)) domGroups.set(tabId, []);
      domGroups.get(tabId).push(mapping);
    }
    for (const [tabId, group] of domGroups) {
      try {
        const response = await chrome.tabs.sendMessage(tabId, { type: 'READ_DOM_LABELS', targets: group.map((mapping) => ({ id: mapping.id, target: mapping.target })) });
        for (const item of response?.labels || []) {
          const mapping = mappings.find((entry) => entry.id === item.id);
          if (mapping && item.label && mapping.target.label !== item.label) { mapping.target.label = item.label; changed = true; }
        }
      } catch (_) { /* Ignore disconnected tabs. */ }
    }
  } finally {
    mappingLabelRefreshRunning = false;
  }
  if (changed) { renderMappings(); await saveMappings(); }
}

async function refreshMixerTabs() {
  const tabs = await chrome.tabs.query({});
  let mixerOrigin = null;
  try { mixerOrigin = (await parseMixerAddress()).origin; } catch (_) { /* Address field is validated when opening a page. */ }
  const candidates = tabs.filter((tab) => {
    if (!tab.url || !Number.isInteger(tab.id)) return false;
    if (mixerOrigin && sameOriginTab(tab, mixerOrigin)) return true;
    return false;
  });
  const previous = els.mixerTabSelect.value;
  els.mixerTabSelect.replaceChildren();
  if (!candidates.length) {
    els.mixerTabSelect.add(new Option(t('noMixerTab'), ''));
    selectedMixerTabId = null;
    els.pickTargetBtn.disabled = true;
    setNote(els.targetStatus, t('noMatchingTab'), 'warning');
    return;
  }
  for (const tab of candidates) els.mixerTabSelect.add(new Option(`${tab.title || tab.url} (${tab.id})`, String(tab.id)));
  const preserve = [...els.mixerTabSelect.options].some((option) => option.value === previous);
  els.mixerTabSelect.value = preserve ? previous : String(candidates[0].id);
  selectedMixerTabId = Number(els.mixerTabSelect.value) || null;
  els.pickTargetBtn.disabled = !selectedMixerTabId;
  setNote(els.targetStatus, t('mixerTabsFound', { count: candidates.length }), 'success');
}

function mappingTypeLabel(mapping) { return mapping.mode === 'fader' ? t('fader') : t('toggle'); }
function clampInteger(value, min, max, fallback) {
  const number = Number.parseInt(value, 10);
  return Number.isInteger(number) ? Math.max(min, Math.min(max, number)) : fallback;
}

function renderMappings() {
  els.mappingList.replaceChildren();
  if (!mappings.length) {
    const empty = document.createElement('div'); empty.className = 'empty'; empty.textContent = t('noMappings'); els.mappingList.append(empty); return;
  }
  for (const mapping of mappings) {
    mapping.feedback ||= { enabled: mapping.mode === 'fader', kind: 'auto', channel: mapping.midi.channel, number: mapping.midi.kind === 'cc' ? mapping.midi.number : 0 };
    const row = document.createElement('div'); row.className = 'mapping';
    const target = document.createElement('div');
    const title = document.createElement('div'); title.className = 'mapping-title'; title.textContent = mapping.target.label || t('unknownTarget');
    const kind = document.createElement('small'); kind.textContent = `${mappingTypeLabel(mapping)} · ${mapping.enabled === false ? t('mappingPaused') : t('mappingActive')}`;
    target.append(title, kind);

    const selector = document.createElement('div'); selector.className = 'mapping-details';
    const midiText = document.createElement('code');
    midiText.textContent = `${mapping.midi.kind.toUpperCase()} ${mapping.midi.number} · ${t('channelShort')} ${mapping.midi.channel + 1}`;
    const targetDetails = document.createElement('small');
    targetDetails.textContent = mapping.target.key || (mapping.target.ownerName && mapping.target.controlName ? `${mapping.target.ownerName} · ${mapping.target.controlName}` : '') || mapping.target.globalName || mapping.target.selector || mapping.target.widgetName || t('unknownTarget');
    selector.append(midiText, targetDetails);

    if (mapping.mode === 'fader') {
      const feedbackControls = document.createElement('div'); feedbackControls.className = 'mapping-feedback';
      const feedbackLabel = document.createElement('label'); feedbackLabel.className = 'mapping-feedback-toggle';
      const feedbackCheck = document.createElement('input'); feedbackCheck.type = 'checkbox'; feedbackCheck.checked = mapping.feedback.enabled !== false;
      feedbackCheck.addEventListener('change', async () => { mapping.feedback.enabled = feedbackCheck.checked; lastFeedbackValues.clear(); await saveMappings(); updateFeedbackStatus(); });
      const feedbackText = document.createElement('span'); feedbackText.textContent = t('feedback'); feedbackLabel.append(feedbackCheck, feedbackText);
      const outChannelLabel = document.createElement('label'); outChannelLabel.textContent = t('outputChannel');
      const outChannel = document.createElement('input'); outChannel.type = 'number'; outChannel.min = '1'; outChannel.max = '16'; outChannel.value = String((Number.isInteger(mapping.feedback.channel) ? mapping.feedback.channel : mapping.midi.channel) + 1); outChannel.title = t('outputChannel');
      outChannel.addEventListener('change', async () => { mapping.feedback.channel = clampInteger(outChannel.value, 1, 16, mapping.midi.channel + 1) - 1; outChannel.value = String(mapping.feedback.channel + 1); lastFeedbackValues.clear(); await saveMappings(); });
      const outNumberLabel = document.createElement('label'); outNumberLabel.textContent = t('outputNumber');
      const outNumber = document.createElement('input'); outNumber.type = 'number'; outNumber.min = '0'; outNumber.max = '127'; outNumber.value = String(Number.isInteger(mapping.feedback.number) ? mapping.feedback.number : mapping.midi.number); outNumber.title = t('outputNumber');
      outNumber.addEventListener('change', async () => { mapping.feedback.number = clampInteger(outNumber.value, 0, 127, mapping.midi.number); outNumber.value = String(mapping.feedback.number); lastFeedbackValues.clear(); await saveMappings(); });
      outChannelLabel.append(outChannel); outNumberLabel.append(outNumber);
      feedbackControls.append(feedbackLabel, outChannelLabel, outNumberLabel);
      selector.append(feedbackControls);
    }

    const mode = document.createElement('select'); mode.setAttribute('aria-label', `${t('mappingModeLabel')} ${mapping.target.label}`);
    const capabilities = Array.isArray(mapping.target.capabilities) && mapping.target.capabilities.length ? mapping.target.capabilities : ['fader', 'toggle'];
    if (capabilities.includes('fader')) mode.add(new Option(t('fader'), 'fader'));
    if (capabilities.includes('toggle')) mode.add(new Option(t('toggle'), 'toggle'));
    mode.value = capabilities.includes(mapping.mode) ? mapping.mode : capabilities[0]; mapping.mode = mode.value;
    mode.addEventListener('change', async () => { mapping.mode = mode.value; if (mapping.mode !== 'fader') mapping.feedback.enabled = false; await saveMappings(); renderMappings(); });

    const actions = document.createElement('div'); actions.className = 'mapping-actions';
    const enabled = document.createElement('button'); enabled.className = 'secondary'; enabled.textContent = mapping.enabled === false ? t('enable') : t('pause');
    enabled.addEventListener('click', async () => { mapping.enabled = mapping.enabled === false; lastFeedbackValues.clear(); await saveMappings(); renderMappings(); });
    const remove = document.createElement('button'); remove.className = 'mapping-delete'; remove.textContent = t('delete');
    remove.addEventListener('click', async () => { mappings = mappings.filter((item) => item.id !== mapping.id); lastFeedbackValues.clear(); await saveMappings(); renderMappings(); });
    actions.append(enabled, remove);
    row.append(target, selector, mode, actions); els.mappingList.append(row);
  }
}

async function saveMappings() { await chrome.storage.local.set({ [STORAGE_KEY]: mappings }); }
async function loadMappings() {
  try {
    const data = await chrome.storage.local.get(STORAGE_KEY);
    mappings = Array.isArray(data[STORAGE_KEY]) ? data[STORAGE_KEY] : [];
    for (const mapping of mappings) {
      if (mapping.mode === 'fader' && !mapping.feedback) mapping.feedback = { enabled: true, kind: 'auto', channel: mapping.midi.channel, number: mapping.midi.kind === 'cc' ? mapping.midi.number : 0 };
      if (mapping.target?.backend === 'demo') mapping.target.backend = 'web';
    }
    renderMappings();
  } catch (error) { toast(t('profileLoadFailed', { error: error.message })); }
}

function cancelLearn() {
  midiLearnArmed = false; pendingTarget = null; updateLearnButtons();
  setNote(els.learnStatus, t('needLearnTarget'));
}

function exportMappings() {
  const blob = new Blob([JSON.stringify({ version: '0.4.0-beta.3', mappings }, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob); const anchor = document.createElement('a');
  anchor.href = url; anchor.download = 'open-soundcraft-midi-profile.json'; anchor.click(); URL.revokeObjectURL(url); toast(t('exportDone'));
}

async function importMappingsFile(file) {
  try {
    const data = JSON.parse(await file.text());
    const next = Array.isArray(data) ? data : data.mappings;
    if (!Array.isArray(next)) throw new Error(t('importNoMappings'));
    for (const mapping of next) {
      if (!mapping || typeof mapping.id !== 'string' || !mapping.midi || !mapping.target || !(mapping.target.backend === 'hardware' || mapping.target.path || mapping.target.key || mapping.target.selector || (mapping.target.widgetName === 'CheckBox' && ['mute', 'solo'].includes(mapping.target.controlName) && typeof mapping.target.ownerName === 'string')) || !['fader', 'toggle'].includes(mapping.mode)) throw new Error(t('invalidImport'));
      if (mapping.target.backend === 'demo') mapping.target.backend = 'web';
      if (mapping.mode === 'fader' && !mapping.feedback) mapping.feedback = { enabled: true, kind: 'auto', channel: mapping.midi.channel, number: mapping.midi.kind === 'cc' ? mapping.midi.number : 0 };
    }
    mappings = next; await saveMappings(); renderMappings(); toast(t('imported', { count: mappings.length }));
  } catch (error) { toast(t('importFailed', { error: error.message })); }
  finally { els.importFile.value = ''; }
}

async function handlePickedTarget(message, sender) {
  const tabId = sender.tab?.id ?? selectedMixerTabId;
  if (!Number.isInteger(tabId)) { setNote(els.targetStatus, t('mixerTabUnavailable'), 'warning'); return; }
  selectedMixerTabId = tabId;
  const senderUrl = sender.tab?.url || '';
  let origin = null;
  try { origin = new URL(senderUrl).origin; } catch (_) { /* Ignore malformed tab URL. */ }
  if (message.target?.domTarget) {
    const dom = message.target.domTarget;
    pendingTarget = {
      backend: 'web-dom', origin, pageUrl: senderUrl, selector: dom.selector, elementLabel: dom.label,
      widgetName: dom.tagName || 'WebElement', controlName: dom.label || 'control', mode: dom.mode || 'toggle', capabilities: [dom.mode || 'toggle'],
      channelName: '', controlLabel: dom.label || t('webDomTarget'), label: dom.label || t('webDomTarget')
    };
  } else {
    setNote(els.targetStatus, t('inspectingTarget'));
    try {
      const resultList = await chrome.scripting.executeScript({ target: { tabId }, world: 'MAIN', func: soundcraftPageBridge, args: ['inspect', { pageX: message.target.pageX, pageY: message.target.pageY, language: currentLanguage }] });
      const result = resultList?.[0]?.result;
      if (!result || !result.ok || !result.target) {
        setNote(els.targetStatus, result?.error || t('targetNotRecognized'), 'warning'); toast(t('targetNotRecognized')); return;
      }
      pendingTarget = result.target;
      pendingTarget.backend = 'web';
      if (!pendingTarget.origin) pendingTarget.origin = origin;
      if (!pendingTarget.pageUrl) pendingTarget.pageUrl = senderUrl;
    } catch (error) {
      setNote(els.targetStatus, t('pickerInjectFail', { error: error.message }), 'warning'); return;
    }
  }
  midiLearnArmed = false;
  els.mappingModeSelect.value = pendingTarget.mode || 'toggle';
  setNote(els.targetStatus, t('selectedTarget', { label: pendingTarget.label }), 'success');
  setNote(els.learnStatus, t('targetReady'), 'success');
  updateLearnButtons(); toast(t('targetPicked', { label: pendingTarget.label }));
}

chrome.runtime.onMessage.addListener((message, sender) => {
  if (!message || !message.type) return;
  if (message.type === 'TARGET_PICKED') { void handlePickedTarget(message, sender); return; }
  if (message.type === 'PICKER_CANCELLED') setNote(els.targetStatus, t('cancel'));
});

els.languageSelect.addEventListener('change', async () => {
  currentLanguage = els.languageSelect.value === 'en' ? 'en' : 'de';
  await chrome.storage.local.set({ [LANGUAGE_KEY]: currentLanguage });
  applyLanguage();
  toast(t('languageSaved'));
});
els.connectMidiBtn.addEventListener('click', connectMidi);
els.refreshMidiBtn.addEventListener('click', () => midiAccess ? rebuildMidiInputs() : connectMidi());
els.midiInputSelect.addEventListener('change', () => { selectedMidiInput = els.midiInputSelect.value; attachMidiInputs(); });
els.midiOutputSelect.addEventListener('change', async () => { selectedMidiOutput = els.midiOutputSelect.value; lastFeedbackValues.clear(); await saveMidiSettings(); updateFeedbackStatus(); void pollFaderFeedback(); });
els.feedbackEnabled.addEventListener('change', async () => { lastFeedbackValues.clear(); await saveMidiSettings(); updateFeedbackStatus(); void pollFaderFeedback(); });
els.feedbackFormatSelect.addEventListener('change', async () => { lastFeedbackValues.clear(); await saveMidiSettings(); updateFeedbackStatus(); void pollFaderFeedback(); });
els.mixerAddressInput.addEventListener('change', async () => { await saveMixerSettings(); await refreshMixerTabs(); });
els.openMixerBtn.addEventListener('click', () => void openOrFindMixer());
els.refreshTabsBtn.addEventListener('click', refreshMixerTabs);
els.mixerTabSelect.addEventListener('change', () => {
  selectedMixerTabId = Number(els.mixerTabSelect.value) || null;
  els.pickTargetBtn.disabled = !selectedMixerTabId;
  void refreshMappingLabels();
  void pollFaderFeedback();
});
els.pickTargetBtn.addEventListener('click', () => void chooseMidiTarget());
els.armLearnBtn.addEventListener('click', () => {
  if (!pendingTarget) { setNote(els.learnStatus, t('needLearnTarget'), 'warning'); return; }
  if (!midiAccess) { setNote(els.learnStatus, t('needMidiFirst'), 'warning'); return; }
  midiLearnArmed = true; updateLearnButtons(); setNote(els.learnStatus, t('waitingMidi'), 'warning');
});
els.cancelLearnBtn.addEventListener('click', cancelLearn);
els.exportBtn.addEventListener('click', exportMappings);
els.importBtn.addEventListener('click', () => els.importFile.click());
els.importFile.addEventListener('change', () => { if (els.importFile.files?.[0]) void importMappingsFile(els.importFile.files[0]); });

Promise.all([loadMappings(), loadSettings()]).then(async () => {
  await refreshMixerTabs();
  updateLearnButtons();
  if (midiAccess) rebuildMidiInputs();
  updateFeedbackStatus();
}).catch((error) => console.error(error));
window.setInterval(() => { void refreshMappingLabels(); }, 2500);
window.setInterval(() => { void pollFaderFeedback(); }, 100);

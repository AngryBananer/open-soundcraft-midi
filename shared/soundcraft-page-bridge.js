'use strict';

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

  function parameterKeyForTarget(target, widget = null) {
    if (target && target.backend === 'web-parameter') return target.parameterKey || target.key || '';
    if (widget && typeof widget.key === 'string' && widget.key) return widget.key;
    if (target && typeof target.key === 'string' && target.key) return target.key;
    const prefix = getChannelPrefix(widget, target);
    const control = target && (target.controlName || target.propertyName);
    if (prefix && typeof control === 'string' && /^[a-z][a-z0-9_]*$/i.test(control)) return `${prefix}${control}`;
    return '';
  }

  function boolValue(value) {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'number') return value >= 0.5;
    if (typeof value === 'string') {
      const normalized = value.trim().toLowerCase();
      if (['true', 'on', 'yes', 'active', 'enabled'].includes(normalized)) return true;
      if (['false', 'off', 'no', 'inactive', 'disabled', ''].includes(normalized)) return false;
      const numeric = Number(normalized);
      if (Number.isFinite(numeric)) return numeric >= 0.5;
    }
    return null;
  }

  function readTargetState(target, widget = null) {
    if (widget && typeof widget.getState === 'function') {
      try { widget.getState(); } catch (_) { /* Read the backing parameter below. */ }
    }
    const key = parameterKeyForTarget(target, widget);
    if (key && typeof window.getValue === 'function') {
      try {
        const state = boolValue(window.getValue(key));
        if (state !== null) return state;
      } catch (_) { /* Fall through to widget state. */ }
    }
    if (widget) {
      for (const property of ['state', 'pressed', 'checked', 'active', 'value']) {
        if (typeof widget[property] === 'boolean' || (typeof widget[property] === 'number' && Number.isFinite(widget[property]))) {
          return boolValue(widget[property]);
        }
      }
    }
    return null;
  }

  function isValidSoundcraftParameterKey(key) {
    return typeof key === 'string' && /^(?:[ialfsp]\.\d+|m)(?:\.[a-zA-Z0-9_]+)+$/.test(key);
  }

  function currentParameterValue(key) {
    if (!isValidSoundcraftParameterKey(key) || typeof window.getValue !== 'function') return null;
    try {
      const value = window.getValue(key);
      if (value === null || value === undefined || value === '') return null;
      const numeric = Number(value);
      return Number.isFinite(numeric) ? Math.max(0, Math.min(1, numeric)) : null;
    } catch (_) { return null; }
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
    if (target && target.backend === 'web-parameter') {
      const key = target.parameterKey || target.key;
      if (!isValidSoundcraftParameterKey(key)) return { ok: false, error: text('Ungültiger Soundcraft-Parameter-Schlüssel.', 'Invalid Soundcraft parameter key.') };
      if (typeof window.setValue !== 'function' || typeof window.getValue !== 'function') return { ok: false, error: text('Die Parameter-API des Mixers ist nicht verfügbar.', 'The mixer parameter API is unavailable.') };
      if (mode === 'fader') {
        const normalized = Math.max(0, Math.min(1, Number.isFinite(Number(value)) ? Number(value) / 127 : 0));
        window.setValue(key, normalized);
        return { ok: true, value: normalized, key };
      }
      if (mode === 'toggle' && pressed) {
        const current = boolValue(window.getValue(key));
        if (current === null) return { ok: false, error: text(`Kein aktueller Status für ${key} verfügbar.`, `No current state is available for ${key}.`) };
        const next = !current;
        window.setValue(key, next ? 1 : 0);
        return { ok: true, value: next, state: next, key };
      }
      return { ok: true, ignored: true };
    }
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
      if (item.target && item.target.backend === 'web-parameter') {
        const prefix = getChannelPrefix(null, item.target);
        const channelName = getChannelName(null, prefix) || item.target.channelName || '';
        const controlLabel = item.target.controlLabel || tailOfKey(item.target.parameterKey || item.target.key) || text('Parameter', 'Parameter');
        return { id: item.id, label: channelName ? `${channelName} · ${controlLabel}` : (item.target.label || controlLabel), channelName, channelPrefix: prefix, controlLabel };
      }
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
      const target = item.target;
      if (target && target.backend === 'web-parameter') {
        const key = target.parameterKey || target.key;
        const raw = isValidSoundcraftParameterKey(key) && typeof window.getValue === 'function' ? window.getValue(key) : null;
        const numeric = raw === null || raw === undefined || raw === '' ? null : Number(raw);
        return { id: item.id, value: Number.isFinite(numeric) ? Math.max(0, Math.min(1, numeric)) : null, state: boolValue(raw), key };
      }
      const widget = resolveTarget(target);
      if (!widget) return { id: item.id, value: null, state: null };
      return { id: item.id, value: currentWidgetValue(widget), state: readTargetState(target, widget), key: parameterKeyForTarget(target, widget) };
    });
  }

  return { ok: false, error: `Unknown action: ${action}` };
}


function installSoundcraftValueMonitor(keys) {
  const source = 'open-soundcraft-midi-page-bridge';
  const watchedKeys = Array.isArray(keys) ? keys.filter((key) => typeof key === 'string' && key.length > 0) : [];
  let monitor = window.__openSoundcraftMidiValueMonitor;
  if (!monitor) {
    monitor = { watched: new Set(), installed: [], source };
    monitor.publish = (key, value) => {
      if (!monitor.watched.has(key) || (value !== null && typeof value === 'object')) return;
      window.postMessage({ source, type: 'PARAMETER_CHANGED', key, value }, window.location.origin);
    };
    Object.defineProperty(window, '__openSoundcraftMidiValueMonitor', {
      value: monitor, configurable: true, enumerable: false, writable: false
    });
  }
  // Retry on subsequent calls if the application defines its parameter API
  // after the first injection. Never wrap the same function twice.
  // Soundcraft uses setValue/setValueX for local control changes and
  // putValue for values received from the mixer transport. Wrap all three so
  // updates are pushed to the side panel even when the mixer tab is in the
  // background. The 500 ms readback remains only as a compatibility fallback.
  for (const functionName of ['putValue', 'setValue', 'setValueX']) {
    const original = window[functionName];
    if (typeof original !== 'function' || original.__openSoundcraftMidiWrapped) continue;
    const wrapped = function (key, value, ...rest) {
      const parameterKey = String(key);
      let before;
      try { before = typeof window.getValue === 'function' ? window.getValue(parameterKey) : undefined; } catch (_) { before = undefined; }
      const result = original.call(this, key, value, ...rest);
      let after = value;
      try { after = typeof window.getValue === 'function' ? window.getValue(parameterKey) : value; } catch (_) { /* Use the passed value. */ }
      if (before !== after) monitor.publish(parameterKey, after);
      return result;
    };
    wrapped.__openSoundcraftMidiWrapped = true;
    wrapped.__openSoundcraftMidiOriginal = original;
    try {
      window[functionName] = wrapped;
      if (window[functionName] === wrapped && !monitor.installed.includes(functionName)) monitor.installed.push(functionName);
    } catch (_) { /* Some firmware builds expose a non-writable function. */ }
  }
  monitor.watched = new Set(watchedKeys);
  const initial = [];
  for (const key of watchedKeys) {
    let value = null;
    try { value = typeof window.getValue === 'function' ? window.getValue(key) : null; } catch (_) { /* Ignore unavailable parameters. */ }
    if (value !== null && value !== undefined && typeof value !== 'object') {
      initial.push({ key, value });
      monitor.publish(key, value);
    }
  }
  return { ok: monitor.installed.length > 0 || typeof window.getValue === 'function', watched: watchedKeys.length, installed: monitor.installed.slice(), initial };
}

self.OpenSoundcraftBackgroundBridge = Object.freeze({ soundcraftPageBridge, installSoundcraftValueMonitor });

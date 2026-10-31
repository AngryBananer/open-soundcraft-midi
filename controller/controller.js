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
  // background. A 250 ms readback remains only as a compatibility fallback.
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

const $ = (id) => document.getElementById(id);
const IS_SIDE_PANEL = document.body.classList.contains('side-panel');
const IS_EDGE = /Edg\//i.test(navigator.userAgent);
const STORAGE_KEY = 'openSoundcraftMidiMappings';
const SELECTED_MIXER_CONTEXT_KEY = 'openSoundcraftMidiSelectedMixerContext';
const LEGACY_ACTIVE_TAB_CONTEXT_KEY = 'openSoundcraftMidiActiveTabContext';
const mixerTabContextUtils = window.OpenSoundcraftMixerTabContext || null;
const mappingModeUtils = window.OpenSoundcraftMidiMappingMode || null;
const MIDI_SETTINGS_KEY = 'openSoundcraftMidiMidiSettings';
const LANGUAGE_KEY = 'openSoundcraftMidiLanguage';
const FEEDBACK_COLORS_KEY = 'openSoundcraftMidiLastFeedbackColors';
const MIDI_PERMISSION_GRANTED_KEY = 'openSoundcraftMidiPermissionGranted';
const colorUtils = window.OpenSoundcraftMidiColors;
// Loaded by controller.html before this script. Keep a safe fallback so a
// missing optional profile helper can never interrupt MIDI Learn / mapping creation.
const deviceProfiles = window.OpenSoundcraftMidiDeviceProfiles || null;
let lastFeedbackColors = null;

const I18N = {
  de: {
    subtitle:'Open-Source-Beta · MIDI-Steuerung für Soundcraft-Ui-Mixer im Browser', language:'Sprache', notConnected:'Nicht verbunden',
    midiDeviceTitle:'1. MIDI-Gerät', midiDeviceDescription:'Verbinde den Controller und wähle bei Bedarf einen MIDI-Ausgang für LED- und Motorfader-Feedback.', connectMidi:'MIDI verbinden', openMidiConnectTab:'MIDI-Berechtigung im neuen Tab anfragen', midiTabOpened:'MIDI-Berechtigungsseite geöffnet. Bitte dort auf „MIDI-Zugriff anfragen“ klicken. Danach zur Seitenleiste zurückkehren und „MIDI verbinden“ wählen.', midiPermissionGrantedClickToConnect:'Freigabe erteilt. Kehre zur Seitenleiste zurück und klicke auf „MIDI verbinden“.',
    midiInput:'MIDI-Eingang', allMidiInputs:'Alle MIDI-Eingänge', noMidiInputSelected:'Kein Eingang geöffnet', allMidiInputsRisk:'Alle Eingänge öffnen (nicht empfohlen)', refresh:'Aktualisieren', midiOutput:'MIDI-Ausgang', noMidiOutput:'Kein MIDI-Ausgang ausgewählt',
    faderFeedback:'MIDI-Feedback (Fader und Tasten)', feedbackFormat:'Feedback-Format', feedbackAuto:'Automatisch', feedbackCC:'Control Change (7 Bit)', feedbackPitchBend:'Pitch Bend (14 Bit)',
    parameterTargetTitle:'Direktparameter-Ziel (auch unsichtbare Fader)', parameterKey:'Soundcraft-Parameter', parameterLabel:'Anzeigename (optional)', addParameterTarget:'Parameter-Ziel übernehmen', parameterHelp:'Der Typ wird automatisch aus dem Parameter abgeleitet. Beispiele: i.7.mix (Fader), i.7.mute (Taste), i.7.aux.0.value (Aux-Send).', parameterInvalid:'Ungültiger Parameter-Schlüssel. Beispiel: i.7.aux.0.value.', parameterMissingTab:'Übernimm zuerst den aktuellen Browser-Tab als Mixer.',
    buttonFeedback:'Tasten-LED-Feedback', feedbackProfile:'LED-Profil', feedbackGeneric:'Generisches MIDI', feedbackApc:'AKAI APC mini MK2', feedbackActiveColor:'Farbe aktiv', feedbackInactiveColor:'Farbe inaktiv', feedbackApcHint:'RGB-Pads unterstützen die konfigurierbaren Farben. Track-/Scene-Tasten besitzen feste rot/grüne LEDs und unterstützen nur Ein/Aus.',
    midiNotRequested:'MIDI-Zugriff wird erst nach Klick auf „MIDI verbinden“ angefordert.', midiRequesting:'MIDI-Zugriff wird angefragt …', midiNeedsUserGesture:'Klicke auf „MIDI verbinden“, um Edge die MIDI-Anfrage aus einer Benutzeraktion heraus zu zeigen.', midiPermissionDenied:'Edge hat den MIDI-Zugriff für diese Erweiterungsseite verweigert. Prüfe die MIDI-Berechtigung und Richtlinien für die Erweiterung, nicht nur für die Mixer-Adresse.', midiPermissionUnknown:'MIDI-Berechtigung wird nicht vorab abgefragt. Klicke auf „MIDI verbinden“, um Edge direkt anzufragen.', disconnectMidi:'MIDI-Empfang deaktivieren', midiReleased:'MIDI-Empfang wurde deaktiviert. In Edge wird der native Port nicht explizit geschlossen, um einen möglichen MIDI-Treiber-Hänger zu vermeiden. Zum erneuten Verbinden auf „MIDI verbinden“ klicken.', midiInputNotSelected:'MIDI ist verbunden. Wähle einen einzelnen Eingang; nicht ausgewählte Ports bleiben geschlossen.', midiAllInputsWarning:'Alle MIDI-Eingänge sind geöffnet. Bei Problemen nur einen Eingang auswählen.', midiInputActive:'{count} MIDI-Eingang/-Eingänge aktiv. {scope}', midiRequestTimeout:'Die MIDI-Anfrage hat nicht geantwortet. Prüfe die MIDI-Berechtigung in Edge und versuche es erneut.', midiDeviceDisconnected:'MIDI-Gerät getrennt. Feedback wurde angehalten; verbinde das Gerät erneut.', feedbackHint:'Wähle einen MIDI-Ausgang, um Fader-Werte und Tasten-Zustände zurückzusenden.', lastMidiMessage:'Letzte MIDI-Nachricht',
    mixerWebsiteTitle:'2. Mixer-Webseite', mixerWebsiteDescription:'Öffne zuerst die Mixer-Webseite in einem Tab. Mit „Mixer öffnen“ wird die Adresse des aktuellen Tabs übernommen und genau dieser Tab als festes Mixer-Ziel gespeichert; ein Wechsel zu anderen Browser-Tabs ändert die Auswahl nicht.', useCurrentTab:'Mixer öffnen', mixerNotSelected:'Öffne zuerst die Mixer-Webseite und übernimm anschließend den aktuellen Tab.', mixerSelected:'Mixer-Tab festgelegt: {title} · {url}', permissionHint:'Beim ersten Zugriff fragt der Browser nach Berechtigung für die Mixer-Webseite.', chooseTarget:'Ziel wählen', targetHint:'Übernimm den Mixer-Tab und klicke auf ein Bedienelement. MIDI Learn startet automatisch; nach jeder Zuordnung wird das nächste Ziel aktiviert. ESC beendet den Lernmodus.',
    startMidiLearn:'MIDI Learn starten', cancel:'Lernmodus beenden',
    learnHint:'Klicke auf „Ziel wählen“ und danach auf ein Mixer-Bedienelement. MIDI Learn startet automatisch. Für Fader CC oder Pitch Bend, für Tasten einen MIDI-Taster verwenden. ESC beendet die Zuordnungssitzung.', mappingsTitle:'3. Zuordnungen',
    mappingsDescription:'Profile werden lokal im Browser gespeichert und können als JSON gesichert werden.', exportJson:'JSON exportieren', importJson:'JSON importieren', noMappings:'Noch keine Zuordnungen angelegt.',
    footerBeta:'Open-Source-Beta für Browser-Mixer-Weboberflächen.', footerDisclaimer:'Unabhängiges Community-Projekt, nicht mit Soundcraft/HARMAN verbunden.',
    channelShort:'Kan.', contentScriptNoResponse:'Das Steuerungsskript hat nicht geantwortet.', pickerNoStart:'Die Zielauswahl konnte nicht gestartet werden.', midiReady:'MIDI bereit', noMidiDeviceBadge:'Kein MIDI-Gerät', midiUnsupported:'Nicht unterstützt', midiError:'MIDI-Fehler', midiConnected:'MIDI verbunden',
    midiPermissionFail:'MIDI-Zugriff fehlgeschlagen: {error}. Prüfe Browser-Unterstützung und die MIDI-Berechtigung.', webMidiUnsupported:'Web MIDI wird von diesem Browser nicht unterstützt. Verwende einen aktuellen Chromium-Browser auf dem Desktop.',
    midiInputsAvailable:'{count} MIDI-Eingang/-Eingänge verfügbar. {scope}', allInputsMonitored:'Alle Eingänge werden überwacht.', oneInputMonitored:'Ein Eingang wird überwacht.', noMidiInputFound:'MIDI-Zugriff erlaubt, aber kein MIDI-Eingang gefunden.', midiInputOpenFailed:'MIDI-Eingang konnte nicht geöffnet werden: {error}',
    midiAccessReady:'MIDI-Zugriff ist bereit.', feedbackNeedsMidi:'Verbinde zuerst MIDI und wähle einen MIDI-Ausgang.', feedbackDisabled:'MIDI-Feedback ist deaktiviert.', feedbackNoOutput:'Kein MIDI-Ausgang ausgewählt. MIDI-Feedback wartet.',
    feedbackActive:'MIDI-Feedback aktiv: Fader-Werte und Tasten-Zustände werden ausgegeben ({format}).', feedbackFailure:'MIDI-Feedback fehlgeschlagen: {error}',
    invalidMixerAddress:'Ungültige Mixer-Adresse. Verwende eine HTTP- oder HTTPS-URL, z. B. http://10.10.2.1.',
    permissionDenied:'Keine Berechtigung für {origin}. Bitte erlaube den Zugriff, wenn der Browser danach fragt.', openingMixer:'Mixer-Tab wird übernommen und vorbereitet …', mixerOpened:'Mixer-Tab festgelegt: {url}',
    noMatchingTab:'Noch kein Mixer-Tab festgelegt. Öffne die Mixer-Webseite und übernimm den aktuellen Tab.', selectMixerTab:'Übernimm zuerst den aktuellen Browser-Tab als Mixer.', continuousPickerPrompt:'Nächstes Ziel auswählen: Klicke auf ein Bedienelement. ESC beendet den Lernmodus.', autoLearnStarted:'Ziel erkannt. MIDI Learn läuft automatisch. Bewege jetzt den Regler oder drücke die Taste.', learningStopped:'MIDI-Lernmodus beendet.',
    pickerInjectFail:'Zielauswahl konnte nicht gestartet werden: {error}. Prüfe die Seitenberechtigung für die Mixer-Adresse.', selectedTarget:'Ausgewählt: {label}', targetNotRecognized:'Das Bedienelement konnte nicht erkannt werden. Klicke genauer auf den Fadergriff oder die Taste.',
    targetReady:'Parameter-Ziel übernommen. Starte jetzt MIDI Learn.', selectTargetAgain:'Zuordnung erstellt. Wähle erneut ein Ziel, um weitere Bedienelemente zuzuweisen.',
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
    languageSaved:'Sprache gespeichert.', waitingMidiShort:'Warte auf MIDI …', mixerNotSelectedShort:'nicht festgelegt'
  },
  en: {
    subtitle:'Open-source beta · MIDI control for Soundcraft Ui mixer web interfaces', language:'Language', notConnected:'Not connected',
    midiDeviceTitle:'1. MIDI device', midiDeviceDescription:'Connect your controller and optionally choose a MIDI output for LED-ring and motor-fader feedback.', connectMidi:'Connect MIDI', openMidiConnectTab:'Request MIDI permission in new tab', midiTabOpened:'MIDI permission page opened. Click “Request MIDI access” in that tab. Then return to the Side Panel and click “Connect MIDI”.', midiPermissionGrantedClickToConnect:'Permission granted. Return to the Side Panel and click “Connect MIDI”.',
    midiInput:'MIDI input', allMidiInputs:'All MIDI inputs', noMidiInputSelected:'No input opened', allMidiInputsRisk:'Open all inputs (not recommended)', refresh:'Refresh', midiOutput:'MIDI output', noMidiOutput:'No MIDI output selected',
    faderFeedback:'MIDI feedback (faders and buttons)', feedbackFormat:'Feedback format', feedbackAuto:'Automatic', feedbackCC:'Control Change (7-bit)', feedbackPitchBend:'Pitch Bend (14-bit)',
    parameterTargetTitle:'Direct parameter target (including hidden faders)', parameterKey:'Soundcraft parameter', parameterLabel:'Display name (optional)', addParameterTarget:'Use parameter target', parameterHelp:'The control type is inferred from the parameter. Examples: i.7.mix (fader), i.7.mute (button), i.7.aux.0.value (Aux send).', parameterInvalid:'Invalid parameter key. Example: i.7.aux.0.value.', parameterMissingTab:'Assign the current browser tab as the mixer first.',
    buttonFeedback:'Button LED feedback', feedbackProfile:'LED profile', feedbackGeneric:'Generic MIDI', feedbackApc:'AKAI APC mini MK2', feedbackActiveColor:'Active color', feedbackInactiveColor:'Inactive color', feedbackApcHint:'RGB pads support configurable colors. Track/Scene buttons have fixed red/green LEDs and support on/off only.',
    midiNotRequested:'MIDI access is requested only after clicking “Connect MIDI”.', midiRequesting:'Requesting MIDI access …', midiNeedsUserGesture:'Click “Connect MIDI” to request access directly from a user gesture.', midiPermissionDenied:'Edge denied MIDI access for this extension page. Check the extension permission and browser policies, not only the mixer website.', midiPermissionUnknown:'MIDI permission is not pre-checked. Click “Connect MIDI” to ask Edge directly.', disconnectMidi:'Stop MIDI input', midiReleased:'MIDI input handling has been stopped. In Edge, the native port is not explicitly closed to avoid a possible MIDI driver hang. Click “Connect MIDI” to reconnect.', midiInputNotSelected:'MIDI is connected. Select one input; other ports remain closed.', midiAllInputsWarning:'All MIDI inputs are open. Select only one input if you have problems.', midiInputActive:'{count} MIDI input(s) active. {scope}', midiRequestTimeout:'The MIDI request did not respond. Check the MIDI permission in Edge and try again.', midiDeviceDisconnected:'MIDI device disconnected. Feedback has been paused; reconnect the device.', feedbackHint:'Select a MIDI output to send fader values and button states back to your controller.', lastMidiMessage:'Last MIDI message',
    mixerWebsiteTitle:'2. Mixer website', mixerWebsiteDescription:'Open the mixer website in a tab first. Click “Open mixer” to use the current tab URL and pin that exact tab as the mixer target; switching to other browser tabs will not change it.', useCurrentTab:'Open mixer', mixerNotSelected:'Open the mixer website first, then assign the current tab.', mixerSelected:'Mixer tab pinned: {title} · {url}', permissionHint:'The browser will request permission for the mixer website on first access.', chooseTarget:'Choose target', targetHint:'Assign the mixer tab and click a control. MIDI Learn starts automatically; the next target is activated after each mapping. Press ESC to stop.',
    startMidiLearn:'Start MIDI Learn', cancel:'Stop learning',
    learnHint:'Click “Choose target”, then click a mixer control. MIDI Learn starts automatically. Use an absolute CC knob or Pitch Bend for values and a MIDI button for switches. Press ESC to stop the session.', mappingsTitle:'3. Mappings',
    mappingsDescription:'Profiles are saved locally in your browser and can be backed up as JSON.', exportJson:'Export JSON', importJson:'Import JSON', noMappings:'No mappings created yet.',
    footerBeta:'Open-source beta for browser-based mixer interfaces.', footerDisclaimer:'Independent community project; not affiliated with Soundcraft/HARMAN.',
    channelShort:'Ch', contentScriptNoResponse:'The control script did not respond.', pickerNoStart:'Target picking could not be started.', midiReady:'MIDI ready', noMidiDeviceBadge:'No MIDI device', midiUnsupported:'Unsupported', midiError:'MIDI error', midiConnected:'MIDI connected',
    midiPermissionFail:'MIDI access failed: {error}. Check browser support and MIDI permissions.', webMidiUnsupported:'Web MIDI is not supported by this browser. Use a current desktop Chromium browser.',
    midiInputsAvailable:'{count} MIDI input(s) available. {scope}', allInputsMonitored:'All inputs are monitored.', oneInputMonitored:'One input is monitored.', noMidiInputFound:'MIDI access granted, but no MIDI input was found.', midiInputOpenFailed:'Could not open MIDI input: {error}',
    midiAccessReady:'MIDI access is ready.', feedbackNeedsMidi:'Connect MIDI first and select a MIDI output.', feedbackDisabled:'MIDI feedback is disabled.', feedbackNoOutput:'No MIDI output selected. MIDI feedback is waiting.',
    feedbackActive:'MIDI feedback active: fader values and button states are sent ({format}).', feedbackFailure:'MIDI feedback failed: {error}',
    invalidMixerAddress:'Invalid mixer address. Use an HTTP or HTTPS URL, e.g. http://10.10.2.1.',
    permissionDenied:'Permission was not granted for {origin}. Allow access when prompted by the browser.', openingMixer:'Assigning and preparing mixer tab …', mixerOpened:'Mixer tab pinned: {url}',
    noMatchingTab:'No mixer tab pinned yet. Open the mixer website and assign the current tab.', selectMixerTab:'Assign the current browser tab as mixer first.', continuousPickerPrompt:'Choose the next target: click a mixer control. Press ESC to stop learning.', autoLearnStarted:'Target selected. MIDI Learn started automatically. Move a fader or press a button now.', learningStopped:'MIDI Learn session stopped.',
    pickerInjectFail:'Could not start target selection: {error}. Check site permissions for the mixer address.', selectedTarget:'Selected: {label}', targetNotRecognized:'Could not identify the control. Click more precisely on the fader handle or button.',
    targetReady:'Parameter target selected. Start MIDI Learn now.', selectTargetAgain:'Mapping created. Choose another target to assign more controls.',
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
    languageSaved:'Language saved.', waitingMidiShort:'Waiting for MIDI …', mixerNotSelectedShort:'not assigned'
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
  if (els.connectMidiBtn && IS_SIDE_PANEL) els.connectMidiBtn.textContent = (engineState.connected || midiPermissionGrantedInTab) ? t('connectMidi') : t('openMidiConnectTab');
  renderMappings();
  void refreshMappingLabels();
  if (!engineState.connected) updateMidiPermissionStatusNote();
  updateMixerContextDisplay();
  if (midiLearnArmed) setNote(els.learnStatus, t('waitingMidi')); else if (targetPickerActive) setNote(els.learnStatus, t('continuousPickerPrompt')); else if (!pendingTarget) setNote(els.learnStatus, t('learnHint'));
  updateFeedbackStatus();
}

let midiPermissionGrantedInTab = false;
let midiConnectPromise = null;
let midiRequestInProgress = false;
let midiPermissionState = 'unknown';
let managedMidiInputs = new Map();
let preferredMidiOutputId = '';
let midiStateChangeTimer = null;
let midiDeviceGeneration = 0;
const blockedMidiOutputs = new Set();
const MIDI_REQUEST_TIMEOUT_MS = 15000;
let continuousLearning = false;
let targetPickerActive = false;
let selectedMidiInput = '';
let selectedMidiOutput = '';
let selectedMixerTabId = null;
let selectedMixerContext = null;
let currentBrowserTabContext = null;
let midiLearnArmed = false;
let pendingTarget = null;
let mappings = [];
let logCounter = 0;
let feedbackPollRunning = false;
const ccToggleHigh = new Map();
const lastFeedbackValues = new Map();
const recentFeedbackEchoes = new Map();
let engineState = {
  connected: false, inputs: [], outputs: [], selectedInputId: '', selectedOutputId: '',
  feedbackEnabled: true, feedbackFormat: 'auto', learningArmed: false, continuousLearning: false, pendingTarget: null
};

async function sendEngineCommand(command, payload = {}) {
  const response = await chrome.runtime.sendMessage({ target: 'background', type: 'ENGINE_COMMAND', command, payload });
  if (!response?.ok) throw new Error(response?.error || `Background engine command failed: ${command}`);
  return response.result;
}

function syncEngineState() {
  return sendEngineCommand('SYNC_STATE', {
    mappings,
    midiSettings: {
      inputId: els.midiInputSelect?.value || selectedMidiInput || '',
      outputId: els.midiOutputSelect?.value || selectedMidiOutput || '',
      feedbackEnabled: Boolean(els.feedbackEnabled?.checked),
      feedbackFormat: els.feedbackFormatSelect?.value || 'auto'
    },
    mixerContext: selectedMixerContext,
    language: currentLanguage
  }).catch((error) => console.warn('[Open Soundcraft MIDI] Could not sync background engine:', error));
}

function applyEngineStatus(state) {
  if (!state || typeof state !== 'object') return;
  engineState = { ...engineState, ...state };
  // MIDI ports are owned exclusively by the offscreen background engine.
  selectedMidiInput = engineState.selectedInputId || '';
  selectedMidiOutput = engineState.selectedOutputId || '';
  preferredMidiOutputId = selectedMidiOutput;
  if (els.midiInputSelect && Array.isArray(engineState.inputs)) {
    const previous = selectedMidiInput;
    els.midiInputSelect.replaceChildren(new Option(t('noMidiInputSelected'), ''));
    els.midiInputSelect.add(new Option(t('allMidiInputsRisk'), '*'));
    for (const input of engineState.inputs) els.midiInputSelect.add(new Option(input.name || input.id, input.id));
    els.midiInputSelect.value = engineState.inputs.some((input) => input.id === previous) || previous === '*' ? previous : '';
  }
  if (els.midiOutputSelect && Array.isArray(engineState.outputs)) {
    const previous = selectedMidiOutput;
    els.midiOutputSelect.replaceChildren(new Option(t('noMidiOutput'), ''));
    for (const output of engineState.outputs) els.midiOutputSelect.add(new Option(output.name || output.id, output.id));
    els.midiOutputSelect.value = engineState.outputs.some((output) => output.id === previous) ? previous : '';
  }
  if (els.connectMidiBtn) els.connectMidiBtn.textContent = engineState.connected ? t('midiConnected') : (midiPermissionGrantedInTab ? t('connectMidi') : t('openMidiConnectTab'));
  if (els.disconnectMidiBtn) els.disconnectMidiBtn.disabled = !engineState.connected;
  if (typeof engineState.feedbackEnabled === 'boolean') els.feedbackEnabled.checked = engineState.feedbackEnabled;
  if (engineState.feedbackFormat) els.feedbackFormatSelect.value = engineState.feedbackFormat;
  if (engineState.pendingTarget !== undefined) pendingTarget = engineState.pendingTarget;
  if (typeof engineState.learningArmed === 'boolean') midiLearnArmed = engineState.learningArmed;
  if (typeof engineState.continuousLearning === 'boolean') continuousLearning = engineState.continuousLearning;
  if (state.permissionRequired === true) {
    // The background context can be denied if the browser permission was
    // revoked after initial setup. Re-enable the normal-tab permission flow.
    midiPermissionGrantedInTab = false;
    void chrome.storage.local.set({ [MIDI_PERMISSION_GRANTED_KEY]: false });
    if (els.connectMidiBtn) els.connectMidiBtn.textContent = t('openMidiConnectTab');
  }
  if (state.message) setNote(els.midiStatus, state.message, state.state === 'error' ? 'warning' : (state.connected ? 'success' : ''));
  if (state.errorName) setNote(els.midiStatus, `${state.errorName}: ${state.message || ''}`, 'warning');
  if (engineState.connected) updateBadge(t('midiReady'), 'good');
  else if (state.state === 'error') updateBadge(t('midiError'), 'bad');
  else updateBadge(t('notConnected'), 'neutral');
  updateLearnButtons();
  updateFeedbackStatus();
}

function boolFeedbackValue(value) {
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

function feedbackParameterKey(target) {
  if (!target) return '';
  const direct = target.parameterKey || (target.backend === 'web-parameter' ? target.key : '');
  if (typeof direct === 'string' && /^(?:[ialfsp]\.\d+|m)(?:\.[a-zA-Z0-9_]+)+$/.test(direct)) return direct;
  if (typeof target.key === 'string' && /^(?:[ialfsp]\.\d+|m)(?:\.[a-zA-Z0-9_]+)+$/.test(target.key)) return target.key;
  const prefix = target.channelPrefix || target.ownerName || '';
  const control = target.controlName || target.propertyName || '';
  if (/^(?:[ialfsp]\.\d+\.|m\.)$/.test(prefix) && /^[a-z][a-z0-9_]*$/i.test(control)) return `${prefix}${control}`;
  return '';
}

function feedbackValueToNormalized(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.max(0, Math.min(1, numeric)) : null;
}

const els = {
  connectionBadge: $('connectionBadge'), languageSelect: $('languageSelect'), midiSettingsCard: $('midiSettingsCard'), mixerSettingsCard: $('mixerSettingsCard'), mappingsSettingsCard: $('mappingsSettingsCard'), connectMidiBtn: $('connectMidiBtn'), disconnectMidiBtn: $('disconnectMidiBtn'), refreshMidiBtn: $('refreshMidiBtn'),
  midiInputSelect: $('midiInputSelect'), midiOutputSelect: $('midiOutputSelect'), midiStatus: $('midiStatus'), lastMidi: $('lastMidi'), midiLog: $('midiLog'),
  feedbackEnabled: $('feedbackEnabled'), feedbackFormatSelect: $('feedbackFormatSelect'), feedbackStatus: $('feedbackStatus'),
  openMixerBtn: $('openMixerBtn'), mixerContextStatus: $('mixerContextStatus'), pickTargetBtn: $('pickTargetBtn'),
  targetStatus: $('targetStatus'), armLearnBtn: $('armLearnBtn'), cancelLearnBtn: $('cancelLearnBtn'), learnStatus: $('learnStatus'),
  mappingList: $('mappingList'), exportBtn: $('exportBtn'), importBtn: $('importBtn'), importFile: $('importFile'), toast: $('toast'),
  parameterKeyInput: $('parameterKeyInput'), parameterLabelInput: $('parameterLabelInput'), addParameterTargetBtn: $('addParameterTargetBtn')
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

function inspectMidiPermission() {
  // Do not request access from the Side Panel. Edge requires the first-time
  // Web MIDI request to come from the dedicated normal extension tab.
  midiPermissionState = typeof navigator.requestMIDIAccess === 'function' ? 'unknown' : 'unsupported';
  updateMidiPermissionStatusNote();
  return midiPermissionState;
}

function updateMidiPermissionStatusNote() {
  if (engineState.connected) return;
  if (midiRequestInProgress) {
    setNote(els.midiStatus, t('midiRequesting'));
    return;
  }
  // Do not treat Permissions API's reported 'denied' state as a reason to
  // suppress the actual request. Edge can report a stale/extension-origin
  // state here; requestMIDIAccess() from the Connect button is authoritative.
  setNote(els.midiStatus, t('midiNotRequested'));
}

function updateBadge(text, state = 'neutral') {
  els.connectionBadge.textContent = text;
  els.connectionBadge.className = `badge ${state}`;
}

function rebuildMidiInputs() {
  void sendEngineCommand('REFRESH_DEVICES').catch((error) => setNote(els.midiStatus, error.message, 'warning'));
}

function rebuildMidiOutputs() { rebuildMidiInputs(); }

function attachMidiInputs() {
  void sendEngineCommand('SET_INPUT', { inputId: els.midiInputSelect?.value || '' }).catch((error) => setNote(els.midiStatus, error.message, 'warning'));
}


async function disconnectMidiDevices() {
  try {
    await sendEngineCommand('DISCONNECT');
    setNote(els.midiStatus, t('midiReleased'), 'success');
    return true;
  } catch (error) {
    setNote(els.midiStatus, error.message || String(error), 'warning');
    return false;
  }
}


async function openMidiPermissionTab() {
  const permissionPageUrl = chrome.runtime.getURL('midi-permission.html');
  try {
    // Open a fresh page for each request so the button is always enabled and
    // the user gesture belongs to this tab, not to a previously granted page.
    await chrome.tabs.create({ url: permissionPageUrl, active: true });
    setNote(els.midiStatus, t('midiTabOpened'), 'success');
  } catch (error) {
    setNote(els.midiStatus, `${t('midiTabOpened')} (${error.message || error})`, 'warning');
  }
}

async function connectMidi() {
  try {
    setNote(els.midiStatus, t('midiRequesting'));
    await sendEngineCommand('CONNECT');
    return true;
  } catch (error) {
    setNote(els.midiStatus, t('midiPermissionFail', { error: error.message || String(error) }), 'warning');
    updateBadge(t('midiError'), 'bad');
    return false;
  }
}


function updateLearnButtons() {
  els.armLearnBtn.disabled = !pendingTarget || midiLearnArmed || !engineState.connected;
  els.cancelLearnBtn.disabled = !midiLearnArmed && !pendingTarget && !continuousLearning && !targetPickerActive;
  els.armLearnBtn.classList.toggle('armed', midiLearnArmed);
  els.armLearnBtn.textContent = midiLearnArmed ? t('waitingMidiShort') : t('startMidiLearn');
  els.cancelLearnBtn.textContent = t('cancel');
  els.pickTargetBtn.disabled = !Number.isInteger(selectedMixerTabId) || targetPickerActive;
  els.pickTargetBtn.classList.toggle('armed', continuousLearning);
}

function sameOriginTab(tab, origin) {
  if (!tab || !tab.url) return false;
  try { return new URL(tab.url).origin === origin; } catch (_) { return false; }
}

function updateMixerContextDisplay() {
  if (!els.mixerContextStatus) return;
  if (!selectedMixerContext || !Number.isInteger(selectedMixerTabId)) {
    els.mixerContextStatus.textContent = t('mixerNotSelected');
      return;
  }
  els.mixerContextStatus.textContent = t('mixerSelected', {
    title: selectedMixerContext.title || `Tab ${selectedMixerTabId}`,
    url: selectedMixerContext.url
  });
}

async function useCurrentTabAsMixer() {
  // This snapshot is refreshed independently from the pinned mixer tab. The
  // explicit button click is the only action that changes the selected mixer.
  const context = currentBrowserTabContext;
  if (!context || !Number.isInteger(context.tabId)) {
    setNote(els.targetStatus, t('noMatchingTab'), 'warning');
    return;
  }
  let url;
  try { url = new URL(context.url); }
  catch (_) { setNote(els.targetStatus, t('invalidMixerAddress'), 'warning'); return; }
  const originPattern = `${url.origin}/*`;
  let permissionPromise;
  try {
    // Call permissions.request before the first await so Edge can associate it
    // directly with the user's click on this button.
    permissionPromise = chrome.permissions.request({ origins: [originPattern] });
  } catch (error) {
    setNote(els.targetStatus, `${t('permissionDenied', { origin: url.origin })} (${error.message || error})`, 'warning');
    return;
  }
  els.openMixerBtn.disabled = true;
  setNote(els.targetStatus, t('openingMixer'));
  try {
    const permitted = await permissionPromise;
    if (!permitted) {
      setNote(els.targetStatus, t('permissionDenied', { origin: url.origin }), 'warning');
      return;
    }
    // Pin the exact tab and URL captured when the user pressed the button.
    selectedMixerTabId = context.tabId;
    selectedMixerContext = { ...context };
    if (continuousLearning || targetPickerActive || midiLearnArmed || pendingTarget) {
      stopLearningSession({ fromPage: false, quiet: true });
    }
    await chrome.storage.session.set({ [SELECTED_MIXER_CONTEXT_KEY]: selectedMixerContext });
    void sendEngineCommand('SET_MIXER_CONTEXT', { context: selectedMixerContext }).catch(() => {});
    await ensureContentScript(selectedMixerTabId);
    updateMixerContextDisplay();
    updateLearnButtons();
    await refreshMappingLabels();
    await refreshFeedbackMonitors();
    void pollFaderFeedback();
    setNote(els.targetStatus, t('mixerOpened', { url: context.url }), 'success');
    toast(t('mixerOpened', { url: url.origin }));
  } catch (error) {
    setNote(els.targetStatus, t('pickerInjectFail', { error: error.message }), 'warning');
  } finally {
    els.openMixerBtn.disabled = !currentBrowserTabContext;
  }
}

async function refreshCurrentBrowserTabContext(tabId = null) {
  let tab = null;
  try {
    if (Number.isInteger(tabId)) tab = await chrome.tabs.get(tabId);
    else {
      const activeTabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
      tab = activeTabs?.[0] || null;
    }
  } catch (_) { tab = null; }
  currentBrowserTabContext = activeTabContextFromTab(tab);
  if (els.openMixerBtn) els.openMixerBtn.disabled = !currentBrowserTabContext;
  return currentBrowserTabContext;
}

async function restoreSelectedMixerContext() {
  let stored = null;
  try {
    const data = await chrome.storage.session.get([SELECTED_MIXER_CONTEXT_KEY, LEGACY_ACTIVE_TAB_CONTEXT_KEY]);
    stored = data[SELECTED_MIXER_CONTEXT_KEY] || data[LEGACY_ACTIVE_TAB_CONTEXT_KEY] || null;
  } catch (_) { /* Session storage may be unavailable in older profiles. */ }
  if (!stored || !Number.isInteger(stored.tabId)) {
    updateMixerContextDisplay();
    updateLearnButtons();
    return false;
  }
  try {
    const tab = await chrome.tabs.get(stored.tabId);
    const context = activeTabContextFromTab(tab);
    if (!context) throw new Error('The previously selected mixer tab is no longer available.');
    selectedMixerTabId = context.tabId;
    selectedMixerContext = context;
    await chrome.storage.session.set({ [SELECTED_MIXER_CONTEXT_KEY]: context });
    await chrome.storage.session.remove(LEGACY_ACTIVE_TAB_CONTEXT_KEY);
    updateMixerContextDisplay();
    updateLearnButtons();
    return true;
  } catch (_) {
    selectedMixerTabId = null;
    selectedMixerContext = null;
    await chrome.storage.session.remove([SELECTED_MIXER_CONTEXT_KEY, LEGACY_ACTIVE_TAB_CONTEXT_KEY]).catch(() => {});
    updateMixerContextDisplay();
    updateLearnButtons();
    return false;
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

async function startTargetPickerSession() {
  if (!continuousLearning) return false;
  const tabId = selectedMixerTabId;
  if (!Number.isInteger(tabId)) {
    setNote(els.targetStatus, t('selectMixerTab'), 'warning');
    stopLearningSession({ fromPage: false, quiet: true });
    return false;
  }
  try {
    await ensureContentScript(tabId);
    const response = await chrome.tabs.sendMessage(tabId, {
      type: 'START_PICKER', language: currentLanguage, continuous: true
    });
    if (!response || !response.ok) throw new Error(t('pickerNoStart'));
    targetPickerActive = true;
    pendingTarget = null;
    void sendEngineCommand('SET_LEARNING', { continuous: true }).catch(() => {});
    midiLearnArmed = false;
    updateLearnButtons();
    setNote(els.targetStatus, t('continuousPickerPrompt'), 'success');
    setNote(els.learnStatus, t('continuousPickerPrompt'), 'success');
    return true;
  } catch (error) {
    setNote(els.targetStatus, t('pickerInjectFail', { error: error.message }), 'warning');
    stopLearningSession({ fromPage: false, quiet: true });
    return false;
  }
}

async function chooseMidiTarget() {
  if (!Number.isInteger(selectedMixerTabId)) {
    toast(t('selectMixerTab'));
    return;
  }
  continuousLearning = true;
  pendingTarget = null;
  midiLearnArmed = false;
  void sendEngineCommand('SET_LEARNING', { continuous: true }).catch(() => {});
  await startTargetPickerSession();
}

async function addParameterTarget() {
  if (continuousLearning || targetPickerActive || midiLearnArmed) stopLearningSession({ fromPage: false, quiet: true });
  const key = els.parameterKeyInput.value.trim();
  const match = key.match(/^((?:[ialfsp]\.\d+\.|m\.))(.+)$/i);
  if (!match || !/^(?:[ialfsp]\.\d+|m)(?:\.[a-zA-Z0-9_]+)+$/.test(key)) {
    setNote(els.targetStatus, t('parameterInvalid'), 'warning');
    return;
  }
  const tabId = selectedMixerTabId;
  if (!Number.isInteger(tabId)) {
    setNote(els.targetStatus, t('parameterMissingTab'), 'warning');
    return;
  }
  let tab;
  try { tab = await chrome.tabs.get(tabId); } catch (_) { tab = null; }
  if (!tab || !tab.url) {
    setNote(els.targetStatus, t('parameterMissingTab'), 'warning');
    return;
  }
  let origin;
  try { origin = new URL(tab.url).origin; } catch (_) { setNote(els.targetStatus, t('invalidMixerAddress'), 'warning'); return; }
  const prefix = match[1];
  const controlPath = match[2];
  const controlLabel = els.parameterLabelInput.value.trim() || controlPath.replace(/\./g, ' · ');
  const channelName = prefix === 'm.' ? '' : (prefix.replace(/\.$/, '') + ' · ');
  const mode = mappingModeUtils?.inferParameterMode(key) || 'fader';
  pendingTarget = {
    backend: 'web-parameter', origin, pageUrl: tab.url, tabId,
    parameterKey: key, key, channelPrefix: prefix,
    controlName: controlPath.split('.').pop(), controlLabel,
    channelName: '', label: els.parameterLabelInput.value.trim() || `${channelName}${controlLabel}`,
    mode, capabilities: [mode]
  };
  selectedMixerTabId = tabId;
  continuousLearning = false;
  targetPickerActive = false;
  midiLearnArmed = false;
  setNote(els.targetStatus, t('selectedTarget', { label: pendingTarget.label }), 'success');
  setNote(els.learnStatus, t('targetReady'), 'success');
  updateLearnButtons();
  void sendEngineCommand('SET_TARGET', { target: pendingTarget, continuous: false });
  toast(t('targetPicked', { label: pendingTarget.label }));
}

function getDefaultFeedbackColors() {
  return colorUtils ? colorUtils.normalizeColors(lastFeedbackColors || null) : {
    activeColor: '#00FF00', inactiveColor: '#000000'
  };
}

function getSelectedOutputFeedbackProfile() {
  const output = engineState.outputs?.find((item) => item.id === selectedMidiOutput) || null;
  try {
    if (deviceProfiles && typeof deviceProfiles.detectFeedbackProfile === 'function') {
      return deviceProfiles.detectFeedbackProfile(output) || 'generic';
    }
  } catch (error) {
    console.warn('[Open Soundcraft MIDI] Could not detect MIDI feedback profile:', error);
  }
  return 'generic';
}


async function persistLastFeedbackColors(colors) {
  const normalized = colorUtils
    ? colorUtils.normalizeColors(colors)
    : { activeColor: '#00FF00', inactiveColor: '#000000' };
  lastFeedbackColors = normalized;
  await chrome.storage.local.set({ [FEEDBACK_COLORS_KEY]: normalized });
}

function createMapping(msg) {
  const mode = mappingModeUtils?.resolveTargetMode(pendingTarget, pendingTarget?.mode || 'toggle') || pendingTarget?.mode || 'toggle';
  pendingTarget.mode = mode;
  if (mode === 'fader' && msg.kind !== 'cc' && msg.kind !== 'pitchbend') {
    setNote(els.learnStatus, t('faderNeedsCC'), 'warning');
    // Keep Learn armed so the user can immediately try another controller.
    updateLearnButtons();
    return;
  }
  const feedbackColors = getDefaultFeedbackColors();
  const mapping = {
    id: crypto.randomUUID(), enabled: true, mode,
    midi: { kind: msg.kind, channel: msg.channel, number: msg.number },
    feedback: { enabled: true, kind: 'auto', profile: getSelectedOutputFeedbackProfile(), channel: msg.channel, number: msg.number, ...feedbackColors },
    target: { ...pendingTarget }, createdAt: new Date().toISOString()
  };
  const duplicate = mappings.find((item) => sameMidi(item, msg));
  if (duplicate) {
    const replace = window.confirm(t('midiAlreadyMapped', { label: duplicate.target.label }));
    if (!replace) {
      midiLearnArmed = true;
      updateLearnButtons();
      setNote(els.learnStatus, t('waitingMidi'), 'warning');
      return;
    }
    mappings = mappings.filter((item) => item.id !== duplicate.id);
  }
  mappings.push(mapping);
  midiLearnArmed = false;
  pendingTarget = null;
  targetPickerActive = false;
  updateLearnButtons();
  void saveMappings();
  renderMappings();
  setNote(els.learnStatus, t('mappingStored', { label: mapping.target.label, midi: midiDescription(msg) }), 'success');
  toast(t('mappingSaved'));
  lastFeedbackValues.clear();
  if (continuousLearning) {
    // Keep the target-picking session open: after learning each MIDI control,
    // immediately arm the next click on the mixer for rapid batch assignment.
    void startTargetPickerSession();
  } else {
    setNote(els.targetStatus, t('selectTargetAgain'));
  }
}


function stopLearningSession(options = {}) {
  const fromPage = options.fromPage === true;
  const quiet = options.quiet === true;
  const tabId = selectedMixerTabId;
  const active = continuousLearning || targetPickerActive || midiLearnArmed || Boolean(pendingTarget);
  continuousLearning = false;
  targetPickerActive = false;
  midiLearnArmed = false;
  pendingTarget = null;
  void sendEngineCommand('STOP_LEARNING').catch(() => {});
  if (!fromPage && Number.isInteger(tabId)) {
    chrome.tabs.sendMessage(tabId, { type: 'CANCEL_PICKER' }).catch(() => {});
  }
  updateLearnButtons();
  if (active && !quiet) {
    setNote(els.learnStatus, t('learningStopped'), 'success');
    setNote(els.targetStatus, t('learningStopped'));
  }
}

async function findTabForTarget(target) {
  const origin = target?.origin || null;
  const candidates = [];
  if (Number.isInteger(target?.tabId)) candidates.push(target.tabId);
  if (Number.isInteger(selectedMixerTabId) && !candidates.includes(selectedMixerTabId)) candidates.push(selectedMixerTabId);
  for (const tabId of candidates) {
    try {
      const tab = await chrome.tabs.get(tabId);
      if (tab && tab.url && (!origin || sameOriginTab(tab, origin))) return tabId;
    } catch (_) { /* A closed/restarted tab ID may be stale; try the pinned mixer tab. */ }
  }
  // Do not silently route mappings to an arbitrary same-origin tab. The user
  // explicitly pins one mixer tab with the button above.
  return null;
}

function updateFeedbackStatus() {
  if (!els.feedbackStatus) return;
  if (!els.feedbackEnabled.checked) { setNote(els.feedbackStatus, t('feedbackDisabled')); return; }
  if (!engineState.connected) { setNote(els.feedbackStatus, t('feedbackNeedsMidi')); return; }
  const output = engineState.outputs?.find((item) => item.id === els.midiOutputSelect.value && item.state !== 'disconnected');
  if (!output) { setNote(els.feedbackStatus, t('feedbackNoOutput'), 'warning'); return; }
  const format = els.feedbackFormatSelect.value === 'auto' ? 'CC / Pitch Bend' : (els.feedbackFormatSelect.value === 'cc' ? 'CC' : 'Pitch Bend');
  setNote(els.feedbackStatus, t('feedbackActive', { format }), 'success');
}


async function pollFaderFeedback() {
  try { await sendEngineCommand('POLL_FEEDBACK'); } catch (_) { /* Engine may not be active yet. */ }
}


async function refreshFeedbackMonitors() {
  try { await sendEngineCommand('REFRESH_MONITORS'); } catch (_) { /* Engine may not be active yet. */ }
}


function activeTabContextFromTab(tab) {
  try { return mixerTabContextUtils?.fromTab(tab) || null; }
  catch (_) { return null; }
}

async function loadSettings() {
  const data = await chrome.storage.local.get([MIDI_SETTINGS_KEY, LANGUAGE_KEY, FEEDBACK_COLORS_KEY, MIDI_PERMISSION_GRANTED_KEY]);
  const midi = data[MIDI_SETTINGS_KEY] || {};
  if (typeof midi.feedbackEnabled === 'boolean') els.feedbackEnabled.checked = midi.feedbackEnabled;
  if (midi.feedbackFormat) els.feedbackFormatSelect.value = midi.feedbackFormat;
  if (midi.inputId) selectedMidiInput = midi.inputId;
  if (midi.outputId) selectedMidiOutput = midi.outputId;
  lastFeedbackColors = data[FEEDBACK_COLORS_KEY] && colorUtils ? colorUtils.normalizeColors(data[FEEDBACK_COLORS_KEY]) : null;
  // The first-time permission grant is stored persistently. Side Panel contexts
  // are recreated when closed, so an in-memory flag alone would reopen the
  // permission tab on every subsequent launch.
  midiPermissionGrantedInTab = data[MIDI_PERMISSION_GRANTED_KEY] === true;
  currentLanguage = data[LANGUAGE_KEY] === 'en' ? 'en' : 'de';
  applyLanguage();
}
async function saveMidiSettings() {
  await chrome.storage.local.set({ [MIDI_SETTINGS_KEY]: {
    inputId: els.midiInputSelect.value || '', outputId: els.midiOutputSelect.value || '', feedbackEnabled: els.feedbackEnabled.checked,
    feedbackFormat: els.feedbackFormatSelect.value
  } });
  void sendEngineCommand('UPDATE_SETTINGS', { settings: { inputId: els.midiInputSelect.value || '', outputId: els.midiOutputSelect.value || '', feedbackEnabled: els.feedbackEnabled.checked, feedbackFormat: els.feedbackFormatSelect.value } }).catch(() => {});
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


function mappingTypeLabel(mapping) { return mapping.mode === 'fader' ? t('fader') : t('toggle'); }
function clampInteger(value, min, max, fallback) {
  const number = Number.parseInt(value, 10);
  return Number.isInteger(number) ? Math.max(min, Math.min(max, number)) : fallback;
}

function renderMappings() {
  els.mappingList.replaceChildren();
  if (!mappings.length) {
    const empty = document.createElement('div'); empty.className = 'empty'; empty.textContent = t('noMappings'); els.mappingList.append(empty);
      return;
  }
  for (const mapping of mappings) {
    mapping.feedback ||= { enabled: true, kind: 'auto', profile: 'generic', channel: mapping.midi.channel, number: mapping.midi.number, ...getDefaultFeedbackColors() }
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

    const feedbackControls = document.createElement('div'); feedbackControls.className = 'mapping-feedback';
    const feedbackLabel = document.createElement('label'); feedbackLabel.className = 'mapping-feedback-toggle';
    const feedbackCheck = document.createElement('input'); feedbackCheck.type = 'checkbox'; feedbackCheck.checked = mapping.feedback.enabled !== false;
    feedbackCheck.addEventListener('change', async () => { mapping.feedback.enabled = feedbackCheck.checked; lastFeedbackValues.clear(); await saveMappings(); updateFeedbackStatus(); });
    const feedbackText = document.createElement('span'); feedbackText.textContent = t('feedback'); feedbackLabel.append(feedbackCheck, feedbackText);

    const profileLabel = document.createElement('label'); profileLabel.textContent = t('feedbackProfile');
    const profileSelect = document.createElement('select'); profileSelect.className = 'feedback-profile';
    profileSelect.add(new Option(t('feedbackGeneric'), 'generic'));
    profileSelect.add(new Option(t('feedbackApc'), 'apc-mini-mk2'));
    profileSelect.value = mapping.feedback.profile || 'generic';
    profileSelect.addEventListener('change', async () => { mapping.feedback.profile = profileSelect.value; lastFeedbackValues.clear(); await saveMappings(); renderMappings(); void pollFaderFeedback(); });
    profileLabel.append(profileSelect);

    const outChannelLabel = document.createElement('label'); outChannelLabel.textContent = t('outputChannel');
    outChannelLabel.hidden = profileSelect.value === 'apc-mini-mk2';
    const outChannel = document.createElement('input'); outChannel.type = 'number'; outChannel.min = '1'; outChannel.max = '16'; outChannel.value = String((Number.isInteger(mapping.feedback.channel) ? mapping.feedback.channel : mapping.midi.channel) + 1); outChannel.title = t('outputChannel');
    outChannel.addEventListener('change', async () => { mapping.feedback.channel = clampInteger(outChannel.value, 1, 16, mapping.midi.channel + 1) - 1; outChannel.value = String(mapping.feedback.channel + 1); lastFeedbackValues.clear(); await saveMappings(); });
    const outNumberLabel = document.createElement('label'); outNumberLabel.textContent = t('outputNumber');
    const outNumber = document.createElement('input'); outNumber.type = 'number'; outNumber.min = '0'; outNumber.max = '127'; outNumber.value = String(Number.isInteger(mapping.feedback.number) ? mapping.feedback.number : mapping.midi.number); outNumber.title = t('outputNumber');
    outNumber.addEventListener('change', async () => { mapping.feedback.number = clampInteger(outNumber.value, 0, 127, mapping.midi.number); outNumber.value = String(mapping.feedback.number); lastFeedbackValues.clear(); await saveMappings(); void pollFaderFeedback(); });
    outChannelLabel.append(outChannel); outNumberLabel.append(outNumber);
    feedbackControls.append(feedbackLabel, profileLabel, outChannelLabel, outNumberLabel);

    if (mapping.mode === 'toggle') {
      const colorControls = document.createElement('div'); colorControls.className = 'mapping-feedback-colors';
      const activeLabel = document.createElement('label'); activeLabel.append(document.createTextNode(`${t('feedbackActiveColor')} `));
      const activeColor = document.createElement('input'); activeColor.type = 'color';
      mapping.feedback.activeColor = colorUtils ? colorUtils.normalizeHex(mapping.feedback.activeColor, getDefaultFeedbackColors().activeColor) : (mapping.feedback.activeColor || '#00FF00');
      activeColor.value = mapping.feedback.activeColor;
      activeColor.setAttribute('value', activeColor.value);
      activeColor.title = activeColor.value;
      const activeValue = document.createElement('span'); activeValue.className = 'color-value'; activeValue.textContent = activeColor.value;
      activeColor.addEventListener('input', () => { activeValue.textContent = activeColor.value.toUpperCase(); activeColor.title = activeValue.textContent; });
      activeColor.addEventListener('change', async () => {
        mapping.feedback.activeColor = activeColor.value.toUpperCase();
        activeValue.textContent = mapping.feedback.activeColor; activeColor.title = mapping.feedback.activeColor;
        await persistLastFeedbackColors({ activeColor: mapping.feedback.activeColor, inactiveColor: mapping.feedback.inactiveColor });
        lastFeedbackValues.clear(); await saveMappings(); void pollFaderFeedback();
      });
      activeLabel.append(activeColor, activeValue);
      const inactiveLabel = document.createElement('label'); inactiveLabel.append(document.createTextNode(`${t('feedbackInactiveColor')} `));
      const inactiveColor = document.createElement('input'); inactiveColor.type = 'color';
      mapping.feedback.inactiveColor = colorUtils ? colorUtils.normalizeHex(mapping.feedback.inactiveColor, getDefaultFeedbackColors().inactiveColor) : (mapping.feedback.inactiveColor || '#000000');
      inactiveColor.value = mapping.feedback.inactiveColor;
      inactiveColor.setAttribute('value', inactiveColor.value);
      inactiveColor.title = inactiveColor.value;
      const inactiveValue = document.createElement('span'); inactiveValue.className = 'color-value'; inactiveValue.textContent = inactiveColor.value;
      inactiveColor.addEventListener('input', () => { inactiveValue.textContent = inactiveColor.value.toUpperCase(); inactiveColor.title = inactiveValue.textContent; });
      inactiveColor.addEventListener('change', async () => {
        mapping.feedback.inactiveColor = inactiveColor.value.toUpperCase();
        inactiveValue.textContent = mapping.feedback.inactiveColor; inactiveColor.title = mapping.feedback.inactiveColor;
        await persistLastFeedbackColors({ activeColor: mapping.feedback.activeColor, inactiveColor: mapping.feedback.inactiveColor });
        lastFeedbackValues.clear(); await saveMappings(); void pollFaderFeedback();
      });
      inactiveLabel.append(inactiveColor, inactiveValue);
      colorControls.append(activeLabel, inactiveLabel);
      feedbackControls.append(colorControls);
      const hint = document.createElement('small'); hint.className = 'feedback-apc-hint'; hint.textContent = t('feedbackApcHint');
      feedbackControls.append(hint);
    }
    selector.append(feedbackControls);

    const actions = document.createElement('div'); actions.className = 'mapping-actions';
    const enabled = document.createElement('button'); enabled.className = 'secondary'; enabled.textContent = mapping.enabled === false ? t('enable') : t('pause');
    enabled.addEventListener('click', async () => { mapping.enabled = mapping.enabled === false; lastFeedbackValues.clear(); await saveMappings(); renderMappings(); });
    const remove = document.createElement('button'); remove.className = 'mapping-delete'; remove.textContent = t('delete');
    remove.addEventListener('click', async () => { mappings = mappings.filter((item) => item.id !== mapping.id); lastFeedbackValues.clear(); await saveMappings(); renderMappings(); });
    actions.append(enabled, remove);
    row.append(target, selector, actions); els.mappingList.append(row);
  }
}

async function saveMappings() { await chrome.storage.local.set({ [STORAGE_KEY]: mappings }); void sendEngineCommand('SET_MAPPINGS', { mappings }).catch(() => {}); void refreshFeedbackMonitors(); }
async function loadMappings() {
  try {
    const data = await chrome.storage.local.get(STORAGE_KEY);
    mappings = Array.isArray(data[STORAGE_KEY]) ? data[STORAGE_KEY] : [];
    for (const mapping of mappings) {
      if (!mapping.feedback) mapping.feedback = { enabled: true, kind: 'auto', profile: 'generic', channel: mapping.midi.channel, number: mapping.midi.number, ...getDefaultFeedbackColors() };
      mapping.feedback.profile ||= 'generic';
      Object.assign(mapping.feedback, colorUtils ? colorUtils.normalizeColors(mapping.feedback, getDefaultFeedbackColors()) : getDefaultFeedbackColors());
      if (mapping.mode === 'toggle' && mapping.feedback.enabled === undefined) mapping.feedback.enabled = true;
      if (mapping.target?.backend === 'demo') mapping.target.backend = 'web';
      mapping.mode = mappingModeUtils?.resolveTargetMode(mapping.target, mapping.mode || 'toggle') || mapping.mode || 'toggle';
    }
    renderMappings();
  } catch (error) { toast(t('profileLoadFailed', { error: error.message })); }
}

function cancelLearn() {
  stopLearningSession({ fromPage: false });
}

function exportMappings() {
  const blob = new Blob([JSON.stringify({ version: '0.5.0-beta.15', mappings }, null, 2)], { type: 'application/json' });
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
      mapping.mode = mappingModeUtils?.resolveTargetMode(mapping.target, mapping.mode || 'toggle') || mapping.mode || 'toggle';
      if (!mapping.feedback) mapping.feedback = { enabled: true, kind: 'auto', profile: 'generic', channel: mapping.midi.channel, number: mapping.midi.number, ...getDefaultFeedbackColors() };
      else { mapping.feedback.profile ||= 'generic'; Object.assign(mapping.feedback, colorUtils ? colorUtils.normalizeColors(mapping.feedback, getDefaultFeedbackColors()) : getDefaultFeedbackColors()); if (mapping.mode === 'toggle' && mapping.feedback.enabled === undefined) mapping.feedback.enabled = true; }
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
      backend: 'web-dom', origin, pageUrl: senderUrl, tabId, selector: dom.selector, elementLabel: dom.label,
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
      pendingTarget.tabId = tabId;
      if (!pendingTarget.origin) pendingTarget.origin = origin;
      if (!pendingTarget.pageUrl) pendingTarget.pageUrl = senderUrl;
    } catch (error) {
      setNote(els.targetStatus, t('pickerInjectFail', { error: error.message }), 'warning'); return;
    }
  }
  targetPickerActive = false;
  pendingTarget.mode = mappingModeUtils?.resolveTargetMode(pendingTarget, pendingTarget.mode || 'toggle') || pendingTarget.mode || 'toggle';
  setNote(els.targetStatus, t('selectedTarget', { label: pendingTarget.label }), 'success');
  if (engineState.connected) {
    // A website target click immediately starts MIDI Learn; no second button
    // press is needed for each control in a continuous assignment session.
    midiLearnArmed = true;
    setNote(els.learnStatus, t('autoLearnStarted'), 'success');
  } else {
    midiLearnArmed = false;
    setNote(els.learnStatus, t('needMidiFirst'), 'warning');
  }
  updateLearnButtons();
  toast(t('targetPicked', { label: pendingTarget.label }));
}

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== 'local') return;
  if (changes[STORAGE_KEY] && Array.isArray(changes[STORAGE_KEY].newValue)) {
    mappings = changes[STORAGE_KEY].newValue;
    renderMappings();
  }
  if (!changes[MIDI_PERMISSION_GRANTED_KEY]) return;
  const granted = changes[MIDI_PERMISSION_GRANTED_KEY].newValue === true;
  midiPermissionGrantedInTab = granted;
  if (els.connectMidiBtn && !engineState.connected) els.connectMidiBtn.textContent = granted ? t('connectMidi') : t('openMidiConnectTab');
});

chrome.runtime.onMessage.addListener((message, sender) => {
  if (!message || !message.type) return;
  if (message.type === 'MIDI_PERMISSION_GRANTED' && IS_SIDE_PANEL && sender?.id === chrome.runtime.id) {
    // Do not immediately create a second MIDIAccess object in the Side Panel
    // after the permission tab's request resolves. Wait for a fresh click here.
    midiPermissionGrantedInTab = true;
    void chrome.storage.local.set({ [MIDI_PERMISSION_GRANTED_KEY]: true });
    if (els.connectMidiBtn) els.connectMidiBtn.textContent = t('connectMidi');
    setNote(els.midiStatus, t('midiPermissionGrantedClickToConnect'), 'success');
    return;
  }
  if (message.type === 'ENGINE_STATUS') { applyEngineStatus(message); return; }
  if (message.type === 'ENGINE_MIDI_EVENT') {
    const description = message.description || '';
    els.lastMidi.textContent = `${message.input?.name || message.input?.id || 'MIDI'}: ${description}`;
    addLog(description, message.message?.raw || []);
    return;
  }
  if (message.type === 'ENGINE_TARGET_READY') {
    pendingTarget = message.target || null;
    midiLearnArmed = message.learningArmed === true;
    targetPickerActive = false;
    setNote(els.targetStatus, t('selectedTarget', { label: pendingTarget?.label || t('unknownTarget') }), 'success');
    setNote(els.learnStatus, midiLearnArmed ? t('autoLearnStarted') : t('needMidiFirst'), midiLearnArmed ? 'success' : 'warning');
    updateLearnButtons();
    toast(t('targetPicked', { label: pendingTarget?.label || t('unknownTarget') }));
    return;
  }
  if (message.type === 'ENGINE_PICKER_STARTED') {
    targetPickerActive = true; pendingTarget = null; midiLearnArmed = false; updateLearnButtons(); return;
  }
  if (message.type === 'ENGINE_MAPPING_CREATED') {
    void loadMappings();
    setNote(els.learnStatus, t('mappingStored', { label: message.mapping?.target?.label || t('unknownTarget'), midi: message.description || '' }), 'success');
    toast(message.replaced ? t('mappingSaved') : t('mappingSaved'));
    return;
  }
  if (message.type === 'ENGINE_LEARN_WARNING' || message.type === 'ENGINE_WARNING') {
    setNote(els.learnStatus, message.message || t('midiError'), 'warning');
    return;
  }
  if (message.type === 'ENGINE_LEARNING_STOPPED') {
    continuousLearning = false; targetPickerActive = false; midiLearnArmed = false; pendingTarget = null; updateLearnButtons(); return;
  }
});

els.addParameterTargetBtn.addEventListener('click', () => void addParameterTarget());

els.languageSelect.addEventListener('change', async () => {
  currentLanguage = els.languageSelect.value === 'en' ? 'en' : 'de';
  await chrome.storage.local.set({ [LANGUAGE_KEY]: currentLanguage });
  applyLanguage();
  toast(t('languageSaved'));
});
els.connectMidiBtn.addEventListener('click', () => {
  if (IS_SIDE_PANEL && !engineState.connected && !midiPermissionGrantedInTab) {
    void openMidiPermissionTab();
    return;
  }
  // After permission is granted in the new tab, this second click starts the
  // actual MIDI session directly from a user gesture in the Side Panel.
  void connectMidi();
});
els.disconnectMidiBtn.addEventListener('click', () => void disconnectMidiDevices());
window.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && (continuousLearning || targetPickerActive || midiLearnArmed || pendingTarget)) {
    event.preventDefault();
    stopLearningSession({ fromPage: false });
  }
}, true);
els.refreshMidiBtn.addEventListener('click', () => { if (engineState.connected) rebuildMidiInputs(); else setNote(els.midiStatus, t('midiNotRequested')); });
els.midiInputSelect.addEventListener('change', async () => { selectedMidiInput = els.midiInputSelect.value; await saveMidiSettings(); void sendEngineCommand('SET_INPUT', { inputId: selectedMidiInput }).catch((error) => setNote(els.midiStatus, error.message, 'warning')); });
els.midiOutputSelect.addEventListener('change', async () => { selectedMidiOutput = els.midiOutputSelect.value; preferredMidiOutputId = selectedMidiOutput; lastFeedbackValues.clear(); await saveMidiSettings(); updateFeedbackStatus(); void sendEngineCommand('SET_OUTPUT', { outputId: selectedMidiOutput }).catch(() => {}); });
els.feedbackEnabled.addEventListener('change', async () => { lastFeedbackValues.clear(); await saveMidiSettings(); updateFeedbackStatus(); });
els.feedbackFormatSelect.addEventListener('change', async () => { lastFeedbackValues.clear(); await saveMidiSettings(); updateFeedbackStatus(); });
els.openMixerBtn.addEventListener('click', () => void useCurrentTabAsMixer());
els.pickTargetBtn.addEventListener('click', () => void chooseMidiTarget());
els.armLearnBtn.addEventListener('click', () => {
  if (!pendingTarget) { setNote(els.learnStatus, t('needLearnTarget'), 'warning'); return; }
  if (!engineState.connected) { setNote(els.learnStatus, t('needMidiFirst'), 'warning'); return; }
  midiLearnArmed = true; updateLearnButtons(); setNote(els.learnStatus, t('waitingMidi'), 'warning');
  void sendEngineCommand('ARM_LEARN').catch((error) => setNote(els.learnStatus, error.message, 'warning'));
});
els.cancelLearnBtn.addEventListener('click', cancelLearn);
els.exportBtn.addEventListener('click', exportMappings);
els.importBtn.addEventListener('click', () => els.importFile.click());
els.importFile.addEventListener('change', () => { if (els.importFile.files?.[0]) void importMappingsFile(els.importFile.files[0]); });

(async () => {
  // Load preferences first so mappings missing older color fields inherit the
  // user's most recently selected colors rather than hard-coded defaults.
  await loadSettings();
  // Track the current browser tab as a candidate, but do not select it as the
  // mixer until the user explicitly clicks 'Use current tab as mixer'.
  await refreshCurrentBrowserTabContext();
  await restoreSelectedMixerContext();
  // MIDI permission is requested once in a dedicated normal extension tab.
  // The hidden Offscreen Document owns MIDIAccess and the active MIDI ports.
  await loadMappings();
  if (!lastFeedbackColors && colorUtils) {
    lastFeedbackColors = colorUtils.latestColorsFromMappings(mappings);
    await chrome.storage.local.set({ [FEEDBACK_COLORS_KEY]: lastFeedbackColors });
  }
  await refreshFeedbackMonitors();
  await inspectMidiPermission();
  await sendEngineCommand('SYNC_STATE', { mappings, midiSettings: { inputId: selectedMidiInput, outputId: selectedMidiOutput, feedbackEnabled: els.feedbackEnabled.checked, feedbackFormat: els.feedbackFormatSelect.value }, mixerContext: selectedMixerContext, language: currentLanguage }).catch((error) => console.warn('[Open Soundcraft MIDI] Background engine not yet available:', error));
  await sendEngineCommand('GET_STATE').catch(() => {});
  updateLearnButtons();
  updateFeedbackStatus();
  // MIDI permission is bootstrapped in midi-permission.html. The offscreen
  // background engine owns the single MIDIAccess object and keeps it alive
  // while this Side Panel is closed.
})().catch((error) => console.error(error));
window.setInterval(() => { void refreshMappingLabels(); }, 2500);
// MIDI input, mapping execution, and feedback polling live in the persistent offscreen engine.
// Keep only a candidate for the one explicit "Use current tab as mixer"
// action. The pinned mixer target never changes just because another tab gets
// focus. Navigating the pinned tab itself updates its saved URL, not its ID.
chrome.tabs.onActivated.addListener((activeInfo) => {
  void refreshCurrentBrowserTabContext(activeInfo?.tabId);
});
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete') void refreshFeedbackMonitors();
  if (tab?.active && (changeInfo.url || changeInfo.status === 'complete')) {
    void refreshCurrentBrowserTabContext(tabId);
  }
  if (tabId === selectedMixerTabId && (changeInfo.url || changeInfo.status === 'complete')) {
    const context = activeTabContextFromTab(tab);
    let sameOrigin = false;
    try {
      sameOrigin = Boolean(context && selectedMixerContext?.url
        && new URL(context.url).origin === new URL(selectedMixerContext.url).origin);
    } catch (_) { sameOrigin = false; }
    if (context && sameOrigin) {
      selectedMixerContext = context;
      void chrome.storage.session.set({ [SELECTED_MIXER_CONTEXT_KEY]: context });
      updateMixerContextDisplay();
    } else {
      selectedMixerTabId = null;
      selectedMixerContext = null;
      // The Service Worker owns the session-context removal and Offscreen shutdown.
      if (continuousLearning || targetPickerActive || midiLearnArmed || pendingTarget) {
        stopLearningSession({ fromPage: false, quiet: true });
      }
      updateMixerContextDisplay();
      updateLearnButtons();
      setNote(els.targetStatus, t('mixerNotSelected'), 'warning');
    }
  }
});
window.addEventListener('focus', () => { void refreshCurrentBrowserTabContext(); });
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') void refreshCurrentBrowserTabContext();
});
chrome.tabs.onRemoved.addListener((tabId) => {
  if (tabId === selectedMixerTabId) {
    selectedMixerTabId = null;
    selectedMixerContext = null;
    // The Service Worker clears the stored context and stops the Offscreen engine.
    updateMixerContextDisplay();
    updateLearnButtons();
    setNote(els.targetStatus, t('noMatchingTab'), 'warning');
    if (continuousLearning || targetPickerActive || midiLearnArmed || pendingTarget) stopLearningSession({ fromPage: false, quiet: true });
  }
  void refreshCurrentBrowserTabContext();
});

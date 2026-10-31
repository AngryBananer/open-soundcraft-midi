'use strict';

(function (root) {
  function normalizeHttpUrl(rawUrl) {
    if (typeof rawUrl !== 'string' || !rawUrl.trim()) return null;
    try {
      const url = new URL(rawUrl.trim());
      if (!['http:', 'https:'].includes(url.protocol) || !url.hostname || url.username || url.password) return null;
      url.hash = '';
      return url.href;
    } catch (_) {
      return null;
    }
  }

  function fromTab(tab) {
    const url = normalizeHttpUrl(tab?.url);
    if (!url || !Number.isInteger(tab?.id)) return null;
    return {
      tabId: tab.id,
      windowId: Number.isInteger(tab.windowId) ? tab.windowId : null,
      url,
      title: typeof tab.title === 'string' ? tab.title : ''
    };
  }

  const api = Object.freeze({ normalizeHttpUrl, fromTab });
  root.OpenSoundcraftMixerTabContext = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(globalThis);

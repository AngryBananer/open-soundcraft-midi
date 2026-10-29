'use strict';

chrome.action.onClicked.addListener(async () => {
  const url = chrome.runtime.getURL('controller/controller.html');
  const existing = await chrome.tabs.query({ url });
  if (existing.length && existing[0].id !== undefined) {
    await chrome.tabs.update(existing[0].id, { active: true });
    return;
  }
  await chrome.tabs.create({ url });
});

const { setTimeout } = require('node:timers/promises');
const { Page } = require('puppeteer');

// Stencil 3 uses this delay before synchronizing its E2E element snapshots.
Page.prototype.waitForTimeout ??= setTimeout;

// Shared launcher for UI smoke agents. Needs playwright-core installed next to this file (npm i playwright-core) and CHROME_PATH pointing at a Chromium or headless-shell binary (npx playwright install chromium).
const { chromium, devices } = require('playwright-core');
const EXE = process.env.CHROME_PATH;
module.exports = { chromium, devices, launch: (opts = {}) => chromium.launch({ executablePath: EXE, ...opts }) };

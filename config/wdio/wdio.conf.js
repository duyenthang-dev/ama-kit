// Mẫu WebdriverIO cho suite ngoài "smoke". Chép thư mục này vào repo test của app, chạy "npm install",
// rồi đặt mobile.wdioConfig trỏ tới file này. "mobile-test run --suite <tên>" truyền vào các biến:
//   BROWSERSTACK_USERNAME, BROWSERSTACK_ACCESS_KEY, AMA_APP (bs://...), AMA_DEVICE, AMA_OS_VERSION, AMA_BUILD

for (const k of ['BROWSERSTACK_USERNAME', 'BROWSERSTACK_ACCESS_KEY', 'AMA_APP']) {
  if (!process.env[k]) throw new Error(`Thiếu ${k}. Chạy qua "mobile-test run --suite <tên> --yes".`);
}

export const config = {
  user: process.env.BROWSERSTACK_USERNAME,
  key: process.env.BROWSERSTACK_ACCESS_KEY,
  hostname: 'hub-cloud.browserstack.com',
  services: [['browserstack', { app: process.env.AMA_APP, browserstackLocal: false }]],
  suites: {
    smoke: ['./specs/smoke.e2e.js'],
  },
  maxInstances: 1,
  capabilities: [
    {
      platformName: 'Android',
      'appium:automationName': 'UiAutomator2',
      'appium:app': process.env.AMA_APP,
      'bstack:options': {
        deviceName: process.env.AMA_DEVICE || 'Google Pixel 8',
        osVersion: process.env.AMA_OS_VERSION || '14.0',
        projectName: 'ama-kit',
        buildName: process.env.AMA_BUILD || 'ama-kit',
        appiumVersion: '2.0.1',
        video: true,
      },
    },
  ],
  logLevel: 'warn',
  waitforTimeout: 15000,
  framework: 'mocha',
  reporters: ['spec'],
  mochaOpts: { ui: 'bdd', timeout: 180000 },
};

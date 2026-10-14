// BrowserStack App Automate, implement CloudProvider (xem cloud-provider.js).
// REST: https://www.browserstack.com/docs/app-automate/api-reference/introduction
// Appium hub: https://hub-cloud.browserstack.com/wd/hub (Appium 2, giao thức W3C)

import fs from 'node:fs';
import path from 'node:path';
import { requireCredentials, SERVICE_KEYS } from '../credentials.js';
import { UsageError } from '../errors.js';
import { basicAuth, request } from '../http.js';
import { webdriver } from './webdriver.js';

export function browserstackProvider() {
  const api = (process.env.BROWSERSTACK_API_BASE || 'https://api-cloud.browserstack.com').replace(/\/+$/, '');
  const hub = (process.env.BROWSERSTACK_HUB_URL || 'https://hub-cloud.browserstack.com/wd/hub').replace(/\/+$/, '');
  const c = requireCredentials(SERVICE_KEYS.browserstack, 'Lấy tại BrowserStack → Account → Access key.');
  const headers = { Authorization: basicAuth(c.BROWSERSTACK_USERNAME, c.BROWSERSTACK_ACCESS_KEY), Accept: 'application/json' };
  const get = (p, label) => request(api + p, { headers, label });
  const wd = webdriver(hub, headers);

  return {
    name: 'browserstack',
    secrets: () => [c.BROWSERSTACK_ACCESS_KEY],
    wdioEnv: () => ({ BROWSERSTACK_USERNAME: c.BROWSERSTACK_USERNAME, BROWSERSTACK_ACCESS_KEY: c.BROWSERSTACK_ACCESS_KEY }),

    async check() {
      const p = await get('/app-automate/plan.json', 'BrowserStack');
      return { plan: p.automate_plan || p.plan || null, parallelSessions: p.parallel_sessions_max_allowed ?? null };
    },

    async uploadApp(file) {
      if (!fs.existsSync(file)) throw new UsageError(`Không thấy file app: ${file}`);
      const form = new FormData();
      form.append('file', new Blob([fs.readFileSync(file)]), path.basename(file));
      const res = await request(`${api}/app-automate/upload`, { method: 'POST', headers, body: form, retries: 0, label: 'BrowserStack upload app' });
      return { appUrl: res.app_url };
    },

    async startSession({ appUrl, device, platform = 'android', buildName, sessionName }) {
      if (String(platform).toLowerCase() !== 'android') throw new UsageError('Bản này chỉ hỗ trợ Android (mobile.platform: android).');
      const caps = {
        platformName: 'Android',
        'appium:automationName': 'UiAutomator2',
        'appium:app': appUrl,
        'bstack:options': {
          deviceName: device?.name || 'Google Pixel 8',
          osVersion: String(device?.platformVersion || '14.0'),
          appiumVersion: '2.0.1',
          projectName: 'ama-kit',
          buildName: buildName || 'ama-kit',
          sessionName: sessionName || 'smoke',
          video: true,
          deviceLogs: true,
        },
      };
      const { sessionId } = await wd.newSession(caps);
      return {
        id: sessionId,
        // Chờ màn hình đầu tiên có ít nhất một view có resource-id, tức app đã mở và không crash.
        waitForApp: async (timeoutMs = 45000) => !!(await wd.waitFor(sessionId, 'xpath', '//*[@resource-id]', timeoutMs)),
        screenshot: () => wd.screenshot(sessionId),
        end: async (status, reason = '') => {
          try {
            await request(`${api}/app-automate/sessions/${sessionId}.json`, {
              method: 'PUT',
              headers: { ...headers, 'Content-Type': 'application/json' },
              body: JSON.stringify({ status, reason: reason.slice(0, 250) }),
              retries: 0,
              label: 'BrowserStack cập nhật trạng thái',
            });
          } finally {
            await wd.deleteSession(sessionId).catch(() => {});
          }
        },
        details: async () => {
          const s = (await get(`/app-automate/sessions/${sessionId}.json`, 'BrowserStack session'))?.automation_session || {};
          return { status: s.status, reason: s.reason, publicUrl: s.public_url, videoUrl: s.video_url, device: s.device, os: `${s.os || ''} ${s.os_version || ''}`.trim() };
        },
      };
    },
  };
}

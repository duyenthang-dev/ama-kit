// Client W3C WebDriver tối giản (Appium 2 nói giao thức này), không phụ thuộc.
// Đủ cho smoke tích hợp sẵn: mở session, đợi app, chụp màn hình, đóng session.
// Suite phức tạp hơn chạy bằng WebdriverIO qua mobile.wdioConfig.

import { ApiError } from '../errors.js';
import { request } from '../http.js';

export function webdriver(hubUrl, headers) {
  const hub = hubUrl.replace(/\/+$/, '');
  const call = (method, path, body, label) =>
    request(hub + path, {
      method,
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      retries: 0,
      label,
    });

  return {
    /** Tạo session; trả về { sessionId, capabilities }. */
    async newSession(capabilities) {
      const res = await call('POST', '/session', { capabilities: { alwaysMatch: capabilities, firstMatch: [{}] } }, 'Mở session thiết bị');
      const v = res?.value || {};
      const sessionId = v.sessionId || res?.sessionId;
      if (!sessionId) throw new ApiError('Hub không trả về sessionId.');
      return { sessionId, capabilities: v.capabilities || {} };
    },

    async findElement(sessionId, using, value) {
      try {
        const res = await call('POST', `/session/${sessionId}/element`, { using, value }, 'Tìm phần tử');
        return res?.value || null;
      } catch (e) {
        if (e.status === 404) return null;
        throw e;
      }
    },

    async waitFor(sessionId, using, value, timeoutMs = 30000, intervalMs = 1000) {
      const end = Date.now() + timeoutMs;
      while (Date.now() < end) {
        const el = await this.findElement(sessionId, using, value);
        if (el) return el;
        await new Promise((r) => setTimeout(r, intervalMs));
      }
      return null;
    },

    async screenshot(sessionId) {
      const res = await call('GET', `/session/${sessionId}/screenshot`, undefined, 'Chụp màn hình');
      return res?.value ? Buffer.from(res.value, 'base64') : null;
    },

    async deleteSession(sessionId) {
      await call('DELETE', `/session/${sessionId}`, undefined, 'Đóng session');
    },
  };
}

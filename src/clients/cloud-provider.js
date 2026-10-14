// Interface CloudProvider: lệnh mobile-test chỉ nói chuyện qua đây, nên đổi sang cloud khác
// (vd. Sauce Labs) chỉ cần thêm một file implement, không viết lại lệnh.
//
// interface CloudProvider {
//   name: string
//   check(): Promise<{ plan, parallelSessions }>
//   uploadApp(filePath): Promise<{ appUrl }>
//   startSession({ appUrl, device: { name, platformVersion }, platform, buildName, sessionName })
//       : Promise<Session>
//   wdioEnv(): Record<string,string>          biến môi trường cho WebdriverIO (không in ra)
//   secrets(): string[]                       giá trị cần che khỏi log
// }
// interface Session {
//   id: string
//   waitForApp(timeoutMs): Promise<boolean>
//   screenshot(): Promise<Buffer|null>
//   end(status: 'passed'|'failed', reason?): Promise<void>
//   details(): Promise<{ status, publicUrl, videoUrl, device, os }>
// }

import { UsageError } from '../errors.js';
import { browserstackProvider } from './browserstack.js';

const PROVIDERS = { browserstack: browserstackProvider };

export function getCloudProvider(project) {
  const name = String(project?.config?.mobile?.cloud || 'browserstack').toLowerCase();
  const make = PROVIDERS[name];
  if (!make) {
    throw new UsageError(`Device cloud "${name}" chưa được hỗ trợ. Có: ${Object.keys(PROVIDERS).join(', ')}. Thêm file trong src/clients/ theo interface ở cloud-provider.js.`);
  }
  return make();
}

export const supportedClouds = () => Object.keys(PROVIDERS);

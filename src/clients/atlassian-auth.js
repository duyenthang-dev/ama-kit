// Đăng nhập Atlassian Cloud dùng chung cho Jira và Confluence (email + API token, Basic auth).

import { atlassianSite } from '../config.js';
import { requireCredentials, SERVICE_KEYS } from '../credentials.js';
import { basicAuth } from '../http.js';

export function atlassianAuth(project, product = 'jira') {
  const base = atlassianSite(project, product);
  const c = requireCredentials(SERVICE_KEYS.atlassian, 'Tạo token tại https://id.atlassian.com/manage-profile/security/api-tokens.');
  return { base, headers: { Authorization: basicAuth(c.ATLASSIAN_EMAIL, c.ATLASSIAN_API_TOKEN), Accept: 'application/json' } };
}

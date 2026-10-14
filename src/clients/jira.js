// Jira Cloud REST API v3. Tài liệu: https://developer.atlassian.com/cloud/jira/platform/rest/v3/

import { request } from '../http.js';
import { atlassianAuth } from './atlassian-auth.js';

const BRIEF_FIELDS = ['summary', 'status', 'issuetype', 'parent', 'subtasks', 'issuelinks', 'description', 'updated', 'assignee'];

export function jiraClient(project) {
  const { base, headers } = atlassianAuth(project, 'jira');
  const get = (p, label) => request(base + p, { headers, label });
  const k = (key) => encodeURIComponent(key);

  return {
    base,
    myself: () => get('/rest/api/3/myself', 'Jira'),
    getIssue: (key) => get(`/rest/api/3/issue/${k(key)}?expand=names&fields=*all`, `Jira issue ${key}`),
    getIssueBrief: (key) => get(`/rest/api/3/issue/${k(key)}?fields=${BRIEF_FIELDS.join(',')}`, `Jira issue ${key}`),
    getRemoteLinks: (key) => get(`/rest/api/3/issue/${k(key)}/remotelink`, `Jira remote links ${key}`),

    /** Issue con trực tiếp (parent = KEY). Chỉ một vòng, giới hạn số lượng. */
    getChildren: async (key, max = 25) => {
      const res = await request(`${base}/rest/api/3/search/jql`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ jql: `parent = ${key} ORDER BY key`, maxResults: max, fields: ['summary', 'status', 'issuetype'] }),
        label: `Jira issue con của ${key}`,
      });
      return res?.issues || [];
    },

    addComment: (key, adf) =>
      request(`${base}/rest/api/3/issue/${k(key)}/comment`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: adf }),
        retries: 0,
        label: `Jira comment ${key}`,
      }),
  };
}

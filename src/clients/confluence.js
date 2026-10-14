// Confluence Cloud REST API v2. Tài liệu: https://developer.atlassian.com/cloud/confluence/rest/v2/

import { request } from '../http.js';
import { atlassianAuth } from './atlassian-auth.js';

export function confluenceClient(project) {
  const { base, headers } = atlassianAuth(project, 'confluence');
  const get = (p, label) => request(base + p, { headers, label });

  return {
    base,
    spaces: () => get('/wiki/api/v2/spaces?limit=1', 'Confluence'),

    /** Ưu tiên thân ADF; nếu page không có thì lấy storage (XHTML). */
    getPage: async (id) => {
      const pid = encodeURIComponent(id);
      const page = await get(`/wiki/api/v2/pages/${pid}?body-format=atlas_doc_format`, `Confluence page ${id}`);
      if (page?.body?.atlas_doc_format?.value) return { ...page, _format: 'adf' };
      const st = await get(`/wiki/api/v2/pages/${pid}?body-format=storage`, `Confluence page ${id}`);
      return { ...st, _format: 'storage' };
    },

    /** Link rút gọn /wiki/x/<mã> → URL thật (theo redirect). */
    resolveTinyUrl: async (url) => {
      const res = await request(url, { headers, json: false, label: 'Confluence link rút gọn' });
      return res.url;
    },
  };
}

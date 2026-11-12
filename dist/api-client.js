'use strict';
(() => {
  class ApiError extends Error {
    constructor(status, code, message, fields = []) {
      super(message); this.name = 'ApiError'; this.status = status; this.code = code; this.fields = fields;
    }
  }
  class Client {
    constructor({ base = '/api', origin = window.location.origin, language = () => 'zh', fetcher = window.fetch.bind(window) } = {}) {
      const url = new URL(base, origin);
      if (url.origin !== origin || url.username || url.password || url.search || url.hash || !/^https?:$/.test(url.protocol)) {
        throw new ApiError(0, 'INVALID_API_ORIGIN', 'The API must use the same origin as this application.');
      }
      this.base = url.href.replace(/\/$/, ''); this.language = language; this.fetcher = fetcher; this.csrfToken = null;
    }
    /** The save token, fetched once: parallel saves share one request, and the app fetches it early while it loads. */
    csrf(signal) {
      if (this.csrfToken) return Promise.resolve(this.csrfToken);
      if (!this.csrfPending) this.csrfPending = this.request('/auth/csrf', { signal }).then(r => (this.csrfToken = r?.csrfToken || null)).finally(() => { this.csrfPending = null; });
      return this.csrfPending;
    }
    url(path) { if (!path.startsWith('/') || path.startsWith('//')) throw new Error('An API path must start with one slash'); return this.base + path; }
    async request(path, { method = 'GET', body, timeout = 45000, signal } = {}) {
      if (signal?.aborted) throw new ApiError(0, 'CANCELLED', this.language() === 'en' ? 'The request was cancelled.' : '请求已取消。');
      const writing = !['GET', 'HEAD', 'OPTIONS'].includes(method);
      if (writing && !this.csrfToken) await this.csrf(signal);
      if (writing && !this.csrfToken) throw new ApiError(403, 'CSRF_UNAVAILABLE', this.language() === 'en' ? 'Refresh the page before saving.' : '请刷新页面后再保存。');
      const controller = new AbortController(), timer = setTimeout(() => controller.abort(), timeout);
      const cancel = () => controller.abort();
      signal?.addEventListener('abort', cancel, { once: true });
      try {
        const response = await this.fetcher(this.url(path), {
          method, credentials: 'same-origin', cache: 'no-store', signal: controller.signal,
          headers: { Accept: 'application/json', 'Accept-Language': this.language(), ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...(writing ? { 'X-CSRF-Token': this.csrfToken } : {}) },
          ...(body === undefined ? {} : { body: JSON.stringify(body) })
        });
        let value = null;
        if (response.status !== 204) { try { value = await response.json(); } catch { throw new ApiError(response.status, 'INVALID_RESPONSE', this.language() === 'en' ? 'The service returned an unreadable response.' : '服务返回了无法读取的响应。'); } }
        if (signal?.aborted) throw new ApiError(0, 'CANCELLED', this.language() === 'en' ? 'The request was cancelled.' : '请求已取消。');
        if (!response.ok) {
          if (response.status === 401 || /CSRF/.test(value?.error?.code || '')) this.csrfToken = null;
          throw new ApiError(response.status, value?.error?.code || 'REQUEST_FAILED', value?.error?.message || (this.language() === 'en' ? 'The request failed.' : '请求失败。'), Array.isArray(value?.error?.fields) ? value.error.fields : []);
        }
        return value;
      } catch (error) {
        if (error instanceof ApiError) throw error;
        if (signal?.aborted) throw new ApiError(0, 'CANCELLED', this.language() === 'en' ? 'The request was cancelled.' : '请求已取消。');
        throw new ApiError(0, error.name === 'AbortError' ? 'TIMEOUT' : 'NETWORK_ERROR', this.language() === 'en' ? 'The service could not be reached. Your changes have not been confirmed.' : '暂时无法连接服务，当前修改尚未确认保存。');
      } finally { clearTimeout(timer); signal?.removeEventListener('abort', cancel); }
    }
    get(path, options = {}) { return this.request(path, options); }
    post(path, body) { return this.request(path, { method: 'POST', body }); }
    patch(path, body) { return this.request(path, { method: 'PATCH', body }); }
    delete(path) { return this.request(path, { method: 'DELETE' }); }
    clearSession() { this.csrfToken = null; }
  }
  window.WorkOSApi = Object.freeze({ Client, ApiError });
})();

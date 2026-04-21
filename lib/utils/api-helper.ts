// Backwards-compatible re-export. The canonical implementation lives in
// `@/lib/utils/api-client` per the refined Ophir Pattern directive.
export {
  AbortedError,
  apiFetch,
  apiGet,
  apiPost,
  getActiveCompanyIdFromCookie,
  parseApiData,
  type ParseApiDataOptions,
} from "@/lib/utils/api-client"

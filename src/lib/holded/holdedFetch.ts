// VIHOLABS — HOLDed Fetch (CANONICAL FAÇADE)
// Canonical façade over holdedClient.ts
// IMPORTANT:
// - holdedFetchJson = generic raw path fetch
// - holdedFetch = canonical document detail fetch
// - holdedDocumentDetail is also exported directly for backward compatibility
// - do NOT alias holdedListDocuments as generic fetch

export { HoldedClientError as HoldedError } from "./holdedClient";

export {
  holdedFetchJson,
  holdedListDocuments,
  holdedDocumentDetail,
  holdedDocumentDetail as holdedFetch,
  holdedContactDetail,
  holdedListContacts,
} from "./holdedClient";
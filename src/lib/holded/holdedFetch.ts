// VIHOLABS — HOLDed Fetch (CANONICAL FAÇADE)
// Historical client removed.
// Canonical client lives in holdedClient.ts

export { HoldedClientError as HoldedError } from "./holdedClient";

export {
  holdedListDocuments as holdedFetchJson,
  holdedDocumentDetail as holdedFetch,
} from "./holdedClient";

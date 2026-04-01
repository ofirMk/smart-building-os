/**
 * Barrel for tender AI helpers (Gemini SDK lives in tender-intake-gemini-sdk).
 */
export {
  aggregateTenderHeaderFromExtractions,
  analyzeSingleTenderDocument,
  analyzeSingleTenderDocumentFromBuffer,
  extractionToDbFields,
  MAX_TENDER_FILE_BYTES,
  resolveMimeFromFileName,
  resolveTenderFileMediaType,
  synthesizeBuildingStructure,
} from "./tender-intake-gemini-sdk"

const pdfParse = require("pdf-parse");

module.exports = async function extractPdfText(pdfBuffer) {
  const out = await pdfParse(pdfBuffer);

  return {
    text: String(out?.text || ""),
    numpages: typeof out?.numpages === "number" ? out.numpages : null,
    meta: {
      version: out?.version ?? null,
      info: out?.info ?? null,
      metadata: out?.metadata ?? null,
    },
  };
};

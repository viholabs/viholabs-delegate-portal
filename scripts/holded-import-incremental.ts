import { runHoldedInvoicesIncrementalImport } from "@/lib/holded/holdedImportIncrementalRunner";

const limit = Number(process.env.LIMIT ?? "50");
const since = process.env.SINCE || undefined;
const until = process.env.UNTIL || undefined;

runHoldedInvoicesIncrementalImport({ limit, since, until })
  .then((res) => {
    console.log(JSON.stringify(res, null, 2));
    process.exit(res.ok ? 0 : 1);
  })
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });

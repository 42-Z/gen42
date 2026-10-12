// scripts/gen-sheet-css.ts
import { buildSheetCss } from "../src/lib/sheet/css";

await Bun.write("src/sheet.generated.css", buildSheetCss());
console.log("записан src/sheet.generated.css");

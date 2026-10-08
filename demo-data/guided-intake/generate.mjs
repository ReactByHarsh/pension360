// Run npm run build -w apps/api first, then node demo-data/guided-intake/generate.mjs.
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import {
  guidedFields,
  guidedTemplates,
} from "../../apps/api/dist/guided-demo-data.js";
const dir = fileURLToPath(new URL(".", import.meta.url));
await mkdir(dir, { recursive: true });
const csv = (value) => {
  const text = value == null ? "" : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
};
for (const template of guidedTemplates) {
  await writeFile(
    `${dir}${template.id}.json`,
    JSON.stringify(
      {
        name: template.title,
        sourceSystem: "Pension / ERP (demonstration)",
        importMethod: "JSON",
        isSample: true,
        rows: template.rows,
      },
      null,
      2,
    ) + "\n",
  );
  await writeFile(
    `${dir}${template.id}.csv`,
    [
      guidedFields.map((f) => f.key).join(","),
      ...template.rows.map((row) =>
        guidedFields.map((f) => csv(row[f.key])).join(","),
      ),
    ].join("\r\n") + "\r\n",
  );
}
await writeFile(
  `${dir}field-schema.json`,
  JSON.stringify(guidedFields, null, 2) + "\n",
);
console.log(
  `Wrote ${guidedTemplates.length} JSON + ${guidedTemplates.length} CSV fixtures and one field schema.`,
);

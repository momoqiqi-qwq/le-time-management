export async function spreadsheetFileToCsv(file) {
  if (!file?.arrayBuffer) throw new Error("没有读取到 Excel 文件");
  const XLSX = await import("xlsx");
  const workbook = XLSX.read(await file.arrayBuffer(), { type: "array", cellDates: false });
  for (const name of workbook.SheetNames) {
    const csv = XLSX.utils.sheet_to_csv(workbook.Sheets[name], { blankrows: false });
    if (csv.trim()) return csv;
  }
  throw new Error("Excel 文件中没有可导入的工作表");
}

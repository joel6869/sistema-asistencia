import ExcelJS from 'exceljs';
import { LOGO_MINISTERIO_BASE64, LOGO_MINISTERIO_DATA_URL, LOGO_OAP_BASE64, LOGO_OAP_DATA_URL } from './logosBase64';

export type ExportColumnKey =
  | 'date'
  | 'employee'
  | 'position'
  | 'entryTime'
  | 'exitTime'
  | 'status'
  | 'lateMinutes'
  | 'entryObservation'
  | 'exitObservation'
  | 'notes';

export const AVAILABLE_COLUMNS: Record<ExportColumnKey, { label: string; width: number; pdfWidthPercent?: number }> = {
  date: { label: 'Fecha', width: 22, pdfWidthPercent: 12 },
  employee: { label: 'Nombre completo', width: 44, pdfWidthPercent: 22 },
  position: { label: 'Cargo', width: 30, pdfWidthPercent: 18 },
  entryTime: { label: 'Hora entrada', width: 26, pdfWidthPercent: 14 },
  exitTime: { label: 'Hora salida', width: 26, pdfWidthPercent: 14 },
  status: { label: 'Estado', width: 24, pdfWidthPercent: 12 },
  lateMinutes: { label: 'Retraso', width: 20, pdfWidthPercent: 10 },
  entryObservation: { label: 'Obs. entrada', width: 30, pdfWidthPercent: 16 },
  exitObservation: { label: 'Obs. salida', width: 30, pdfWidthPercent: 16 },
  notes: { label: 'Obs. interna', width: 30, pdfWidthPercent: 16 },
};

export interface GeoPoint {
  latitude: number;
  longitude: number;
  accuracy?: number;
}

export interface LocationPoint {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
}

export interface Employee {
  id: string;
  ci: string;
  fullName: string;
  position: string;
  department: string | null;
  departamentoBolivia?: string | null;
  role: 'ADMIN' | 'EMPLOYEE';
  status: 'ACTIVE' | 'INACTIVE';
  phone?: string | null;
  profilePhotoUrl?: string | null;
  locationControlEnabled?: boolean;
  locationRadiusMeters?: number;
  locationPoints?: LocationPoint[];
}

export interface Attendance {
  id: string;
  employeeId: string;
  attendanceDate: string;
  entryTime: string | null;
  exitTime: string | null;
  lateMinutes: number;
  status: string;
  entryLocation?: GeoPoint;
  exitLocation?: GeoPoint;
  notes?: string | null;
  entryObservation?: string | null;
  exitObservation?: string | null;
}

export interface Holiday {
  id: string;
  date: string;
  name: string;
  description?: string | null;
  departments?: string[];
}

export interface DayRecord {
  date: string;
  employee: string;
  position: string;
  entryTime: string;
  exitTime: string;
  status: string;
  lateMinutes: string;
  entryObservation: string;
  exitObservation: string;
  notes: string;
  dateStr: string;
  dayNumber: number;
  dayName: string;
  isHoliday: boolean;
  holidayName?: string;
}

function getMonthName(monthStr: string): string {
  try {
    const [year, month] = monthStr.split('-').map(Number);
    const date = new Date(year, month - 1, 1);
    return new Intl.DateTimeFormat('es-BO', { month: 'long' }).format(date);
  } catch {
    return monthStr;
  }
}

function formatTimeToInstitutional(timeStr: string | null): string {
  if (!timeStr) return 'Pendiente';
  try {
    if (/^\d{1,2}:\d{2}$/.test(timeStr)) {
      const [h, m] = timeStr.split(':').map(Number);
      const isPm = h >= 12;
      const hour12 = h % 12 === 0 ? 12 : h % 12;
      const padHour = String(hour12).padStart(2, '0');
      const padMin = String(m).padStart(2, '0');
      return `${padHour}:${padMin} ${isPm ? 'p. m.' : 'a. m.'}`;
    }
    const date = new Date(timeStr);
    if (isNaN(date.getTime())) return timeStr;
    const hours = date.getHours();
    const minutes = date.getMinutes();
    const isPm = hours >= 12;
    const hour12 = hours % 12 === 0 ? 12 : hours % 12;
    const padHour = String(hour12).padStart(2, '0');
    const padMin = String(minutes).padStart(2, '0');
    return `${padHour}:${padMin} ${isPm ? 'p. m.' : 'a. m.'}`;
  } catch {
    return timeStr;
  }
}

function statusToInstitutional(status: string): string {
  const map: Record<string, string> = {
    PRESENT: 'Presente',
    LATE: 'Con retraso',
    ABSENT: 'Ausente',
    JUSTIFIED: 'Justificado',
    HOLIDAY: 'Feriado',
    WEEKEND: 'Fin de semana',
    PENDING: 'Pendiente',
  };
  return map[status] ?? status;
}

function getSignatureLabels(employee: Employee): { left: string; center?: string; right: string } {
  const positionLower = (employee.position || '').toLowerCase();
  const dept = employee.departamentoBolivia || 'La Paz';

  // If coordinator
  if (positionLower.includes('coordinador') || positionLower.includes('responsable')) {
    return {
      left: `Firma responsable ${dept}`,
      right: 'Firma responsable Precios',
    };
  }

  // Regular Encuestador / Encuestadora
  let roleSuffix = dept;
  if (positionLower.includes('el alto')) {
    roleSuffix = 'La Paz - El Alto';
  } else if (positionLower.includes('trinidad')) {
    roleSuffix = 'Trinidad';
  } else if (positionLower.includes('potosi') || positionLower.includes('potosí')) {
    roleSuffix = 'Potosi';
  } else if (positionLower.includes('santa cruz')) {
    roleSuffix = 'Santa Cruz';
  } else if (positionLower.includes('tarija')) {
    roleSuffix = 'Tarija';
  } else if (positionLower.includes('chuquisaca')) {
    roleSuffix = 'Chuquisaca';
  } else if (positionLower.includes('cochabamba')) {
    roleSuffix = 'Cochabamba';
  } else if (positionLower.includes('oruro')) {
    roleSuffix = 'Oruro';
  } else if (positionLower.includes('beni')) {
    roleSuffix = 'Beni';
  } else if (positionLower.includes('pando')) {
    roleSuffix = 'Pando';
  }

  return {
    left: `Firma encuestador ${roleSuffix}`,
    center: 'Firma Coordinador',
    right: 'Firma responsable Precios',
  };
}

export function buildEmployeeMonthDays(
  employee: Employee,
  monthStr: string,
  attendances: Attendance[],
  holidays: Holiday[],
): DayRecord[] {
  const [yearStr, monthNumStr] = monthStr.split('-');
  const year = Number(yearStr);
  const month = Number(monthNumStr); // 1-based
  const daysInMonth = new Date(year, month, 0).getDate();

  const holidaysByDate = new Map<string, Holiday>();
  holidays.forEach((h) => {
    const isApplicable =
      !h.departments ||
      h.departments.length === 0 ||
      h.departments.includes('TODOS') ||
      (employee.departamentoBolivia && h.departments.includes(employee.departamentoBolivia));
    if (isApplicable) {
      holidaysByDate.set(h.date, h);
    }
  });

  const employeeAttendances = new Map<string, Attendance>();
  attendances
    .filter((a) => a.employeeId === employee.id && a.attendanceDate.startsWith(monthStr))
    .forEach((a) => {
      employeeAttendances.set(a.attendanceDate, a);
    });

  const records: DayRecord[] = [];

  for (let day = 1; day <= daysInMonth; day++) {
    const dateObj = new Date(year, month - 1, day);
    const dayOfWeek = dateObj.getDay(); // 0 = Sun, 6 = Sat
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
    const dateStr = `${yearStr}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

    const holiday = holidaysByDate.get(dateStr);
    const att = employeeAttendances.get(dateStr);

    // Skip weekends unless there is a registered attendance
    if (isWeekend && !att) {
      continue;
    }

    let entryTime = '';
    let exitTime = '';
    let status = '';
    let lateMinutes = '-';
    let entryObservation = '-';
    let exitObservation = '-';
    let notes = '-';
    const isHoliday = Boolean(holiday);

    if (isHoliday) {
      entryTime = 'Feriado';
      exitTime = 'Feriado';
      status = 'Feriado';
    } else if (att) {
      entryTime = att.entryTime ? formatTimeToInstitutional(att.entryTime) : 'Pendiente';
      exitTime = att.exitTime ? formatTimeToInstitutional(att.exitTime) : 'Pendiente';
      status = statusToInstitutional(att.status);
      lateMinutes = att.lateMinutes ? `${att.lateMinutes} min` : '0 min';
      entryObservation = att.entryObservation || '-';
      exitObservation = att.exitObservation || '-';
      notes = att.notes || '-';
    } else {
      entryTime = 'Pendiente';
      exitTime = 'Pendiente';
      status = 'Pendiente';
    }

    records.push({
      date: dateStr,
      employee: employee.fullName,
      position: employee.position,
      entryTime,
      exitTime,
      status,
      lateMinutes,
      entryObservation,
      exitObservation,
      notes,
      dateStr,
      dayNumber: day,
      dayName: new Intl.DateTimeFormat('es-BO', { weekday: 'short' }).format(dateObj),
      isHoliday,
      holidayName: holiday?.name,
    });
  }

  return records;
}

function getColLetter(colIdx1Based: number): string {
  let temp = '';
  let n = colIdx1Based;
  while (n > 0) {
    const rem = (n - 1) % 26;
    temp = String.fromCharCode(65 + rem) + temp;
    n = Math.floor((n - 1) / 26);
  }
  return temp;
}

export async function exportSingleEmployeeExcel(
  employee: Employee,
  monthStr: string,
  attendances: Attendance[],
  holidays: Holiday[],
  columns: ExportColumnKey[] = ['date', 'employee', 'position', 'entryTime', 'exitTime', 'status'],
) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Observatorio Agroambiental y Productivo';
  workbook.created = new Date();

  const [yearStr] = monthStr.split('-');
  const monthName = getMonthName(monthStr);
  const records = buildEmployeeMonthDays(employee, monthStr, attendances, holidays);

  addEmployeePlanillaSheet(workbook, employee, monthStr, monthName, yearStr, records, columns);

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `${employee.fullName} ${monthName} ${yearStr}.xlsx`;
  link.click();
  URL.revokeObjectURL(link.href);
}

export async function exportAllEmployeesExcel(
  employees: Employee[],
  monthStr: string,
  attendances: Attendance[],
  holidays: Holiday[],
  columns: ExportColumnKey[] = ['date', 'employee', 'position', 'entryTime', 'exitTime', 'status'],
) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Observatorio Agroambiental y Productivo';
  workbook.created = new Date();

  const [yearStr] = monthStr.split('-');
  const monthName = getMonthName(monthStr);

  employees.forEach((employee) => {
    const records = buildEmployeeMonthDays(employee, monthStr, attendances, holidays);
    addEmployeePlanillaSheet(workbook, employee, monthStr, monthName, yearStr, records, columns);
  });

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `Planillas Asistencia ${monthName} ${yearStr}.xlsx`;
  link.click();
  URL.revokeObjectURL(link.href);
}

function addEmployeePlanillaSheet(
  workbook: ExcelJS.Workbook,
  employee: Employee,
  monthStr: string,
  monthName: string,
  yearStr: string,
  records: DayRecord[],
  columns: ExportColumnKey[] = ['date', 'employee', 'position', 'entryTime', 'exitTime', 'status'],
) {
  const activeColumns = columns.length > 0 ? columns : (['date', 'employee', 'position', 'entryTime', 'exitTime', 'status'] as ExportColumnKey[]);
  const numCols = activeColumns.length;
  const lastColLetter = getColLetter(numCols);

  // Worksheet name max 31 chars
  const cleanSheetName = (employee.fullName || 'Planilla')
    .slice(0, 31)
    .replace(/[\\/*?:[\]]/g, '');
  const ws = workbook.addWorksheet(cleanSheetName, {
    pageSetup: {
      paperSize: 1, // Letter
      orientation: 'landscape',
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 1,
      margins: {
        left: 0.4,
        right: 0.4,
        top: 0.4,
        bottom: 0.4,
        header: 0.2,
        footer: 0.2,
      },
    },
  });

  // Dynamic Column widths matching selected columns
  ws.columns = activeColumns.map((colKey) => ({
    key: colKey,
    width: AVAILABLE_COLUMNS[colKey]?.width ?? 25,
  }));

  // Insert Images
  try {
    const imgMinId = workbook.addImage({
      base64: LOGO_MINISTERIO_BASE64,
      extension: 'png',
    });
    ws.addImage(imgMinId, {
      tl: { col: 0, row: 0.2 },
      ext: { width: 220, height: 75 },
      editAs: 'oneCell',
    });

    const imgOapId = workbook.addImage({
      base64: LOGO_OAP_BASE64,
      extension: 'png',
    });
    ws.addImage(imgOapId, {
      tl: { col: Math.max(1, numCols - 1.8), row: 0.2 },
      ext: { width: 220, height: 75 },
      editAs: 'oneCell',
    });
  } catch {
    // ignore image insertion fallback
  }

  // Row 1: empty height for logo space
  ws.getRow(1).height = 42;

  // Title rows merged dynamically from A to lastColLetter
  ws.mergeCells(`A2:${lastColLetter}2`);
  const r2 = ws.getCell('A2');
  r2.value = 'Ministerio De Producción Sostenible, Medio Ambiente y Agua';
  r2.font = { name: 'Arial', size: 12, bold: true, color: { argb: 'FF000000' } };
  r2.alignment = { horizontal: 'center', vertical: 'middle' };
  ws.getRow(2).height = 18;

  ws.mergeCells(`A3:${lastColLetter}3`);
  const r3 = ws.getCell('A3');
  r3.value = 'Observatorio Agroambiental Productivo';
  r3.font = { name: 'Arial', size: 12, bold: true, color: { argb: 'FF000000' } };
  r3.alignment = { horizontal: 'center', vertical: 'middle' };
  ws.getRow(3).height = 18;

  ws.mergeCells(`A4:${lastColLetter}4`);
  const r4 = ws.getCell('A4');
  r4.value = `Planilla de asistencia del mes de ${monthName.toLowerCase()} de ${yearStr}`;
  r4.font = { name: 'Arial', size: 12, bold: true, color: { argb: 'FF000000' } };
  r4.alignment = { horizontal: 'center', vertical: 'middle' };
  ws.getRow(4).height = 18;

  // Empty row 5
  ws.getRow(5).height = 10;

  // Header row 6 (Dynamic column labels)
  const headerRow = ws.getRow(6);
  headerRow.values = activeColumns.map((colKey) => AVAILABLE_COLUMNS[colKey]?.label ?? colKey);
  headerRow.height = 30;
  headerRow.eachCell((cell) => {
    cell.font = { name: 'Arial', size: 12, bold: true, color: { argb: 'FF000000' } };
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    cell.border = {
      top: { style: 'medium', color: { argb: 'FF000000' } },
      left: { style: 'medium', color: { argb: 'FF000000' } },
      bottom: { style: 'medium', color: { argb: 'FF000000' } },
      right: { style: 'medium', color: { argb: 'FF000000' } },
    };
  });

  // Data rows
  let currentRowIdx = 7;
  records.forEach((rec) => {
    const row = ws.getRow(currentRowIdx);
    row.height = 24.95;

    activeColumns.forEach((colKey, colIdx) => {
      const cell = row.getCell(colIdx + 1);
      if (colKey === 'date') {
        const [y, m, d] = rec.dateStr.split('-').map(Number);
        cell.value = new Date(y, m - 1, d);
        cell.numFmt = 'dd/mm/yyyy';
      } else {
        cell.value = rec[colKey as keyof DayRecord] ?? '-';
      }

      cell.font = { name: 'Arial', size: 10, bold: false, color: { argb: 'FF000000' } };
      cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
      cell.border = {
        top: { style: 'medium', color: { argb: 'FF000000' } },
        left: { style: 'medium', color: { argb: 'FF000000' } },
        bottom: { style: 'medium', color: { argb: 'FF000000' } },
        right: { style: 'medium', color: { argb: 'FF000000' } },
      };
    });

    currentRowIdx++;
  });

  // Empty spacing rows
  const spacingRows = 8;
  for (let i = 0; i < spacingRows; i++) {
    const emptyRow = ws.getRow(currentRowIdx);
    emptyRow.height = 15;
    currentRowIdx++;
  }

  // Signatures Row
  const sigRow = ws.getRow(currentRowIdx);
  sigRow.height = 20;
  const sigLabels = getSignatureLabels(employee);

  if (numCols >= 5) {
    sigRow.getCell(2).value = sigLabels.left;
    sigRow.getCell(2).font = { name: 'Arial', size: 11, bold: true };
    sigRow.getCell(2).alignment = { horizontal: 'center', vertical: 'middle' };

    if (sigLabels.center) {
      const midColStart = 3;
      const midColEnd = Math.max(3, numCols - 2);
      if (midColStart < midColEnd) {
        ws.mergeCells(`${getColLetter(midColStart)}${currentRowIdx}:${getColLetter(midColEnd)}${currentRowIdx}`);
      }
      const midCell = sigRow.getCell(midColStart);
      midCell.value = sigLabels.center;
      midCell.font = { name: 'Arial', size: 11, bold: true };
      midCell.alignment = { horizontal: 'center', vertical: 'middle' };

      const rightCell = sigRow.getCell(numCols - 1);
      rightCell.value = sigLabels.right;
      rightCell.font = { name: 'Arial', size: 11, bold: true };
      rightCell.alignment = { horizontal: 'center', vertical: 'middle' };
    } else {
      const rightCell = sigRow.getCell(numCols - 1);
      rightCell.value = sigLabels.right;
      rightCell.font = { name: 'Arial', size: 11, bold: true };
      rightCell.alignment = { horizontal: 'center', vertical: 'middle' };
    }
  } else {
    // If fewer than 5 columns selected
    sigRow.getCell(1).value = sigLabels.left;
    sigRow.getCell(1).font = { name: 'Arial', size: 11, bold: true };
    sigRow.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };

    const endCell = sigRow.getCell(numCols);
    endCell.value = sigLabels.right;
    endCell.font = { name: 'Arial', size: 11, bold: true };
    endCell.alignment = { horizontal: 'center', vertical: 'middle' };
  }
}

export function exportPlanillasPdf(
  employees: Employee[],
  monthStr: string,
  attendances: Attendance[],
  holidays: Holiday[],
  columns: ExportColumnKey[] = ['date', 'employee', 'position', 'entryTime', 'exitTime', 'status'],
) {
  const activeColumns = columns.length > 0 ? columns : (['date', 'employee', 'position', 'entryTime', 'exitTime', 'status'] as ExportColumnKey[]);
  const [yearStr] = monthStr.split('-');
  const monthName = getMonthName(monthStr);

  const pagesHtml = employees
    .map((employee) => {
      const records = buildEmployeeMonthDays(employee, monthStr, attendances, holidays);
      const sigLabels = getSignatureLabels(employee);

      const theadHtml = activeColumns
        .map((colKey) => `<th>${escapeHtml(AVAILABLE_COLUMNS[colKey]?.label ?? colKey)}</th>`)
        .join('');

      const rowsHtml = records
        .map((rec) => {
          const cells = activeColumns
            .map((colKey) => {
              let val = String(rec[colKey as keyof DayRecord] ?? '-');
              if (colKey === 'date') {
                const [y, m, d] = rec.dateStr.split('-');
                val = `${d}/${m}/${y}`;
              }
              return `<td>${escapeHtml(val)}</td>`;
            })
            .join('');

          return `<tr>${cells}</tr>`;
        })
        .join('');

      const signaturesHtml = sigLabels.center
        ? `
          <div class="sig-container 3-cols">
            <div class="sig-box">
              <div class="sig-line"></div>
              <strong>${escapeHtml(sigLabels.left)}</strong>
            </div>
            <div class="sig-box">
              <div class="sig-line"></div>
              <strong>${escapeHtml(sigLabels.center)}</strong>
            </div>
            <div class="sig-box">
              <div class="sig-line"></div>
              <strong>${escapeHtml(sigLabels.right)}</strong>
            </div>
          </div>
        `
        : `
          <div class="sig-container 2-cols">
            <div class="sig-box">
              <div class="sig-line"></div>
              <strong>${escapeHtml(sigLabels.left)}</strong>
            </div>
            <div class="sig-box">
              <div class="sig-line"></div>
              <strong>${escapeHtml(sigLabels.right)}</strong>
            </div>
          </div>
        `;

      return `
        <div class="planilla-page">
          <div class="header-grid">
            <div class="logo-left">
              <img src="${LOGO_MINISTERIO_DATA_URL}" alt="Ministerio" />
            </div>
            <div class="title-center">
              <h1>Ministerio De Producción Sostenible, Medio Ambiente y Agua</h1>
              <h2>Observatorio Agroambiental Productivo</h2>
              <h3>Planilla de asistencia del mes de ${escapeHtml(monthName.toLowerCase())} de ${yearStr}</h3>
            </div>
            <div class="logo-right">
              <img src="${LOGO_OAP_DATA_URL}" alt="OAP" />
            </div>
          </div>

          <table class="planilla-table">
            <thead>
              <tr>
                ${theadHtml}
              </tr>
            </thead>
            <tbody>
              ${rowsHtml}
            </tbody>
          </table>

          <div class="footer-spacer"></div>
          ${signaturesHtml}
        </div>
      `;
    })
    .join('');

  const fullHtml = `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <title>Planillas de Asistencia ${escapeHtml(monthName)} ${yearStr}</title>
  <style>
    @page {
      size: letter landscape;
      margin: 0.35in 0.45in;
    }
    * {
      box-sizing: border-box;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    body {
      font-family: Arial, Helvetica, sans-serif;
      margin: 0;
      padding: 0;
      background: #ffffff;
      color: #000000;
    }
    .planilla-page {
      page-break-after: always;
      display: flex;
      flex-direction: column;
      min-height: 96vh;
      justify-content: space-between;
      padding: 10px 0;
    }
    .planilla-page:last-child {
      page-break-after: auto;
    }
    .header-grid {
      display: grid;
      grid-template-columns: 220px 1fr 220px;
      align-items: center;
      gap: 12px;
      margin-bottom: 12px;
    }
    .logo-left img {
      width: 210px;
      height: auto;
      display: block;
      object-fit: contain;
    }
    .logo-right {
      display: flex;
      justify-content: flex-end;
    }
    .logo-right img {
      width: 210px;
      height: auto;
      display: block;
      object-fit: contain;
    }
    .title-center {
      text-align: center;
    }
    .title-center h1 {
      font-size: 11.5pt;
      font-weight: bold;
      margin: 0 0 3px;
      line-height: 1.2;
    }
    .title-center h2 {
      font-size: 11pt;
      font-weight: bold;
      margin: 0 0 3px;
      line-height: 1.2;
    }
    .title-center h3 {
      font-size: 11pt;
      font-weight: bold;
      margin: 0;
      line-height: 1.2;
    }
    .planilla-table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 4px;
      font-size: 9pt;
    }
    .planilla-table th {
      border: 1.5px solid #000000;
      padding: 6px 4px;
      text-align: center;
      vertical-align: middle;
      font-weight: bold;
      font-size: 9.5pt;
      background: #ffffff;
    }
    .planilla-table td {
      border: 1.5px solid #000000;
      padding: 4.5px 4px;
      text-align: center;
      vertical-align: middle;
      font-size: 8.5pt;
    }
    .footer-spacer {
      flex-grow: 1;
      min-height: 35px;
    }
    .sig-container {
      display: flex;
      justify-content: space-around;
      align-items: flex-end;
      width: 100%;
      margin-top: 25px;
      margin-bottom: 10px;
      page-break-inside: avoid;
    }
    .sig-box {
      width: 260px;
      text-align: center;
    }
    .sig-line {
      border-top: 1.5px solid #000000;
      width: 100%;
      margin-bottom: 6px;
    }
    .sig-box strong {
      font-size: 9.5pt;
      font-weight: bold;
      display: block;
    }
  </style>
</head>
<body>
  ${pagesHtml}
</body>
</html>`;

  const printWindow = window.open('', '_blank');
  if (!printWindow) return;
  printWindow.document.write(fullHtml);
  printWindow.document.close();
  printWindow.focus();
  window.setTimeout(() => {
    printWindow.print();
  }, 400);
}

function escapeHtml(value: string) {
  return (value || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

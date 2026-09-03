import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'

// Company Performance Report -> a clean one-page PDF you can send to the boss.
//
// The numbers are handed in already computed by the dashboard, never
// recalculated here. If this file did its own maths the PDF could quietly
// disagree with the screen it was printed from.
//
// The on-screen "Report" column is deliberately absent: a Download button is
// not something that can be printed.

const PAGE = { w: 210, h: 297 }          // A4 portrait, mm
const M = 14                             // page margin

const INK = {
  heading: [15, 23, 42],                 // slate-900
  body: [51, 65, 85],                    // slate-700
  muted: [148, 163, 184],                // slate-400
  rule: [226, 232, 240],                 // slate-200
  band: [248, 250, 252],                 // slate-50
  accent: [79, 70, 229],                 // indigo-600
}

// Same thresholds as getDeviationBadgeClass on the dashboard, so a row that
// reads amber on screen does not read green on paper.
function deviationColor(v) {
  if (v >= -25) return [4, 120, 87]      // emerald-700
  if (v >= -35) return [180, 83, 9]      // amber-700
  if (v >= -55) return [194, 65, 12]     // orange-700
  return [190, 18, 60]                   // rose-700
}

const pct = v => `${Number(v).toFixed(2)}%`

function niceDate(d) {
  return new Date(`${d}T00:00:00`).toLocaleDateString('en-IN', {
    day: 'numeric', month: 'short', year: 'numeric',
  })
}

// Totals are summed from the raw counts, never averaged from the percentages —
// averaging percentages would weight a 3-task employee the same as a 50-task one.
function teamTotals(rows) {
  const t = rows.reduce((a, r) => ({
    plan: a.plan + r.plan,
    actual: a.actual + r.actual,
    onTime: a.onTime + r.onTime,
    assessed: a.assessed + r.assessed,
    onTimeAssessed: a.onTimeAssessed + r.onTimeAssessed,
  }), { plan: 0, actual: 0, onTime: 0, assessed: 0, onTimeAssessed: 0 })

  return {
    ...t,
    pctWorkNotDone: t.plan > 0 ? ((t.actual - t.plan) / t.plan) * 100 : 0,
    pctNotOnTime: t.assessed > 0 ? ((t.onTimeAssessed - t.assessed) / t.assessed) * 100 : 0,
  }
}

function drawHeader(doc, meta, totals) {
  doc.setFillColor(...INK.heading)
  doc.rect(0, 0, PAGE.w, 30, 'F')

  doc.setTextColor(255, 255, 255)
  doc.setFont('helvetica', 'bold').setFontSize(15)
  doc.text('Company Performance Report', M, 14)

  doc.setFont('helvetica', 'normal').setFontSize(9)
  doc.setTextColor(190, 197, 210)
  doc.text(
    `${meta.mode === 'month' ? 'Monthly' : 'Weekly'}  ·  ${niceDate(meta.start)} – ${niceDate(meta.end)}`,
    M, 21,
  )

  doc.setFontSize(8)
  doc.text('ExactChoice', PAGE.w - M, 14, { align: 'right' })
  doc.text(
    `Generated ${new Date().toLocaleString('en-IN', {
      day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit',
    })}`,
    PAGE.w - M, 21, { align: 'right' },
  )

  // Summary strip — the four numbers worth reading before the table
  const cells = [
    ['Tasks planned', String(totals.plan)],
    ['Completed', String(totals.actual)],
    ['On time', String(totals.onTime)],
    ['Completion', `${totals.plan > 0 ? Math.round((totals.actual / totals.plan) * 100) : 0}%`],
  ]
  const boxW = (PAGE.w - M * 2) / cells.length
  const y = 36

  doc.setFillColor(...INK.band)
  doc.setDrawColor(...INK.rule)
  doc.roundedRect(M, y, PAGE.w - M * 2, 18, 2, 2, 'FD')

  cells.forEach(([label, value], i) => {
    const cx = M + boxW * i + boxW / 2
    doc.setFont('helvetica', 'normal').setFontSize(7)
    doc.setTextColor(...INK.muted)
    doc.text(label.toUpperCase(), cx, y + 7, { align: 'center' })
    doc.setFont('helvetica', 'bold').setFontSize(12)
    doc.setTextColor(...INK.heading)
    doc.text(value, cx, y + 14.5, { align: 'center' })

    if (i > 0) {
      doc.setDrawColor(...INK.rule)
      doc.line(M + boxW * i, y + 3, M + boxW * i, y + 15)
    }
  })
}

function drawFooter(doc, page, pageCount) {
  const y = PAGE.h - 12
  doc.setDrawColor(...INK.rule)
  doc.line(M, y - 4, PAGE.w - M, y - 4)

  doc.setFont('helvetica', 'normal').setFontSize(7.5)
  doc.setTextColor(...INK.muted)
  doc.text('Tasks whose deadline has not passed yet are not counted as late.', M, y)
  doc.text(`Page ${page} of ${pageCount}`, PAGE.w - M, y, { align: 'right' })
}

export function buildReportPdf(rows, meta) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' })
  const totals = teamTotals(rows)

  const body = rows.map((r, i) => [
    String(i + 1),
    r.full_name,
    r.department || '',
    `${r.actual} / ${r.plan}`,
    String(r.onTime),
    pct(r.pctWorkNotDone),
    pct(r.pctNotOnTime),
  ])

  autoTable(doc, {
    startY: 60,
    // top matters on page 2 onward: the header band is redrawn on every page,
    // so the table must always start below it, not at the default margin.
    margin: { top: 60, left: M, right: M, bottom: 20 },
    head: [['#', 'Employee', 'Department', 'Done / Plan', 'On Time', '% Work Not Done', '% Not On Time']],
    body,
    foot: [[
      '', 'TEAM TOTAL', '',
      `${totals.actual} / ${totals.plan}`,
      String(totals.onTime),
      pct(totals.pctWorkNotDone),
      pct(totals.pctNotOnTime),
    ]],
    theme: 'grid',
    styles: {
      font: 'helvetica',
      fontSize: 9,
      cellPadding: { top: 3, right: 2.5, bottom: 3, left: 2.5 },
      lineColor: INK.rule,
      lineWidth: 0.1,
      textColor: INK.body,
    },
    headStyles: {
      fillColor: INK.band,
      textColor: INK.muted,
      fontStyle: 'bold',
      fontSize: 7.5,
      lineColor: INK.rule,
    },
    footStyles: {
      fillColor: INK.band,
      textColor: INK.heading,
      fontStyle: 'bold',
      fontSize: 9,
      lineColor: INK.rule,
    },
    alternateRowStyles: { fillColor: [252, 253, 254] },
    columnStyles: {
      0: { cellWidth: 8, halign: 'center', textColor: INK.muted },
      1: { cellWidth: 40, fontStyle: 'bold', textColor: INK.heading },
      2: { cellWidth: 32 },
      3: { cellWidth: 24, halign: 'center' },
      4: { cellWidth: 18, halign: 'center' },
      5: { cellWidth: 30, halign: 'center', fontStyle: 'bold' },
      6: { cellWidth: 30, halign: 'center', fontStyle: 'bold' },
    },
    // Colour the two percentage columns to match the badges on screen
    didParseCell: data => {
      if (data.column.index !== 5 && data.column.index !== 6) return
      const src = data.section === 'foot'
        ? (data.column.index === 5 ? totals.pctWorkNotDone : totals.pctNotOnTime)
        : (data.column.index === 5
            ? rows[data.row.index]?.pctWorkNotDone
            : rows[data.row.index]?.pctNotOnTime)
      if (typeof src === 'number') data.cell.styles.textColor = deviationColor(src)
    },
    didDrawPage: () => drawHeader(doc, meta, totals),
  })

  const pageCount = doc.getNumberOfPages()
  for (let p = 1; p <= pageCount; p++) {
    doc.setPage(p)
    drawFooter(doc, p, pageCount)
  }

  return doc
}

export function reportFileName(meta) {
  return `ExactChoice_${meta.mode === 'month' ? 'Monthly' : 'Weekly'}_Report_${meta.start}_to_${meta.end}.pdf`
}

export function downloadReportPdf(rows, meta) {
  buildReportPdf(rows, meta).save(reportFileName(meta))
}

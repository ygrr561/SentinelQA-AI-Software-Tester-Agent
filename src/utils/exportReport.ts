import { jsPDF } from 'jspdf';
import type { StructuredReport } from '../types/testing';

export function downloadReportAsJson(report: StructuredReport): void {
  const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `sentinelqa-${report.reportId.toLowerCase()}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

async function fetchImageAsDataUrl(imageUrl: string): Promise<string | null> {
  try {
    const res = await fetch(imageUrl);
    if (!res.ok) return null;
    const blob = await res.blob();
    return await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(typeof reader.result === 'string' ? reader.result : null);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

export async function downloadReportAsPdf(report: StructuredReport): Promise<void> {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 42;
  const maxWidth = pageWidth - margin * 2;
  let y = 48;

  const ensureSpace = (needed: number) => {
    if (y + needed > pageHeight - 48) {
      doc.addPage();
      y = 48;
    }
  };

  // Header
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.setTextColor(15, 23, 42);
  doc.text('SentinelQA — Automated Test Execution Report', margin, y);
  y += 22;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.setTextColor(71, 85, 105);
  doc.text(`Report ID: ${report.reportId}   |   Run ID: ${report.runId}   |   Generated: ${new Date(report.generatedAt).toLocaleString()}`, margin, y);
  y += 16;

  doc.setDrawColor(203, 213, 225);
  doc.line(margin, y, pageWidth - margin, y);
  y += 18;

  // Target Application & Configuration
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(15, 23, 42);
  doc.text('Target Application & Test Scope', margin, y);
  y += 16;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(51, 65, 85);
  const metaLines = [
    `Target URL: ${report.targetApplication.url}`,
    `Page Title: ${report.targetApplication.pageTitle}`,
    `Suite: ${report.configuration.suiteName} (${report.configuration.mode})`,
    `Objective: ${report.configuration.objective}`,
    `AI Model: ${report.configuration.aiProvider} / ${report.configuration.aiModel}`,
  ];
  for (const line of metaLines) {
    const wrapped = doc.splitTextToSize(line, maxWidth);
    ensureSpace(wrapped.length * 14);
    doc.text(wrapped, margin, y);
    y += wrapped.length * 14;
  }
  y += 10;

  // Executive Summary Metrics Row
  ensureSpace(70);
  doc.setFillColor(241, 245, 249);
  doc.rect(margin, y, maxWidth, 54, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(15, 23, 42);

  const metrics = [
    { label: 'Total', value: String(report.summary.totalTests) },
    { label: 'Passed', value: String(report.summary.passedTests) },
    { label: 'Failed', value: String(report.summary.failedTests) },
    { label: 'Errors', value: String(report.summary.executionErrors) },
    { label: 'Skipped', value: String(report.summary.skippedTests) },
    { label: 'Pass Rate', value: `${report.summary.passPercentage}%` },
    { label: 'Duration', value: `${(report.summary.totalExecutionDurationMs / 1000).toFixed(1)}s` },
  ];
  const colW = maxWidth / metrics.length;
  metrics.forEach((m, idx) => {
    const x = margin + idx * colW + 8;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139);
    doc.text(m.label, x, y + 18);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.setTextColor(15, 23, 42);
    doc.text(m.value, x, y + 38);
  });
  y += 74;

  // Detailed Test Case Results
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(15, 23, 42);
  doc.text('Test Case Results & Evidence', margin, y);
  y += 18;

  for (const tc of report.testCases) {
    ensureSpace(110);
    doc.setDrawColor(226, 232, 240);
    doc.line(margin, y, pageWidth - margin, y);
    y += 14;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    if (tc.status === 'PASSED') doc.setTextColor(22, 163, 74);
    else if (tc.status === 'FAILED' || tc.status === 'ERROR') doc.setTextColor(220, 38, 38);
    else doc.setTextColor(180, 83, 9);

    doc.text(`[${tc.status}] ${tc.testId}: ${tc.name}`, margin, y);
    y += 14;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(71, 85, 105);
    doc.text(
      `Priority: ${tc.priority}  |  Category: ${tc.category}  |  Duration: ${(tc.durationMs / 1000).toFixed(2)}s  |  Validation: ${tc.validationMethod}`,
      margin,
      y
    );
    y += 14;

    const details = [
      `Expected: ${tc.expectedResult}`,
      `Actual: ${tc.actualResult}`,
    ];
    if (tc.failureAnalysis) {
      details.push(
        `Root Cause (${tc.failureAnalysis.failureCategory}, Confidence: ${tc.failureAnalysis.confidence}): ${tc.failureAnalysis.likelyCause}`
      );
      details.push(`Explanation: ${tc.failureAnalysis.explanation}`);
      details.push(`Suggested Fix / Investigation: ${tc.failureAnalysis.suggestedInvestigation}`);
    } else if (tc.errorMessage) {
      details.push(`Error: ${tc.errorMessage}`);
    }

    doc.setTextColor(30, 41, 59);
    for (const block of details) {
      const lines = doc.splitTextToSize(block, maxWidth);
      ensureSpace(lines.length * 12 + 4);
      doc.text(lines, margin, y);
      y += lines.length * 12 + 3;
    }

    if (tc.screenshotUrl) {
      const dataUrl = await fetchImageAsDataUrl(tc.screenshotUrl);
      if (dataUrl) {
        const imgW = 280;
        const imgH = 175;
        ensureSpace(imgH + 16);
        doc.addImage(dataUrl, 'PNG', margin, y + 4, imgW, imgH);
        y += imgH + 18;
      }
    }
    y += 6;
  }

  doc.save(`sentinelqa-${report.reportId.toLowerCase()}.pdf`);
}

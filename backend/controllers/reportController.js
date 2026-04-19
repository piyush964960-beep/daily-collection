const DailyEntry = require('../models/DailyEntry');
const ExcelJS = require('exceljs');

// @GET /api/reports/monthly?year=&month=
const getMonthlyReport = async (req, res) => {
  try {
    const { year = new Date().getFullYear(), month = new Date().getMonth() + 1 } = req.query;

    const startDate = new Date(parseInt(year), parseInt(month) - 1, 1);
    const endDate = new Date(parseInt(year), parseInt(month), 0, 23, 59, 59);

    const entries = await DailyEntry.find({ date: { $gte: startDate, $lte: endDate } })
      .populate('borrower', 'name assignedCollector')
      .populate({ path: 'borrower', populate: { path: 'assignedCollector', select: 'name' } })
      .populate('loan', 'loanId')
      .sort({ date: 1 });

    // Group by borrower
    const reportData = {};
    const daysInMonth = endDate.getDate();

    entries.forEach(entry => {
      const borrowerName = entry.borrower?.name || 'Unknown';
      const collectorName = entry.borrower?.assignedCollector?.name || 'Unknown';

      if (!reportData[borrowerName]) {
        reportData[borrowerName] = {
          borrowerName,
          collectorName,
          days: {},
          totalInterest: 0,
          totalPrincipal: 0,
          totalAmount: 0,
          cashTotal: 0,
          piyushTotal: 0,
          sanjayTotal: 0
        };
      }

      const day = new Date(entry.date).getDate();
      reportData[borrowerName].days[day] = (reportData[borrowerName].days[day] || 0) + entry.amountPaid;
      reportData[borrowerName].totalInterest += entry.interestPortion;
      reportData[borrowerName].totalPrincipal += entry.principalPortion;
      reportData[borrowerName].totalAmount += entry.amountPaid;

      if (entry.mode === 'Cash') reportData[borrowerName].cashTotal += entry.amountPaid;
      if (entry.mode === 'Piyush') reportData[borrowerName].piyushTotal += entry.amountPaid;
      if (entry.mode === 'Sanjay') reportData[borrowerName].sanjayTotal += entry.amountPaid;
    });

    res.json({ success: true, data: { rows: Object.values(reportData), daysInMonth, year, month } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// @GET /api/reports/monthly/export?year=&month=
const exportMonthlyReport = async (req, res) => {
  try {
    const { year = new Date().getFullYear(), month = new Date().getMonth() + 1 } = req.query;

    const startDate = new Date(parseInt(year), parseInt(month) - 1, 1);
    const endDate = new Date(parseInt(year), parseInt(month), 0, 23, 59, 59);

    const entries = await DailyEntry.find({ date: { $gte: startDate, $lte: endDate } })
      .populate('borrower', 'name assignedCollector')
      .populate({ path: 'borrower', populate: { path: 'assignedCollector', select: 'name' } })
      .populate('loan', 'loanId')
      .sort({ date: 1 });

    const daysInMonth = endDate.getDate();

    // Group data
    const reportData = {};
    entries.forEach(entry => {
      const borrowerName = entry.borrower?.name || 'Unknown';
      const collectorName = entry.borrower?.assignedCollector?.name || 'Unknown';
      if (!reportData[borrowerName]) {
        reportData[borrowerName] = { borrowerName, collectorName, days: {}, totalInterest: 0, totalPrincipal: 0, totalAmount: 0, cashTotal: 0, piyushTotal: 0, sanjayTotal: 0 };
      }
      const day = new Date(entry.date).getDate();
      reportData[borrowerName].days[day] = (reportData[borrowerName].days[day] || 0) + entry.amountPaid;
      reportData[borrowerName].totalInterest += entry.interestPortion;
      reportData[borrowerName].totalPrincipal += entry.principalPortion;
      reportData[borrowerName].totalAmount += entry.amountPaid;
      if (entry.mode === 'Cash') reportData[borrowerName].cashTotal += entry.amountPaid;
      if (entry.mode === 'Piyush') reportData[borrowerName].piyushTotal += entry.amountPaid;
      if (entry.mode === 'Sanjay') reportData[borrowerName].sanjayTotal += entry.amountPaid;
    });

    // Build Excel
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet(`Report ${year}-${String(month).padStart(2,'0')}`);

    // Header style
    const headerStyle = { font: { bold: true, color: { argb: 'FFFFFFFF' } }, fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A5F' } }, alignment: { horizontal: 'center' }, border: { bottom: { style: 'thin' } } };
    const subHeaderStyle = { font: { bold: true }, fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8F0FE' } }, alignment: { horizontal: 'center' } };

    // Build header row
    const headers = ['Borrower Name', 'Collector'];
    for (let d = 1; d <= daysInMonth; d++) headers.push(String(d));
    headers.push('Principal Recv', 'Interest Recv', 'Total', 'Cash', 'Piyush', 'Sanjay');

    const headerRow = sheet.addRow(headers);
    headerRow.eachCell(cell => {
      cell.style = headerStyle;
    });

    // Column widths
    sheet.getColumn(1).width = 25;
    sheet.getColumn(2).width = 20;
    for (let d = 1; d <= daysInMonth; d++) sheet.getColumn(d + 2).width = 5;
    const offset = daysInMonth + 3;
    sheet.getColumn(offset).width = 15;
    sheet.getColumn(offset + 1).width = 15;
    sheet.getColumn(offset + 2).width = 12;
    sheet.getColumn(offset + 3).width = 10;
    sheet.getColumn(offset + 4).width = 10;
    sheet.getColumn(offset + 5).width = 10;

    // Data rows
    let grandTotal = 0;
    let grandInterest = 0;
    let grandPrincipal = 0;
    let grandCash = 0;
    let grandPiyush = 0;
    let grandSanjay = 0;

    Object.values(reportData).forEach((row, idx) => {
      const rowData = [row.borrowerName, row.collectorName];
      for (let d = 1; d <= daysInMonth; d++) {
        rowData.push(row.days[d] ? parseFloat(row.days[d].toFixed(2)) : '');
      }
      rowData.push(
        parseFloat(row.totalPrincipal.toFixed(2)),
        parseFloat(row.totalInterest.toFixed(2)),
        parseFloat(row.totalAmount.toFixed(2)),
        parseFloat(row.cashTotal.toFixed(2)),
        parseFloat(row.piyushTotal.toFixed(2)),
        parseFloat(row.sanjayTotal.toFixed(2))
      );

      const dataRow = sheet.addRow(rowData);
      if (idx % 2 === 0) {
        dataRow.eachCell((cell, colNumber) => {
          if (colNumber > 2) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8F9FA' } };
        });
      }

      grandTotal += row.totalAmount;
      grandInterest += row.totalInterest;
      grandPrincipal += row.totalPrincipal;
      grandCash += row.cashTotal;
      grandPiyush += row.piyushTotal;
      grandSanjay += row.sanjayTotal;
    });

    // Grand total row
    const totalRowData = ['GRAND TOTAL', ''];
    for (let d = 1; d <= daysInMonth; d++) totalRowData.push('');
    totalRowData.push(
      parseFloat(grandPrincipal.toFixed(2)),
      parseFloat(grandInterest.toFixed(2)),
      parseFloat(grandTotal.toFixed(2)),
      parseFloat(grandCash.toFixed(2)),
      parseFloat(grandPiyush.toFixed(2)),
      parseFloat(grandSanjay.toFixed(2))
    );
    const totalRow = sheet.addRow(totalRowData);
    totalRow.eachCell(cell => { cell.style = subHeaderStyle; });

    // Send file
    const monthName = startDate.toLocaleString('default', { month: 'long' });
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=Monthly_Report_${monthName}_${year}.xlsx`);

    await workbook.xlsx.write(res);
    res.end();
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

module.exports = { getMonthlyReport, exportMonthlyReport };

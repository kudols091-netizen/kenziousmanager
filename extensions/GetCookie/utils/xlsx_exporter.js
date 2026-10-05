/**
 * Kenzious Get Cookie - Excel & CSV Exporter Utility
 * Generates formatted Excel (.xls) and CSV (.csv with UTF-8 BOM) without bulky external dependencies.
 * Ensures Facebook UIDs are strictly formatted as text so Excel does NOT convert them into scientific notation (1E+14).
 */

const XlsxExporter = {
  /**
   * Export an array of objects to Excel XML (.xls)
   * @param {Array<Object>} data - Array of row objects
   * @param {Array<{key: string, title: string, width?: number}>} columns - Column configurations
   * @param {string} filename - Output filename (without extension)
   */
  exportToExcel(data, columns, filename = 'kenzious_export') {
    if (!Array.isArray(data) || data.length === 0) {
      alert('Không có dữ liệu để xuất file!');
      return;
    }

    const xmlHeader = `<?xml version="1.0" encoding="UTF-8"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:o="urn:schemas-microsoft-com:office:office"
 xmlns:x="urn:schemas-microsoft-com:office:excel"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:html="http://www.w3.org/TR/REC-html40">
 <Styles>
  <Style ss:ID="Default" ss:Name="Normal">
   <Alignment ss:Vertical="Center"/>
   <Borders/>
   <Font ss:FontName="Segoe UI" ss:Size="11" ss:Color="#1E293B"/>
   <Interior/>
   <NumberFormat/>
   <Protection/>
  </Style>
  <Style ss:ID="HeaderStyle">
   <Alignment ss:Horizontal="Center" ss:Vertical="Center"/>
   <Borders>
    <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="2" ss:Color="#9950FA"/>
    <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#CBD5E1"/>
    <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#CBD5E1"/>
    <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#CBD5E1"/>
   </Borders>
   <Font ss:FontName="Segoe UI" ss:Size="11" ss:Color="#FFFFFF" ss:Bold="1"/>
   <Interior ss:Color="#0F1642" ss:Pattern="Solid"/>
  </Style>
  <Style ss:ID="DataStyle">
   <Alignment ss:Vertical="Center"/>
   <Borders>
    <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
    <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
    <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
    <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
   </Borders>
   <Font ss:FontName="Segoe UI" ss:Size="10" ss:Color="#334155"/>
  </Style>
  <Style ss:ID="UidStyle">
   <Alignment ss:Horizontal="Left" ss:Vertical="Center"/>
   <Borders>
    <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
    <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
    <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
    <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
   </Borders>
   <Font ss:FontName="Segoe UI" ss:Size="10" ss:Color="#7C3AED" ss:Bold="1"/>
   <NumberFormat ss:Format="@"/>
  </Style>
 </Styles>
 <Worksheet ss:Name="Kenzious Data">
  <Table>`;

    // Define column widths
    let colsXml = '';
    columns.forEach(col => {
      const width = col.width || 140;
      colsXml += `\n   <Column ss:AutoFitWidth="0" ss:Width="${width}"/>`;
    });

    // Define header row
    let headerRow = '\n   <Row ss:Height="28">';
    columns.forEach(col => {
      headerRow += `\n    <Cell ss:StyleID="HeaderStyle"><Data ss:Type="String">${this.escapeXml(col.title)}</Data></Cell>`;
    });
    headerRow += '\n   </Row>';

    // Define data rows
    let dataRows = '';
    data.forEach(item => {
      dataRows += '\n   <Row ss:Height="22">';
      columns.forEach(col => {
        let val = item[col.key];
        if (val === undefined || val === null) val = '';
        val = String(val);

        // Check if key is UID or ID to apply string text style
        const isUid = col.key.toLowerCase().includes('uid') || col.key.toLowerCase().includes('id');
        const styleId = isUid ? 'UidStyle' : 'DataStyle';

        dataRows += `\n    <Cell ss:StyleID="${styleId}"><Data ss:Type="String">${this.escapeXml(val)}</Data></Cell>`;
      });
      dataRows += '\n   </Row>';
    });

    const xmlFooter = `
  </Table>
 </Worksheet>
</Workbook>`;

    const fullXml = xmlHeader + colsXml + headerRow + dataRows + xmlFooter;
    const blob = new Blob([fullXml], { type: 'application/vnd.ms-excel;charset=utf-8' });
    this.downloadBlob(blob, `${filename}.xls`);
  },

  /**
   * Export to UTF-8 BOM CSV (guarantees correct accents in Excel)
   * @param {Array<Object>} data
   * @param {Array<{key: string, title: string}>} columns
   * @param {string} filename
   */
  exportToCsv(data, columns, filename = 'kenzious_export') {
    if (!Array.isArray(data) || data.length === 0) return;

    const BOM = '\uFEFF';
    const headerLine = columns.map(c => `"${c.title.replace(/"/g, '""')}"`).join(',');
    const rows = data.map(item => {
      return columns.map(col => {
        let val = item[col.key];
        if (val === undefined || val === null) val = '';
        val = String(val);
        // Prevent scientific notation for numeric strings
        if (/^\d{10,}$/.test(val)) {
          return `="\t${val}"`;
        }
        return `"${val.replace(/"/g, '""')}"`;
      }).join(',');
    });

    const csvContent = BOM + headerLine + '\n' + rows.join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    this.downloadBlob(blob, `${filename}.csv`);
  },

  escapeXml(unsafe) {
    if (typeof unsafe !== 'string') unsafe = String(unsafe);
    return unsafe.replace(/[<>&'"]/g, c => {
      switch (c) {
        case '<': return '&lt;';
        case '>': return '&gt;';
        case '&': return '&amp;';
        case '\'': return '&apos;';
        case '"': return '&quot;';
        default: return c;
      }
    });
  },

  downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    setTimeout(() => {
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    }, 200);
  }
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = XlsxExporter;
}

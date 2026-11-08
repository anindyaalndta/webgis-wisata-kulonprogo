# Finalisasi laporan dengan Microsoft Word: perbarui Daftar Isi/Gambar/Tabel lalu ekspor PDF
#   powershell -File pipeline\finalize_docx.ps1 [-Docx <berkas.docx>]
param([string]$Docx = (Join-Path $PSScriptRoot '..\docs\Laporan_Proposal_WebGIS_Wisata_KulonProgo.docx'))
$ErrorActionPreference = 'Stop'
$d = Resolve-Path $Docx
$w = New-Object -ComObject Word.Application; $w.Visible = $false; $w.DisplayAlerts = 0
try {
  $doc = $w.Documents.Open([string]$d)
  # Word (antarmuka Indonesia) memakai ';' sebagai pemisah gaya pada switch \t
  foreach ($f in $doc.Fields) {
    $code = $f.Code.Text
    if ($code -match 'TOC \\h \\t "(Keterangan\w+),1"') { $f.Code.Text = ' TOC \h \z \t "' + $Matches[1] + ';1" ' }
  }
  $doc.Fields.Update() | Out-Null
  foreach ($t in $doc.TablesOfContents) { $t.Update() }
  $doc.Repaginate()
  foreach ($t in $doc.TablesOfContents) { $t.UpdatePageNumbers() }
  Write-Output ("Halaman: " + $doc.ComputeStatistics(2))
  $doc.Save()
  $pdf = ([string]$d) -replace '\.docx$', '.pdf'
  $doc.ExportAsFixedFormat($pdf, 17)
  $doc.Close()
  Write-Output "PDF: $pdf"
} finally { $w.Quit() }

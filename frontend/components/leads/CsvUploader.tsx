'use client';

import { useCallback, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { Download, Upload, FileText } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useCategories } from '@/hooks/useCategories';
import { useUploadLeads } from '@/hooks/useLeads';
import type { UploadResult } from '@/types';

interface CsvUploaderProps {
  onUploaded?: () => void;
}

const EXAMPLE_CSV = `name,phone,email,company
Ahmed Khan,+923001234567,ahmed.khan@example.com,Skyline Realtors
Sara Malik,03009876543,sara.malik@example.com,Green Valley Homes
Ali Raza,923331112233,ali.raza@example.com,Capital Estate
John Smith,(212) 555-0101,john.smith@example.com,Metro Properties
Emily Johnson,2125550199,emily@example.com,Downtown Realty`;

function downloadExampleCsv() {
  const blob = new Blob([EXAMPLE_CSV], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'leads-example.csv';
  link.click();
  URL.revokeObjectURL(url);
}

export function CsvUploader({ onUploaded }: CsvUploaderProps) {
  const [file, setFile] = useState<File | null>(null);
  const [categoryId, setCategoryId] = useState('');
  const [preview, setPreview] = useState<Record<string, string>[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [result, setResult] = useState<UploadResult | null>(null);

  const { data: categories } = useCategories();
  const upload = useUploadLeads();

  const parsePreview = useCallback(async (f: File) => {
    const text = await f.text();
    const lines = text.split('\n').filter(Boolean);
    if (lines.length < 1) return;
    const hdrs = lines[0].split(',').map((h) => h.trim().replace(/"/g, ''));
    setHeaders(hdrs);
    const rows = lines.slice(1, 6).map((line) => {
      const vals = line.split(',').map((v) => v.trim().replace(/"/g, ''));
      return Object.fromEntries(hdrs.map((h, i) => [h, vals[i] || '']));
    });
    setPreview(rows);
    const autoMap: Record<string, string> = {};
    hdrs.forEach((h) => {
      const lower = h.toLowerCase().replace(/[\s_]/g, '');
      if (!autoMap.phone && (lower.includes('phone') || lower.includes('mobile') || lower.includes('tel') || lower === 'cell')) {
        autoMap.phone = h;
      }
      if (!autoMap.email && lower.includes('email')) autoMap.email = h;
      if (!autoMap.company && (lower.includes('company') || lower.includes('business') || lower.includes('organization'))) {
        autoMap.company = h;
      }
      if (!autoMap.name && (lower.includes('owner') || lower.includes('contact') || lower === 'name' || lower.includes('fullname'))) {
        autoMap.name = h;
      }
    });
    if (!autoMap.name && autoMap.company) {
      autoMap.name = autoMap.company;
    }
    setMapping(autoMap);
  }, []);

  const onDrop = useCallback(
    (accepted: File[]) => {
      const f = accepted[0];
      if (!f) return;
      setFile(f);
      setResult(null);
      parsePreview(f);
    },
    [parsePreview],
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'text/csv': ['.csv'] },
    maxFiles: 1,
  });

  const handleUpload = async () => {
    if (!file || !categoryId) {
      toast.error('Select a file and category');
      return;
    }
    if (!mapping.phone) {
      toast.error('Phone column mapping is required');
      return;
    }
    try {
      const res = await upload.mutateAsync({ file, categoryId, columnMapping: mapping });
      setResult(res.data);
      toast.success(`${res.data.inserted} leads imported`);
      onUploaded?.();
    } catch {
      toast.error('Upload failed');
    }
  };

  const fields = ['name', 'phone', 'email', 'company'];

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle>Upload CSV</CardTitle>
        <Button type="button" variant="outline" size="sm" onClick={downloadExampleCsv}>
          <Download className="mr-2 h-4 w-4" />
          Download Example
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Required column: <strong>phone</strong>. Optional: name, email, company. Use the example file as a template.
        </p>
        <div
          {...getRootProps()}
          className={`cursor-pointer rounded-lg border-2 border-dashed p-8 text-center transition-colors ${
            isDragActive ? 'border-primary bg-primary/5' : 'border-muted-foreground/25'
          }`}
        >
          <input {...getInputProps()} />
          <Upload className="mx-auto mb-2 h-8 w-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            {isDragActive ? 'Drop CSV here' : 'Drag & drop a .csv file, or click to browse'}
          </p>
        </div>

        {file && (
          <div className="flex items-center gap-2 text-sm">
            <FileText className="h-4 w-4" />
            {file.name} ({(file.size / 1024).toFixed(1)} KB)
          </div>
        )}

        <div className="space-y-2">
          <Label>Category *</Label>
          <Select value={categoryId} onValueChange={setCategoryId}>
            <SelectTrigger><SelectValue placeholder="Select category" /></SelectTrigger>
            <SelectContent>
              {categories?.map((c) => <SelectItem key={c._id} value={c._id}>{c.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        {preview.length > 0 && (
          <>
            <div className="space-y-2">
              <Label>Column Mapping</Label>
              <div className="grid grid-cols-2 gap-2">
                {fields.map((field) => (
                  <div key={field} className="flex items-center gap-2">
                    <span className="w-24 text-sm capitalize">
                      {field === 'name' ? 'Name / Business' : field}{field === 'phone' && ' *'}
                    </span>
                    <Select value={mapping[field] || ''} onValueChange={(v) => setMapping((m) => ({ ...m, [field]: v }))}>
                      <SelectTrigger className="flex-1"><SelectValue placeholder="—" /></SelectTrigger>
                      <SelectContent>
                        {headers.map((h) => <SelectItem key={h} value={h}>{h}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                ))}
              </div>
            </div>
            <Table>
              <TableHeader>
                <TableRow>{headers.map((h) => <TableHead key={h}>{h}</TableHead>)}</TableRow>
              </TableHeader>
              <TableBody>
                {preview.map((row, i) => (
                  <TableRow key={i}>{headers.map((h) => <TableCell key={h}>{row[h]}</TableCell>)}</TableRow>
                ))}
              </TableBody>
            </Table>
          </>
        )}

        <Button onClick={handleUpload} disabled={!file || !categoryId || upload.isPending}>
          {upload.isPending ? 'Uploading...' : 'Upload Leads'}
        </Button>

        {result && (
          <div className="rounded-lg border bg-muted/50 p-4 text-sm space-y-1">
            <p className="text-green-600">✓ {result.inserted} leads imported</p>
            <p className="text-amber-600">⚠ {result.duplicates} duplicates skipped</p>
            <p className="text-red-600">✗ {result.invalid} invalid phone numbers</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

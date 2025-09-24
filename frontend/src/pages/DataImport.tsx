// frontend/src/pages/DataImport.tsx - Version corrigée (headers + auto-mapping + format)
import React, { useState, useCallback, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDropzone } from 'react-dropzone';
import { FileUp, AlertCircle, CheckCircle, Download, Settings } from 'lucide-react';
import Layout from '../components/common/Layout';
import triangleService from '../services/triangleService';
import { useNotifications } from '../context/NotificationContext';

interface ImportError {
  row?: number;
  column?: string;
  message: string;
  type: 'error' | 'warning';
}

interface ValidationResult {
  isValid: boolean;
  errors: ImportError[];
  warnings: ImportError[];
  summary: {
    totalRows: number;
    totalColumns: number;
    dateRange: { start: string; end: string };
    triangleType: string;
  };
}

type PreviewRow = string[] | Record<string, unknown>;
type DataFormat = 'standard' | 'matrix';

const HEADER_SYNONYMS = {
  accident: [
    'accident period','accident_year','accident year','accident date',
    'accident_month','accident month','ay','origin year','origin period','date survenance',
    'survenance','date sinistre','période accident','annee accident','mois accident'
  ],
  development: [
    'development period','development','dev','dev period','development age','age',
    'elapsed months','lag','maturity','dév','période développement','age de dev'
  ],
  amount: [
    'amount','paid','paid amount','payment','incurred','incurred amount','reported',
    'montant','paiement','survenu','déclaré','value'
  ],
} as const;

function normalizeHeader(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g,' ').replace(/[._-]+/g,' ');
}

function removeBOM(text: string): string {
  if (text.charCodeAt(0) === 0xFEFF) return text.slice(1);
  return text;
}

function detectDelimiter(sample: string): string {
  const candidates = [';', ',', '\t'];
  const lines = sample.split(/\r?\n/).filter(l => l.trim().length>0).slice(0, 10);
  let best = ',', bestScore = -1;
  for (const d of candidates) {
    const counts = lines.map(l => l.split(d).length);
    const avg = counts.reduce((a,b)=>a+b,0)/Math.max(1,counts.length);
    const varc = counts.reduce((a,b)=>a + Math.pow(b-avg,2),0)/Math.max(1,counts.length);
    const score = avg - varc;
    if (score > bestScore) { bestScore = score; best = d; }
  }
  return best;
}

function parseCSVPreview(text: string, delimiter: string): string[][] {
  const lines = text.split(/\r?\n/).filter(l => l.length>0).slice(0, 50);
  return lines.map(line => {
    const cells: string[] = [];
    let cur = '', inQuotes = false;
    for (let i=0;i<line.length;i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && line[i+1] === '"') { cur += '"'; i++; }
        else inQuotes = !inQuotes;
      } else if (ch === delimiter && !inQuotes) {
        cells.push(cur); cur='';
      } else {
        cur += ch;
      }
    }
    cells.push(cur);
    return cells.map(c => c.trim());
  });
}

const guessStandardMapping = (headers: string[]) => {
  const norm = headers.map(normalizeHeader);
  const findHeader = (keys: readonly string[]) => {
    const idx = norm.findIndex(h => keys.some(key => h.includes(key)));
    return idx >= 0 ? headers[idx] : '';
  };
  return {
    accident: findHeader(HEADER_SYNONYMS.accident),
    development: findHeader(HEADER_SYNONYMS.development),
    amount: findHeader(HEADER_SYNONYMS.amount),
  };
};

const guessMatrixDevStart = (headers: string[]) => {
  const norm = headers.map(normalizeHeader);
  for (let i=1;i<norm.length;i++) {
    const h = norm[i];
    if (/^(dev|d|m)?\s*\d{1,3}$/.test(h) || /^dev\s*\d{1,3}/.test(h) || /(^|\s)(12|24|36|48|60|72|84|96)($|\s)/.test(h)) {
      return i;
    }
    if (h.includes('dev') || h.includes('développement')) return i;
  }
  return 1;
};

const DataImport: React.FC = () => {
  const navigate = useNavigate();
  const { success, error: showError, info, warning } = useNotifications();

  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [validationResult, setValidationResult] = useState<ValidationResult | null>(null);
  const [isValidating, setIsValidating] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [importProgress, setImportProgress] = useState(0);
  const [previewData, setPreviewData] = useState<string[][]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [importResult, setImportResult] = useState<any>(null);
  const [showAdvancedConfig, setShowAdvancedConfig] = useState(false);

  const [importConfig, setImportConfig] = useState({
    triangleName: '',
    triangleType: 'paid' as 'paid' | 'incurred' | 'reported',
    currency: 'EUR',
    businessLine: '',
    description: '',
    dateFormat: 'YYYY-MM-DD',
    delimiter: ',' as string,
    hasHeaders: true,
    skipRows: 0,
    dataFormat: 'standard' as DataFormat,
    mappings: {
      // Standard
      accidentPeriod: '',
      developmentPeriod: '',
      amount: '',
      // Matrix
      accidentPeriodColumn: 0,
      firstDevelopmentColumn: 1,
    },
  });

  const detectDataFormat = (preview: string[][], hasHeaders: boolean): DataFormat => {
    if (preview.length < 2) return 'standard';
    const dataRow = preview[hasHeaders ? 1 : 0] ?? [];
    const firstCell = String(dataRow[0] ?? '').trim();
    if (dataRow.length > 3 && (/^\d{4}$/.test(firstCell) || /^\d{4}[-/]\d{1,2}$/.test(firstCell))) {
      return 'matrix';
    }
    return 'standard';
  };

  const autoMapFromHeaders = (fmt: DataFormat, hdrs: string[]) => {
    if (fmt === 'standard') {
      const g = guessStandardMapping(hdrs);
      setImportConfig(prev => ({
        ...prev,
        mappings: {
          ...prev.mappings,
          accidentPeriod: g.accident || prev.mappings.accidentPeriod || hdrs[0] || '',
          developmentPeriod: g.development || prev.mappings.developmentPeriod || hdrs[1] || '',
          amount: g.amount || prev.mappings.amount || hdrs[2] || '',
        }
      }));
    } else {
      const devStart = guessMatrixDevStart(hdrs);
      setImportConfig(prev => ({
        ...prev,
        mappings: {
          ...prev.mappings,
          accidentPeriodColumn: 0,
          firstDevelopmentColumn: devStart,
        }
      }));
    }
  };

  const readFileAsText = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = e => {
        const result = e.target?.result;
        if (typeof result === 'string') resolve(result);
        else reject(new Error('Erreur de lecture du fichier'));
      };
      reader.onerror = () => reject(new Error('Erreur de lecture du fichier'));
      reader.readAsText(file);
    });
  };

  const onDrop = useCallback(
    async (acceptedFiles: File[]) => {
      if (acceptedFiles.length === 0) return;
      const file = acceptedFiles[0];
      setUploadedFile(file);
      setValidationResult(null);
      setImportResult(null);
      setHeaders([]);
      setPreviewData([]);

      try {
        if (/\.(xls|xlsx)$/i.test(file.name)) {
          warning('Aperçu Excel limité', 'Exportez en CSV pour une détection fiable des en-têtes, ou ajoutez une lib xlsx côté frontend.');
        }

        let content = await readFileAsText(file);
        content = removeBOM(content);

        let delimiter = importConfig.delimiter;
        if (/\.(csv|txt|tsv)$/i.test(file.name)) {
          delimiter = detectDelimiter(content);
        }

        const preview = parseCSVPreview(content, delimiter);
        setPreviewData(preview);
        setImportConfig(prev => ({ ...prev, delimiter }));

        const hasHeaders = importConfig.hasHeaders;
        const fmt = detectDataFormat(preview, hasHeaders);
        setImportConfig(prev => ({ ...prev, dataFormat: fmt }));

        const hdrs = hasHeaders && preview.length ? preview[0].map(h => h?.toString() ?? '') : [];
        setHeaders(hdrs);

        if (hdrs.length > 0) autoMapFromHeaders(fmt, hdrs);

      } catch (err) {
        console.error('Erreur de prévisualisation:', err);
        setPreviewData([]);
        showError('Erreur de lecture', 'Impossible de lire le fichier');
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [importConfig.hasHeaders]
  );

  useEffect(() => {
    if (!previewData.length) return;
    const fmt = detectDataFormat(previewData, importConfig.hasHeaders);
    setImportConfig(prev => ({ ...prev, dataFormat: fmt }));
    const hdrs = importConfig.hasHeaders ? (previewData[0] ?? []).map(String) : [];
    setHeaders(hdrs);
    if (hdrs.length) autoMapFromHeaders(fmt, hdrs);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [importConfig.hasHeaders]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'text/csv': ['.csv', '.tsv'],
      'text/plain': ['.txt'],
      'application/vnd.ms-excel': ['.xls'],
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
      'application/json': ['.json'],
    },
    maxFiles: 1,
    multiple: false,
    noClick: false,
    noKeyboard: false
  });

  const validateFile = async () => {
    if (!uploadedFile) return;
    setIsValidating(true);
    try {
      await new Promise(r => setTimeout(r, 400));

      const errors: ImportError[] = [];
      const warnings: ImportError[] = [];

      if (previewData.length === 0) {
        errors.push({ message: 'Fichier vide ou illisible', type: 'error' });
      } else {
        const firstRow = previewData[0] ?? [];
        const totalColumns = firstRow.length;

        if (importConfig.dataFormat === 'matrix') {
          if (totalColumns < 3) {
            errors.push({ message: 'Format matriciel : au moins 3 colonnes requises (Année + ≥2 développements)', type: 'error' });
          }
          const dataStart = importConfig.hasHeaders ? 1 : 0;
          const firstCell = (previewData[dataStart]?.[0] ?? '').toString().trim();
          if (!/^\d{4}([-/]\d{1,2})?$/.test(firstCell)) {
            warnings.push({ message: 'La première colonne ne ressemble pas à un year/period (ex. 2020 ou 2020-01)', type: 'warning' });
          }
        } else {
          if (totalColumns < 3) {
            errors.push({ message: 'Format standard : au moins 3 colonnes (Accident, Développement, Montant)', type: 'error' });
          }
          if (importConfig.hasHeaders) {
            const need = ['accidentPeriod','developmentPeriod','amount'] as const;
            need.forEach(k => {
              const v = (importConfig.mappings as any)[k];
              if (!v || !headers.includes(v)) {
                errors.push({ message: `Mapping manquant pour "${k}" (sélectionnez la colonne correspondante)`, type: 'error' });
              }
            });
          }
        }

        if (importConfig.hasHeaders && previewData.length < 2) {
          errors.push({ message: 'Aucune donnée trouvée après les en-têtes', type: 'error' });
        }
      }

      const isValid = errors.length === 0;
      const totalColumns = previewData.length > 0 ? previewData[0].length : 0;
      setValidationResult({
        isValid,
        errors,
        warnings,
        summary: {
          totalRows: previewData.length,
          totalColumns,
          dateRange: { start: '—', end: '—' },
          triangleType: importConfig.triangleType,
        },
      });

      if (isValid) success('Validation réussie', `Fichier validé (format ${importConfig.dataFormat})`);
      else showError('Validation échouée', `${errors.length} erreur(s) détectée(s)`);

    } catch (err) {
      console.error('Erreur validation:', err);
      showError('Erreur de validation', 'Impossible de valider le fichier');
    } finally {
      setIsValidating(false);
    }
  };

  const handleImport = async () => {
    if (!uploadedFile || !validationResult?.isValid) {
      showError('Import impossible', 'Fichier non valide ou validation manquante');
      return;
    }
    setIsImporting(true);
    setImportProgress(0);
    let timer: any = null;

    try {
      timer = setInterval(() => setImportProgress(p => Math.min(p + 12, 90)), 500);

      const triangleName = importConfig.triangleName.trim();
      if (!triangleName) {
        showError('Nom requis', 'Le nom du triangle est obligatoire');
        return;
      }

      const businessLine = importConfig.businessLine || 'other';

      // ---------- PARAMÈTRES ENVOYÉS AU BACKEND ----------
      const params: any = {
        name: triangleName,
        triangle_name: triangleName,
        branch: businessLine,
        type: importConfig.triangleType,
        currency: importConfig.currency,
        description: importConfig.description.trim() || undefined,
        hasHeaders: importConfig.hasHeaders,
        separator: importConfig.delimiter,
        date_format: importConfig.dateFormat,
        skip_rows: importConfig.skipRows || 0,
        data_format: importConfig.dataFormat,
        // compat avec anciens endpoints
        format: importConfig.dataFormat,
      };

      if (importConfig.dataFormat === 'matrix') {
        const accIdx = importConfig.mappings.accidentPeriodColumn;
        const devStart = importConfig.mappings.firstDevelopmentColumn;

        // Index (toujours utiles)
        params.accident_period_column = accIdx;
        params.first_development_column = devStart;

        // Si en-têtes présents, envoyer aussi les NOMS d’en-têtes
        if (importConfig.hasHeaders && headers.length > 0) {
          params.accident_period_field = headers[accIdx] ?? headers[0];
          const devFields = headers.slice(devStart).map(h => (h ?? '').toString());
          params.development_fields = devFields;

          // Pour compat maximal (le backend ignorera ce qu’il ne connaît pas)
          params.development_period_fields = devFields;
        }
      } else {
        // Format standard : on envoie les noms de colonnes sélectionnés
        params.accident_period_field = importConfig.mappings.accidentPeriod;
        params.development_period_field = importConfig.mappings.developmentPeriod;
        params.amount_field = importConfig.mappings.amount;
      }
      // ----------------------------------------------------

      // Debug client (utile si ça re-plante)
      // console.log('PARAMS IMPORT =>', params);

      const result = await triangleService.importTriangle(uploadedFile, params);

      if (timer) clearInterval(timer);
      setImportProgress(100);

      if (result.success) {
        setImportResult({ ...result, triangle_name: triangleName, business_line: businessLine });
        success('Import réussi', `Triangle "${triangleName}" importé (${importConfig.dataFormat})`);
        setTimeout(() => {
          setIsImporting(false);
          navigate('/triangles');
        }, 2000);
      } else {
        throw new Error(`Import échoué: ${result.errors?.join(', ') || 'Erreur inconnue'}`);
      }

    } catch (err: any) {
      console.error('Erreur import:', err);
      if (timer) clearInterval(timer);
      setImportProgress(0);
      showError('Erreur d\'import', err?.message || 'Impossible d’effectuer l’import');
      setIsImporting(false);
    }
  };

  const downloadTemplate = () => {
    const standardTemplate = `Accident Period,Development Period,Amount
2020-01,0,1000000
2020-01,12,500000
2020-01,24,250000
2020-02,0,1200000
2020-02,12,600000
2020-03,0,1100000`;

    const matrixTemplate = `Accident Year,Dev 12,Dev 24,Dev 36,Dev 48
2020,1000000,500000,250000,125000
2021,1200000,600000,300000,150000
2022,1100000,550000,275000,137500`;

    const template = importConfig.dataFormat === 'matrix' ? matrixTemplate : standardTemplate;
    const filename = importConfig.dataFormat === 'matrix' ? 'template_triangle_matrix.csv' : 'template_triangle_standard.csv';

    try {
      const blob = new Blob([template], { type: 'text/csv;charset=utf-8;' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.style.display = 'none';
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setTimeout(() => window.URL.revokeObjectURL(url), 100);
      info('Téléchargement', `Template CSV ${importConfig.dataFormat} téléchargé`);
    } catch (e) {
      console.error('Erreur téléchargement:', e);
      showError('Erreur téléchargement', 'Impossible de télécharger le template');
    }
  };

  // Handlers simples
  const handleTriangleNameChange = (e: React.ChangeEvent<HTMLInputElement>) =>
    setImportConfig(prev => ({ ...prev, triangleName: e.target.value }));
  const handleTriangleTypeChange = (e: React.ChangeEvent<HTMLSelectElement>) =>
    setImportConfig(prev => ({ ...prev, triangleType: e.target.value as any }));
  const handleCurrencyChange = (e: React.ChangeEvent<HTMLSelectElement>) =>
    setImportConfig(prev => ({ ...prev, currency: e.target.value }));
  const handleBusinessLineChange = (e: React.ChangeEvent<HTMLSelectElement>) =>
    setImportConfig(prev => ({ ...prev, businessLine: e.target.value }));
  const handleDescriptionChange = (e: React.ChangeEvent<HTMLTextAreaElement>) =>
    setImportConfig(prev => ({ ...prev, description: e.target.value }));
  const handleHeadersChange = (e: React.ChangeEvent<HTMLInputElement>) =>
    setImportConfig(prev => ({ ...prev, hasHeaders: e.target.checked }));
  const handleDataFormatChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newFormat = e.target.value as DataFormat;
    setImportConfig(prev => ({ ...prev, dataFormat: newFormat }));
    setValidationResult(null);
  };
  const handleRemoveFile = (e: React.MouseEvent) => {
    e.stopPropagation();
    setUploadedFile(null);
    setValidationResult(null);
    setPreviewData([]);
    setHeaders([]);
  };
  const handleReset = () => {
    setImportResult(null);
    setUploadedFile(null);
    setValidationResult(null);
    setPreviewData([]);
    setHeaders([]);
    setImportConfig(prev => ({
      ...prev,
      triangleName: '',
      mappings: { ...prev.mappings, accidentPeriod:'', developmentPeriod:'', amount:'' }
    }));
  };

  const headerOptions = useMemo(() => headers.map(h => ({ value: h, label: h })), [headers]);

  return (
    <Layout>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="bg-white rounded-lg shadow">
          {/* Header */}
          <div className="px-6 py-4 border-b border-gray-200">
            <div className="flex justify-between items-center">
              <h1 className="text-2xl font-bold text-gray-900">Import de Données</h1>
              <div className="flex gap-2">
                <button
                  onClick={() => setShowAdvancedConfig(!showAdvancedConfig)}
                  className="flex items-center gap-2 px-3 py-2 text-sm text-gray-600 hover:text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                  type="button"
                >
                  <Settings className="h-4 w-4" />
                  {showAdvancedConfig ? 'Masquer config' : 'Config avancée'}
                </button>
                <button
                  onClick={downloadTemplate}
                  className="flex items-center gap-2 px-4 py-2 text-sm text-blue-600 hover:text-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                  type="button"
                >
                  <Download className="h-4 w-4" />
                  Template {importConfig.dataFormat}
                </button>
              </div>
            </div>
          </div>

          {/* Corps */}
          <div className="p-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Zone de dépôt */}
              <div>
                <h3 className="text-lg font-medium text-gray-900 mb-4">1. Sélectionner le fichier</h3>

                <div
                  {...getRootProps()}
                  className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
                    isDragActive ? 'border-blue-500 bg-blue-50' : 'border-gray-300 hover:border-gray-400'
                  }`}
                >
                  <input {...getInputProps()} />
                  <FileUp className="h-12 w-12 mx-auto text-gray-400 mb-4" />
                  {uploadedFile ? (
                    <div className="space-y-2">
                      <p className="text-sm font-medium text-gray-900">{uploadedFile.name}</p>
                      <p className="text-xs text-gray-500">{(uploadedFile.size / 1024).toFixed(2)} KB</p>
                      <p className="text-xs font-medium text-blue-600">
                        Format détecté: {importConfig.dataFormat === 'matrix' ? 'Matriciel' : 'Standard'} •
                        &nbsp;Délimiteur: "{importConfig.delimiter === '\t' ? 'TAB' : importConfig.delimiter}"
                      </p>
                      <button
                        onClick={handleRemoveFile}
                        className="text-xs text-red-600 hover:text-red-700 focus:outline-none"
                        type="button"
                      >
                        Supprimer
                      </button>
                    </div>
                  ) : (
                    <>
                      <p className="text-sm text-gray-600">Glissez-déposez votre fichier ici, ou cliquez pour sélectionner</p>
                      <p className="text-xs text-gray-500 mt-2">Formats supportés: CSV, TXT, TSV, Excel (aperçu limité), JSON</p>
                    </>
                  )}
                </div>

                {/* Aperçu */}
                {previewData.length > 0 && (
                  <div className="mt-4">
                    <div className="flex justify-between items-center mb-2">
                      <h4 className="text-sm font-medium text-gray-700">Aperçu des données</h4>
                      <span className="text-xs px-2 py-1 rounded bg-blue-100 text-blue-700">
                        {importConfig.dataFormat === 'matrix' ? 'Format Matriciel' : 'Format Standard'}
                      </span>
                    </div>
                    <div className="border rounded-lg overflow-hidden">
                      <div className="overflow-x-auto">
                        <table className="min-w-full text-xs">
                          <tbody>
                            {previewData.slice(0, 8).map((row, i) => (
                              <tr key={i} className={i === 0 && importConfig.hasHeaders ? 'bg-gray-50 font-medium' : ''}>
                                {row.map((cell, j) => (
                                  <td
                                    key={j}
                                    className={`px-2 py-1 border-r ${
                                      importConfig.dataFormat === 'matrix' && j === 0 ? 'bg-yellow-50 font-medium' : ''
                                    }`}
                                    title={importConfig.dataFormat === 'matrix' && j === 0 ? 'Colonne période accident' : ''}
                                  >
                                    {String(cell)}
                                  </td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>

                    <div className="mt-2 text-xs text-gray-600">
                      {importConfig.hasHeaders ? '✓ La première ligne est interprétée comme des en-têtes.' : '⚠ La première ligne est interprétée comme des données (pas d’en-têtes).'}
                    </div>
                  </div>
                )}
              </div>

              {/* Configuration */}
              <div>
                <h3 className="text-lg font-medium text-gray-900 mb-4">2. Configurer l'import</h3>

                <div className="space-y-4">
                  <div>
                    <label htmlFor="triangleName" className="block text-sm font-medium text-gray-700 mb-1">
                      Nom du triangle <span className="text-red-500">*</span>
                    </label>
                    <input
                      id="triangleName"
                      type="text"
                      value={importConfig.triangleName}
                      onChange={e => setImportConfig(prev => ({ ...prev, triangleName: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                      placeholder="Ex: RC 2023, Auto 2024, DAB Commerciaux..."
                      required
                    />
                  </div>

                  {showAdvancedConfig && (
                    <div className="p-4 bg-gray-50 rounded-lg space-y-4">
                      <h4 className="font-medium text-gray-700">Configuration avancée</h4>

                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Format des données</label>
                          <select
                            value={importConfig.dataFormat}
                            onChange={handleDataFormatChange}
                            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                          >
                            <option value="standard">Standard (lignes)</option>
                            <option value="matrix">Matriciel (triangle)</option>
                          </select>
                        </div>

                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Délimiteur</label>
                          <select
                            value={importConfig.delimiter}
                            onChange={(e)=>setImportConfig(p=>({ ...p, delimiter: e.target.value }))}
                            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                          >
                            <option value=",">, (virgule)</option>
                            <option value=";">; (point-virgule)</option>
                            <option value="\t">TAB</option>
                          </select>
                        </div>

                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Format de date</label>
                          <input
                            value={importConfig.dateFormat}
                            onChange={(e)=>setImportConfig(p=>({ ...p, dateFormat: e.target.value }))}
                            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                            placeholder="YYYY-MM-DD ou YYYY-MM"
                          />
                        </div>

                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Lignes à ignorer</label>
                          <input
                            type="number"
                            min={0}
                            value={importConfig.skipRows}
                            onChange={(e)=>setImportConfig(p=>({ ...p, skipRows: parseInt(e.target.value||'0',10) }))}
                            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                          />
                        </div>
                      </div>

                      <div className="flex items-center">
                        <input
                          type="checkbox"
                          id="hasHeaders"
                          checked={importConfig.hasHeaders}
                          onChange={e => setImportConfig(prev => ({ ...prev, hasHeaders: e.target.checked }))}
                          className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                        />
                        <label htmlFor="hasHeaders" className="ml-2 text-sm text-gray-700">
                          La première ligne contient les en-têtes
                        </label>
                      </div>
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Type de triangle</label>
                      <select
                        value={importConfig.triangleType}
                        onChange={e => setImportConfig(prev => ({ ...prev, triangleType: e.target.value as any }))}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                      >
                        <option value="paid">Payés</option>
                        <option value="incurred">Survenus</option>
                        <option value="reported">Déclarés</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Devise</label>
                      <select
                        value={importConfig.currency}
                        onChange={e => setImportConfig(prev => ({ ...prev, currency: e.target.value }))}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                      >
                        <option value="EUR">EUR</option>
                        <option value="USD">USD</option>
                        <option value="GBP">GBP</option>
                        <option value="CHF">CHF</option>
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Branche d'activité</label>
                    <select
                      value={importConfig.businessLine}
                      onChange={e => setImportConfig(prev => ({ ...prev, businessLine: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                    >
                      <option value="">Sélectionner...</option>
                      <option value="auto">Automobile</option>
                      <option value="rc">Responsabilité Civile</option>
                      <option value="dab">Dommages aux Biens</option>
                      <option value="property">Property</option>
                      <option value="liability">RC Générale</option>
                      <option value="health">Santé</option>
                      <option value="life">Vie</option>
                      <option value="workers_comp">Accidents du Travail</option>
                      <option value="marine">Marine</option>
                      <option value="aviation">Aviation</option>
                      <option value="construction">Construction</option>
                      <option value="cyber">Cyber Risques</option>
                      <option value="other">Autre</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                    <textarea
                      value={importConfig.description}
                      onChange={e => setImportConfig(prev => ({ ...prev, description: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                      rows={3}
                      placeholder="Description optionnelle..."
                    />
                  </div>

                  {/* MAPPINGS */}
                  {importConfig.dataFormat === 'standard' && (
                    <div className="p-4 bg-gray-50 rounded-lg space-y-3">
                      <h4 className="font-medium text-gray-700">Mapping (format standard)</h4>

                      <div>
                        <label className="block text-sm text-gray-700 mb-1">Colonne période accident</label>
                        <select
                          value={importConfig.mappings.accidentPeriod}
                          onChange={(e)=>setImportConfig(p=>({ ...p, mappings: { ...p.mappings, accidentPeriod: e.target.value } }))}
                          className="w-full px-3 py-2 border border-gray-300 rounded-md"
                          disabled={!headers.length}
                        >
                          <option value="">{headers.length ? 'Sélectionner...' : 'Aucune en-tête détectée'}</option>
                          {headerOptions.map(h => <option key={h.value} value={h.value}>{h.label}</option>)}
                        </select>
                        <p className="text-xs text-gray-500 mt-1">Synonymes détectés: Accident Period/Year/Date, Survenance, Origin Year…</p>
                      </div>

                      <div>
                        <label className="block text-sm text-gray-700 mb-1">Colonne période de développement</label>
                        <select
                          value={importConfig.mappings.developmentPeriod}
                          onChange={(e)=>setImportConfig(p=>({ ...p, mappings: { ...p.mappings, developmentPeriod: e.target.value } }))}
                          className="w-full px-3 py-2 border border-gray-300 rounded-md"
                          disabled={!headers.length}
                        >
                          <option value="">{headers.length ? 'Sélectionner...' : 'Aucune en-tête détectée'}</option>
                          {headerOptions.map(h => <option key={h.value} value={h.value}>{h.label}</option>)}
                        </select>
                      </div>

                      <div>
                        <label className="block text-sm text-gray-700 mb-1">Colonne montant</label>
                        <select
                          value={importConfig.mappings.amount}
                          onChange={(e)=>setImportConfig(p=>({ ...p, mappings: { ...p.mappings, amount: e.target.value } }))}
                          className="w-full px-3 py-2 border border-gray-300 rounded-md"
                          disabled={!headers.length}
                        >
                          <option value="">{headers.length ? 'Sélectionner...' : 'Aucune en-tête détectée'}</option>
                          {headerOptions.map(h => <option key={h.value} value={h.value}>{h.label}</option>)}
                        </select>
                      </div>
                    </div>
                  )}

                  {importConfig.dataFormat === 'matrix' && (
                    <div className="p-4 bg-gray-50 rounded-lg space-y-3">
                      <h4 className="font-medium text-gray-700">Mapping (format matriciel)</h4>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm text-gray-700 mb-1">Index colonne période accident</label>
                          <input
                            type="number"
                            min={0}
                            value={importConfig.mappings.accidentPeriodColumn}
                            onChange={(e)=>setImportConfig(p=>({ ...p, mappings: { ...p.mappings, accidentPeriodColumn: parseInt(e.target.value||'0',10) } }))}
                            className="w-full px-3 py-2 border border-gray-300 rounded-md"
                          />
                        </div>
                        <div>
                          <label className="block text-sm text-gray-700 mb-1">Index première colonne de développement</label>
                          <input
                            type="number"
                            min={1}
                            value={importConfig.mappings.firstDevelopmentColumn}
                            onChange={(e)=>setImportConfig(p=>({ ...p, mappings: { ...p.mappings, firstDevelopmentColumn: parseInt(e.target.value||'1',10) } }))}
                            className="w-full px-3 py-2 border border-gray-300 rounded-md"
                          />
                        </div>
                      </div>
                      <p className="text-xs text-gray-500">Par défaut : colonne 0 = accident (année/période), colonnes 1+ = développements (12, 24, 36, …)</p>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Validation */}
            {validationResult && (
              <div className="mt-6 p-4 rounded-lg bg-gray-50 border border-gray-200">
                <div className="flex items-start gap-3">
                  {validationResult.isValid ? (
                    <CheckCircle className="h-5 w-5 text-green-500 mt-0.5" />
                  ) : (
                    <AlertCircle className="h-5 w-5 text-red-500 mt-0.5" />
                  )}
                  <div className="flex-1">
                    <h4 className="font-medium text-gray-900">
                      {validationResult.isValid ? 'Validation réussie' : 'Validation échouée'}
                    </h4>

                    <div className="mt-2 text-sm text-gray-600">
                      <p>• {validationResult.summary.totalRows} lignes détectées</p>
                      <p>• {validationResult.summary.totalColumns} colonnes</p>
                      <p>• Format: {importConfig.dataFormat === 'matrix' ? 'Matriciel' : 'Standard'}</p>
                    </div>

                    {validationResult.errors.length > 0 && (
                      <div className="mt-3">
                        <h5 className="text-sm font-medium text-red-700">Erreurs:</h5>
                        <ul className="mt-1 text-sm text-red-600 space-y-1">
                          {validationResult.errors.slice(0, 6).map((err, i) => (
                            <li key={i}>
                              {err.row && `Ligne ${err.row}: `}
                              {err.column && `Colonne ${err.column}: `}
                              {err.message}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {validationResult.warnings.length > 0 && (
                      <div className="mt-3">
                        <h5 className="text-sm font-medium text-yellow-700">Avertissements:</h5>
                        <ul className="mt-1 text-sm text-yellow-600 space-y-1">
                          {validationResult.warnings.slice(0, 4).map((w, i) => (
                            <li key={i}>{w.message}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Résultat import */}
            {importResult && importResult.success && (
              <div className="mt-6 p-6 rounded-lg bg-green-50 border border-green-200">
                <div className="flex items-start gap-3">
                  <CheckCircle className="h-6 w-6 text-green-500 mt-0.5" />
                  <div className="flex-1">
                    <h4 className="font-medium text-green-900 mb-3">Import réussi !</h4>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                      <div className="bg-white p-3 rounded border">
                        <p className="text-sm text-gray-600">Triangle créé</p>
                        <p className="font-medium text-gray-900">{importConfig.triangleName}</p>
                        <p className="text-xs text-gray-500">ID: {importResult.triangle_id}</p>
                      </div>

                      <div className="bg-white p-3 rounded border">
                        <p className="text-sm text-gray-600">Données importées</p>
                        <p className="font-medium text-gray-900">{importResult.rows_imported} lignes importées</p>
                        <p className="text-xs text-gray-500">Format: {importConfig.dataFormat}</p>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-3">
                      <button
                        onClick={() => navigate('/triangles')}
                        className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2"
                        type="button"
                      >
                        Voir tous les triangles
                      </button>
                      <button
                        onClick={handleReset}
                        className="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2"
                        type="button"
                      >
                        Nouvel import
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Barre de progression */}
            {isImporting && (
              <div className="mt-6">
                <div className="flex justify-between text-sm text-gray-600 mb-2">
                  <span>Import en cours...</span>
                  <span>{importProgress}%</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div className="bg-blue-600 h-2 rounded-full transition-all duration-300" style={{ width: `${importProgress}%` }} />
                </div>
              </div>
            )}

            {/* Actions */}
            <div className="mt-6 flex justify-end gap-3">
              <button
                onClick={() => navigate('/dashboard')}
                className="px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                type="button"
              >
                Annuler
              </button>

              {!validationResult && (
                <button
                  onClick={validateFile}
                  disabled={!uploadedFile || !importConfig.triangleName || isValidating}
                  className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                  type="button"
                >
                  {isValidating ? 'Validation...' : 'Valider le fichier'}
                </button>
              )}

              {validationResult?.isValid && (
                <button
                  onClick={handleImport}
                  disabled={isImporting}
                  className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2"
                  type="button"
                >
                  {isImporting ? 'Import en cours...' : 'Importer les données'}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
};

export default DataImport;
// frontend/src/pages/Calculations.tsx - UI PRO + NAV AMÉLIORÉE + GLM/MC/BAYES (compatible backend)
import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Play,
  Info,
  Clock,
  TrendingUp,
  Layers,
  BarChart3,
  History,
  Save,
  PieChart,
  Brain,
  TreePine,
  Zap,
  Sigma,
  Dice5,
  Beaker,
  Filter,
  CheckCircle2,
  XCircle,
  Search,
  ChevronDown,
  ChevronUp,
  ClipboardList,
  RefreshCw,
} from 'lucide-react';
import Layout from '../components/common/Layout';
import { useTriangles } from '../hooks/useTriangles';
import { useCalculations } from '../hooks/useCalculations';
import { useNotifications } from '../context/NotificationContext';

/* ================= Types ================= */
interface Triangle {
  id: string;
  name: string;
  type: string;
  currency: string;
  branch?: string;
  business_line?: string;
  triangle_name?: string;
}
interface CalculationParameter {
  key: string;
  label: string;
  type: 'number' | 'select' | 'boolean' | 'range';
  default: any;
  options?: { value: any; label: string }[];
  min?: number;
  max?: number;
  step?: number;
  tooltip?: string;
}
interface CalculationMethodDef {
  id: string;
  name: string;
  description: string;
  category: 'deterministic' | 'stochastic' | 'machine_learning';
  icon: React.ReactNode;
  recommended: boolean;
  processingTime: string;
  accuracy: number;
  parameters: CalculationParameter[];
}
interface ServiceCalculationRequest {
  triangleId: string;
  methods: string[];
  parameters: Record<string, Record<string, unknown>>;
  options: {
    generateConfidenceIntervals?: boolean;
    confidenceLevel?: number;
    runSensitivityAnalysis?: boolean;
    includeStressTests?: boolean;
    exportFormat?: 'excel' | 'json' | 'pdf';
  };
}

/* ================= Page ================= */
const Calculations: React.FC = () => {
  const navigate = useNavigate();
  const { triangles } = useTriangles();
  const { runCalculation } = useCalculations();
  const { success, error: showError, info } = useNotifications();

  const [selectedTriangle, setSelectedTriangle] = useState<string>('');
  const [selectedMethods, setSelectedMethods] = useState<string[]>(['chain-ladder']);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [isLaunching, setIsLaunching] = useState(false);

  // UI nav améliorée
  const [activeCategory, setActiveCategory] = useState<'all' | 'deterministic' | 'stochastic' | 'machine_learning'>('all');
  const [q, setQ] = useState('');

  // Paramètres par méthode (incl. GLM / Monte Carlo / Bayésien)
  const [methodConfigs, setMethodConfigs] = useState<Record<string, any>>({
    'chain-ladder': { tailFactor: 1.0, excludeOutliers: true, smoothing: 'none' },
    'bornhuetter-ferguson': { aprioriLossRatio: 0.75, credibilityWeight: 0.5, adjustForInflation: true },
    mack: { confidenceLevel: 0.95, iterations: 1000, distributionType: 'lognormal' },
    'cape-cod': { exposureBase: 'premium', trendFactor: 1.03, onLevelFactor: 1.0 },
    'random-forest': { nEstimators: 100, maxDepth: 10, minSamplesSplit: 5, minSamplesLeaf: 3, randomState: 42 },
    'gradient-boosting': { nEstimators: 150, learningRate: 0.1, maxDepth: 6, minSamplesSplit: 10, minSamplesLeaf: 5, subsample: 0.8 },
    'neural-network': { hiddenLayers: [64, 32, 16], activation: 'relu', learningRate: 0.001, maxIter: 500, alpha: 0.001, earlyStopping: true },
    glm: { link: 'log', family: 'poisson', alpha: 0.0, max_iter: 1000 },
    'stochastic-monte-carlo': { n_sims: 2000, seed: 42 },
    'bayesian-reserving': { prior_shape: 2.0, prior_rate: 1.0, nsims: 2000, seed: 7 },
  });

  // Mock calculs récents (affichage)
  const [recentCalculations] = useState([
    { id: '1', triangleName: 'Auto 2024', createdAt: new Date().toISOString() },
    { id: '2', triangleName: 'RC 2024', createdAt: new Date(Date.now() - 86400000).toISOString() },
  ]);

  // Nommage triangle (robuste)
  const getTriangleName = (triangle: Triangle): string => {
    if (triangle.triangle_name?.trim()) return triangle.triangle_name.trim();
    if (triangle.name?.trim()) {
      const name = triangle.name.trim();
      if (!/triangle importé|triangle mocké|triangle de/i.test(name)) return name;
    }
    if (triangle.business_line?.trim()) return triangle.business_line.trim();
    if (triangle.branch?.trim()) return triangle.branch.trim();
    return triangle.name || `Triangle ${triangle.id}`;
  };

  // ----- Définition des méthodes (incl. nouvelles) -----
  const calculationMethods: CalculationMethodDef[] = [
    {
      id: 'chain-ladder',
      name: 'Chain Ladder',
      description: 'Méthode déterministe classique basée sur les facteurs de développement',
      category: 'deterministic',
      icon: <Layers className="h-5 w-5" />,
      recommended: true,
      processingTime: '< 1s',
      accuracy: 85,
      parameters: [
        { key: 'tailFactor', label: 'Facteur de queue', type: 'number', default: 1.0, min: 0.9, max: 1.5, step: 0.01, tooltip: 'Facteur appliqué pour les périodes futures' },
        { key: 'excludeOutliers', label: 'Exclure les valeurs aberrantes', type: 'boolean', default: true },
        { key: 'smoothing', label: 'Lissage', type: 'select', default: 'none', options: [{ value: 'none', label: 'Aucun' }, { value: 'exponential', label: 'Exponentiel' }, { value: 'geometric', label: 'Géométrique' }] },
      ],
    },
    {
      id: 'bornhuetter-ferguson',
      name: 'Bornhuetter-Ferguson',
      description: "Combine l'expérience historique avec une estimation a priori",
      category: 'deterministic',
      icon: <TrendingUp className="h-5 w-5" />,
      recommended: true,
      processingTime: '< 2s',
      accuracy: 88,
      parameters: [
        { key: 'aprioriLossRatio', label: 'Ratio de sinistralité a priori', type: 'number', default: 0.75, min: 0.5, max: 1.5, step: 0.01 },
        { key: 'credibilityWeight', label: 'Poids de crédibilité', type: 'range', default: 0.5, min: 0, max: 1, step: 0.1 },
        { key: 'adjustForInflation', label: "Ajuster pour l'inflation", type: 'boolean', default: true },
      ],
    },
    {
      id: 'cape-cod',
      name: 'Cape Cod',
      description: "Variante type BF : pondération par l'exposition (prime, polices), on-level & trend.",
      category: 'deterministic',
      icon: <PieChart className="h-5 w-5" />,
      recommended: true,
      processingTime: '< 3s',
      accuracy: 89,
      parameters: [
        { key: 'exposureBase', label: "Base d'exposition", type: 'select', default: 'premium', options: [{ value: 'premium', label: 'Prime' }, { value: 'policy_count', label: 'Nombre de polices' }, { value: 'earned_exposure', label: 'Exposition acquise' }], tooltip: "Variable d'exposition utilisée pour la pondération." },
        { key: 'trendFactor', label: 'Facteur de trend', type: 'number', default: 1.03, min: 0.9, max: 1.5, step: 0.01, tooltip: 'Trend multiplicatif appliqué aux historiques.' },
        { key: 'onLevelFactor', label: 'On-level factor', type: 'number', default: 1.0, min: 0.8, max: 1.5, step: 0.01, tooltip: 'Ajustement tarifaire au niveau courant.' },
      ],
    },
    {
      id: 'mack',
      name: 'Mack',
      description: 'Extension stochastique du Chain Ladder avec intervalles de confiance',
      category: 'stochastic',
      icon: <BarChart3 className="h-5 w-5" />,
      recommended: false,
      processingTime: '5-10s',
      accuracy: 92,
      parameters: [
        { key: 'confidenceLevel', label: 'Niveau de confiance', type: 'select', default: 0.95, options: [{ value: 0.9, label: '90%' }, { value: 0.95, label: '95%' }, { value: 0.99, label: '99%' }] },
        { key: 'iterations', label: "Nombre d'itérations", type: 'number', default: 1000, min: 100, max: 10000, step: 100 },
        { key: 'distributionType', label: 'Type de distribution', type: 'select', default: 'lognormal', options: [{ value: 'normal', label: 'Normale' }, { value: 'lognormal', label: 'Log-normale' }, { value: 'gamma', label: 'Gamma' }] },
      ],
    },
    // Nouvelles
    {
      id: 'glm',
      name: 'GLM (Poisson log)',
      description: 'GLM sur incrémentaux (famille Poisson, lien log) pour compléter le triangle.',
      category: 'stochastic',
      icon: <Sigma className="h-5 w-5" />,
      recommended: true,
      processingTime: '2-5s',
      accuracy: 90,
      parameters: [
        { key: 'family', label: 'Famille', type: 'select', default: 'poisson', options: [{ value: 'poisson', label: 'Poisson' }, { value: 'tweedie', label: 'Tweedie' }], tooltip: 'Famille de distribution.' },
        { key: 'link', label: 'Lien', type: 'select', default: 'log', options: [{ value: 'log', label: 'log' }], tooltip: 'Lien GLM.' },
        { key: 'alpha', label: 'Régularisation α', type: 'number', default: 0.0, min: 0, max: 1, step: 0.01 },
        { key: 'max_iter', label: 'Itérations max', type: 'number', default: 1000, min: 100, max: 5000, step: 50 },
      ],
    },
    {
      id: 'stochastic-monte-carlo',
      name: 'Stochastic Reserving (Monte Carlo)',
      description: 'Bootstrap facteurs + distribution des ultimates + CDR à 1 an.',
      category: 'stochastic',
      icon: <Dice5 className="h-5 w-5" />,
      recommended: true,
      processingTime: '5-15s',
      accuracy: 90,
      parameters: [
        { key: 'n_sims', label: "Nombre de simulations", type: 'number', default: 2000, min: 200, max: 20000, step: 100, tooltip: "Itérations Monte Carlo" },
        { key: 'seed', label: 'Seed', type: 'number', default: 42, min: 0, max: 10000, step: 1, tooltip: 'Graine aléatoire' },
      ],
    },
    {
      id: 'bayesian-reserving',
      name: 'Réserves Bayésiennes (Gamma-Poisson)',
      description: 'Priors Gamma par colonne, prédictif NB, quantiles et std.',
      category: 'stochastic',
      icon: <Beaker className="h-5 w-5" />,
      recommended: false,
      processingTime: '3-8s',
      accuracy: 88,
      parameters: [
        { key: 'prior_shape', label: 'Prior shape (a)', type: 'number', default: 2.0, min: 0.1, max: 20, step: 0.1, tooltip: "Paramètre 'a' de la Gamma" },
        { key: 'prior_rate', label: 'Prior rate (b)', type: 'number', default: 1.0, min: 0.01, max: 50, step: 0.01, tooltip: "Paramètre 'b' de la Gamma" },
        { key: 'nsims', label: 'Simulations', type: 'number', default: 2000, min: 200, max: 20000, step: 100 },
        { key: 'seed', label: 'Seed', type: 'number', default: 7, min: 0, max: 10000, step: 1 },
      ],
    },
    {
      id: 'random-forest',
      name: 'Random Forest',
      description: "Ensemble d'arbres, non-linéarités, robuste.",
      category: 'machine_learning',
      icon: <TreePine className="h-5 w-5" />,
      recommended: true,
      processingTime: '10-15s',
      accuracy: 91,
      parameters: [
        { key: 'nEstimators', label: "Nombre d'arbres", type: 'number', default: 100, min: 10, max: 500, step: 10 },
        { key: 'maxDepth', label: 'Profondeur max', type: 'number', default: 10, min: 3, max: 20, step: 1 },
        { key: 'minSamplesSplit', label: 'Échantillons min split', type: 'number', default: 5, min: 2, max: 20, step: 1 },
        { key: 'minSamplesLeaf', label: 'Échantillons min feuille', type: 'number', default: 3, min: 1, max: 10, step: 1 },
      ],
    },
    {
      id: 'gradient-boosting',
      name: 'Gradient Boosting',
      description: 'Boosting séquentiel pour minimiser les erreurs.',
      category: 'machine_learning',
      icon: <Zap className="h-5 w-5" />,
      recommended: true,
      processingTime: '15-20s',
      accuracy: 93,
      parameters: [
        { key: 'nEstimators', label: "Nombre d'estimateurs", type: 'number', default: 150, min: 50, max: 300, step: 10 },
        { key: 'learningRate', label: "Taux d'apprentissage", type: 'number', default: 0.1, min: 0.01, max: 0.5, step: 0.01 },
        { key: 'maxDepth', label: 'Profondeur max', type: 'number', default: 6, min: 3, max: 15, step: 1 },
        { key: 'subsample', label: "Fraction d'échantillonnage", type: 'range', default: 0.8, min: 0.5, max: 1.0, step: 0.1 },
      ],
    },
    {
      id: 'neural-network',
      name: 'Neural Network',
      description: 'Réseau profond pour patterns complexes.',
      category: 'machine_learning',
      icon: <Brain className="h-5 w-5" />,
      recommended: false,
      processingTime: '20-30s',
      accuracy: 89,
      parameters: [
        { key: 'hiddenLayerSize1', label: 'Taille couche 1', type: 'number', default: 64, min: 16, max: 128, step: 8 },
        { key: 'hiddenLayerSize2', label: 'Taille couche 2', type: 'number', default: 32, min: 8, max: 64, step: 8 },
        { key: 'hiddenLayerSize3', label: 'Taille couche 3', type: 'number', default: 16, min: 4, max: 32, step: 4 },
        { key: 'learningRate', label: "Taux d'apprentissage", type: 'number', default: 0.001, min: 0.0001, max: 0.01, step: 0.0001 },
        { key: 'maxIter', label: 'Itérations max', type: 'number', default: 500, min: 100, max: 1000, step: 50 },
        { key: 'alpha', label: 'Régularisation L2', type: 'number', default: 0.001, min: 0.0001, max: 0.01, step: 0.0001 },
      ],
    },
  ];

  /* ===== Helpers UI ===== */
  const handleMethodToggle = (methodId: string) => {
    setSelectedMethods(prev => prev.includes(methodId) ? prev.filter(id => id !== methodId) : [...prev, methodId]);
  };
  const handleParameterChange = (methodId: string, key: string, value: any) => {
    setMethodConfigs(prev => ({ ...prev, [methodId]: { ...(prev[methodId] ?? {}), [key]: value } }));
  };
  const toServiceMethodId = (id: string): string => {
    switch (id) {
      case 'chain-ladder': return 'chain_ladder';
      case 'bornhuetter-ferguson': return 'bornhuetter_ferguson';
      case 'mack': return 'mack_chain_ladder';
      case 'cape-cod': return 'cape_cod';
      case 'random-forest': return 'random_forest';
      case 'gradient-boosting': return 'gradient_boosting';
      case 'neural-network': return 'neural_network';
      case 'stochastic-monte-carlo': return 'stochastic_monte_carlo';
      case 'bayesian-reserving': return 'bayesian_reserving';
      default: return id.replace(/-/g, '_');
    }
  };
  const buildCalculationRequest = (): ServiceCalculationRequest => {
    const serviceMethods = selectedMethods.map(toServiceMethodId);
    const parameters: Record<string, Record<string, unknown>> = {};
    for (const uiId of selectedMethods) parameters[toServiceMethodId(uiId)] = { ...(methodConfigs[uiId] ?? {}) };
    return {
      triangleId: selectedTriangle,
      methods: serviceMethods,
      parameters,
      options: {
        generateConfidenceIntervals: selectedMethods.includes('mack'),
        confidenceLevel: methodConfigs?.mack?.confidenceLevel ?? 0.95,
        runSensitivityAnalysis: false,
        includeStressTests: false,
        exportFormat: 'json',
      },
    };
  };
  const handleLaunchCalculation = async () => {
    if (!selectedTriangle || selectedMethods.length === 0) {
      showError('Sélection incomplète', 'Veuillez sélectionner un triangle et au moins une méthode');
      return;
    }
    setIsLaunching(true);
    try {
      const req = buildCalculationRequest();
      await runCalculation(req);
      success('Calcul lancé avec succès', 'Calcul en cours d’exécution');
      navigate('/calculations');
    } catch {
      showError('Erreur lors du lancement', 'Impossible de lancer le calcul. Veuillez réessayer.');
    } finally {
      setIsLaunching(false);
    }
  };

  const estimatedTime = selectedMethods.reduce((acc, methodId) => {
    const method = calculationMethods.find(m => m.id === methodId);
    if (method?.processingTime.includes('s')) {
      const maxTime = parseInt(method.processingTime.match(/\d+/g)?.pop() || '0', 10);
      return acc + maxTime;
    }
    return acc;
  }, 0);

  // Filtrage méthodes (onglet + recherche)
  const visibleMethods = useMemo(() => {
    let list = calculationMethods;
    if (activeCategory !== 'all') list = list.filter(m => m.category === activeCategory);
    if (q.trim()) {
      const s = q.toLowerCase();
      list = list.filter(m => m.name.toLowerCase().includes(s) || m.description.toLowerCase().includes(s));
    }
    return list;
  }, [activeCategory, q, calculationMethods]);

  const countsByCat = useMemo(() => ({
    deterministic: calculationMethods.filter(m => m.category === 'deterministic').length,
    stochastic: calculationMethods.filter(m => m.category === 'stochastic').length,
    machine_learning: calculationMethods.filter(m => m.category === 'machine_learning').length,
  }), [calculationMethods]);

  const selectRecommended = () => {
    const add = visibleMethods.filter(m => m.recommended).map(m => m.id);
    setSelectedMethods(prev => Array.from(new Set([...prev, ...add])));
  };
  const clearSelection = () => setSelectedMethods([]);

  // === RENDER ===
  return (
    <Layout>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">

        {/* Wizard header */}
        <div className="bg-white rounded-lg shadow mb-6">
          <div className="px-6 py-4 border-b border-gray-200">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
              <div>
                <h1 className="text-2xl font-bold text-gray-900">Lancer des calculs</h1>
                <p className="text-sm text-gray-500">Configurez et lancez des méthodes actuarielles sur vos triangles</p>
              </div>
              <button onClick={() => navigate('/calculations')} className="flex items-center gap-2 px-3 py-2 text-blue-600 hover:text-blue-700">
                <History className="h-4 w-4" />
                Historique des calculs
              </button>
            </div>
          </div>

          <div className="px-6 py-3">
            <ol className="flex flex-wrap items-center gap-4 text-sm">
              <li className={`flex items-center gap-2 ${selectedTriangle ? 'text-green-700' : 'text-gray-600'}`}>
                <span className={`h-6 w-6 rounded-full flex items-center justify-center text-white ${selectedTriangle ? 'bg-green-600' : 'bg-gray-400'}`}>1</span>
                Sélection du triangle
              </li>
              <li className="text-gray-300">›</li>
              <li className={`flex items-center gap-2 ${selectedMethods.length ? 'text-blue-700' : 'text-gray-600'}`}>
                <span className={`h-6 w-6 rounded-full flex items-center justify-center text-white ${selectedMethods.length ? 'bg-blue-600' : 'bg-gray-400'}`}>2</span>
                Choix des méthodes
              </li>
              <li className="text-gray-300">›</li>
              <li className="flex items-center gap-2 text-gray-600">
                <span className="h-6 w-6 rounded-full flex items-center justify-center text-white bg-gray-400">3</span>
                Lancer & suivre
              </li>
            </ol>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Colonne gauche : configuration */}
          <div className="lg:col-span-2 space-y-6">
            {/* Étape 1 : Triangle */}
            <section className="bg-white rounded-lg shadow p-6">
              <h2 className="text-lg font-medium text-gray-900 mb-4">1. Sélectionner le triangle</h2>

              <select
                value={selectedTriangle}
                onChange={e => setSelectedTriangle(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Choisir un triangle...</option>
                {triangles?.map((triangle) => {
                  const dn = getTriangleName(triangle);
                  return (
                    <option key={triangle.id} value={triangle.id}>
                      {dn} — {triangle.type} ({triangle.currency})
                    </option>
                  );
                })}
              </select>

              {selectedTriangle && (
                <div className="mt-4 p-3 rounded-lg bg-blue-50">
                  <div className="flex items-start gap-2 text-sm text-blue-700">
                    <Info className="h-4 w-4 mt-0.5" />
                    <div>
                      <p className="font-medium">Triangle sélectionné</p>
                      <p>{triangles?.find(t => t.id === selectedTriangle) ? getTriangleName(triangles!.find(t => t.id === selectedTriangle)!) : 'Triangle sélectionné'}</p>
                    </div>
                  </div>
                </div>
              )}
            </section>

            {/* Étape 2 : Méthodes */}
            <section className="bg-white rounded-lg shadow p-6">
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-4">
                <h2 className="text-lg font-medium text-gray-900">2. Choisir les méthodes</h2>
                <div className="flex items-center gap-2">
                  <button onClick={() => setShowAdvanced(v => !v)} className="text-sm text-blue-600 hover:text-blue-700 flex items-center gap-1">
                    <Filter className="h-4 w-4" />
                    {showAdvanced ? 'Masquer' : 'Afficher'} les paramètres
                  </button>
                </div>
              </div>

              {/* Segmented tabs + search */}
              <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3 mb-4">
                <div className="flex flex-wrap gap-2">
                  <CategoryTab label="Toutes" active={activeCategory === 'all'} onClick={() => setActiveCategory('all')} />
                  <CategoryTab label={`Déterministes (${countsByCat.deterministic})`} active={activeCategory === 'deterministic'} onClick={() => setActiveCategory('deterministic')} />
                  <CategoryTab label={`Stochastiques (${countsByCat.stochastic})`} active={activeCategory === 'stochastic'} onClick={() => setActiveCategory('stochastic')} />
                  <CategoryTab label={`Machine Learning (${countsByCat.machine_learning})`} active={activeCategory === 'machine_learning'} onClick={() => setActiveCategory('machine_learning')} />
                </div>

                <div className="flex items-center gap-2">
                  <div className="relative">
                    <Search className="h-4 w-4 text-gray-400 absolute left-2 top-1/2 -translate-y-1/2" />
                    <input
                      value={q}
                      onChange={e => setQ(e.target.value)}
                      placeholder="Rechercher une méthode..."
                      className="pl-7 pr-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 w-64"
                    />
                  </div>
                  <span className="text-xs text-gray-500">Sélectionnées: <b>{selectedMethods.length}</b></span>
                </div>
              </div>

              {/* Quick actions */}
              <div className="flex flex-wrap gap-2 mb-4">
                <button
                  onClick={selectRecommended}
                  className="px-3 py-1.5 text-sm rounded-md bg-green-50 text-green-700 border border-green-200 hover:bg-green-100 flex items-center gap-2"
                >
                  <CheckCircle2 className="h-4 w-4" />
                  Sélectionner les recommandées (vue)
                </button>
                <button
                  onClick={clearSelection}
                  className="px-3 py-1.5 text-sm rounded-md bg-red-50 text-red-700 border border-red-200 hover:bg-red-100 flex items-center gap-2"
                >
                  <XCircle className="h-4 w-4" />
                  Tout effacer
                </button>
                <button
                  onClick={() => {
                    const raw = localStorage.getItem('calculation-config');
                    if (!raw) return;
                    try {
                      const cfg = JSON.parse(raw);
                      setSelectedTriangle(cfg.triangle ?? '');
                      setSelectedMethods(cfg.methods ?? []);
                      setMethodConfigs(cfg.parameters ?? {});
                      info('Configuration chargée');
                    } catch {
                      // ignore
                    }
                  }}
                  className="px-3 py-1.5 text-sm rounded-md bg-white border border-gray-300 hover:bg-gray-50 flex items-center gap-2"
                >
                  <ClipboardList className="h-4 w-4" />
                  Charger config
                </button>
                <button
                  onClick={() => {
                    const cfg = { triangle: selectedTriangle, methods: selectedMethods, parameters: methodConfigs };
                    localStorage.setItem('calculation-config', JSON.stringify(cfg));
                    info('Configuration sauvegardée');
                  }}
                  className="px-3 py-1.5 text-sm rounded-md bg-white border border-gray-300 hover:bg-gray-50 flex items-center gap-2"
                >
                  <Save className="h-4 w-4" />
                  Sauvegarder config
                </button>
                <button
                  onClick={() => {
                    setQ('');
                    setActiveCategory('all');
                  }}
                  className="px-3 py-1.5 text-sm rounded-md bg-white border border-gray-300 hover:bg-gray-50 flex items-center gap-2"
                >
                  <RefreshCw className="h-4 w-4" />
                  Réinitialiser vue
                </button>
              </div>

              {/* Méthodes (grille unifiée) */}
              {visibleMethods.length === 0 ? (
                <div className="p-8 text-center text-gray-500 border border-dashed rounded-lg">Aucune méthode ne correspond à la recherche.</div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {visibleMethods.map(method => (
                    <MethodCard
                      key={method.id}
                      method={method}
                      selected={selectedMethods.includes(method.id)}
                      onToggle={() => handleMethodToggle(method.id)}
                      config={methodConfigs[method.id] ?? {}}
                      onConfigChange={(key, value) => handleParameterChange(method.id, key, value)}
                      showAdvanced={showAdvanced}
                    />
                  ))}
                </div>
              )}
            </section>
          </div>

          {/* Colonne droite : résumé */}
          <aside className="lg:col-span-1">
            <div className="bg-white rounded-lg shadow p-6 sticky top-4">
              <h3 className="text-lg font-medium text-gray-900 mb-4">Résumé</h3>

              <div className="space-y-4">
                <div>
                  <p className="text-sm text-gray-500">Triangle</p>
                  <p className="font-medium text-gray-900">
                    {selectedTriangle
                      ? (triangles?.find(t => t.id === selectedTriangle) ? getTriangleName(triangles!.find(t => t.id === selectedTriangle)!) : 'Triangle sélectionné')
                      : 'Non sélectionné'}
                  </p>
                </div>

                <div>
                  <p className="text-sm text-gray-500">Méthodes sélectionnées</p>
                  {selectedMethods.length > 0 ? (
                    <ul className="mt-1 space-y-1">
                      {selectedMethods.map(mid => {
                        const m = calculationMethods.find(x => x.id === mid);
                        return (
                          <li key={mid} className="flex items-center gap-2">
                            {m?.icon}
                            <span className="text-sm font-medium text-gray-900">{m?.name}</span>
                            {m?.recommended && <span className="px-2 py-0.5 text-xs bg-green-100 text-green-700 rounded-full">Reco</span>}
                            {m?.category === 'machine_learning' && <span className="px-2 py-0.5 text-xs bg-orange-100 text-orange-700 rounded-full">ML</span>}
                          </li>
                        );
                      })}
                    </ul>
                  ) : (
                    <p className="text-sm text-gray-400">Aucune méthode sélectionnée</p>
                  )}
                </div>

                <div>
                  <p className="text-sm text-gray-500">Temps estimé</p>
                  <p className="font-medium text-gray-900">{estimatedTime > 0 ? `~${estimatedTime} secondes` : '-'}</p>
                  {selectedMethods.some(id => calculationMethods.find(m => m.id === id)?.category === 'machine_learning') && (
                    <p className="text-xs text-orange-600 mt-1">Les modèles ML peuvent prendre plus de temps selon la taille des données.</p>
                  )}
                </div>

                {recentCalculations?.length > 0 && (
                  <div>
                    <p className="text-sm text-gray-500 mb-2">Calculs récents</p>
                    <div className="space-y-2">
                      {recentCalculations.slice(0, 3).map(calc => (
                        <button
                          key={calc.id}
                          onClick={() => navigate(`/calculations/${calc.id}`)}
                          className="w-full text-left p-2 bg-gray-50 rounded hover:bg-gray-100 transition-colors"
                        >
                          <p className="text-sm font-medium text-gray-900">{calc.triangleName}</p>
                          <p className="text-xs text-gray-500">{new Date(calc.createdAt).toLocaleDateString('fr-FR')}</p>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <div className="pt-4 border-t space-y-2">
                  <button
                    onClick={handleLaunchCalculation}
                    disabled={!selectedTriangle || selectedMethods.length === 0 || isLaunching}
                    className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isLaunching ? (
                      <>
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
                        Lancement...
                      </>
                    ) : (
                      <>
                        <Play className="h-4 w-4" />
                        Lancer le calcul
                      </>
                    )}
                  </button>

                  <button
                    onClick={() => {
                      const cfg = { triangle: selectedTriangle, methods: selectedMethods, parameters: methodConfigs };
                      localStorage.setItem('calculation-config', JSON.stringify(cfg));
                      info('Configuration sauvegardée');
                    }}
                    disabled={!selectedTriangle || selectedMethods.length === 0}
                    className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Save className="h-4 w-4" />
                    Sauvegarder la configuration
                  </button>
                </div>
              </div>
            </div>
          </aside>
        </div>
      </div>
    </Layout>
  );
};

/* ================= Composants ================= */

const CategoryTab: React.FC<{ label: string; active: boolean; onClick: () => void }> = ({ label, active, onClick }) => (
  <button
    onClick={onClick}
    className={`px-3 py-1.5 text-sm rounded-full border transition-all ${
      active ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
    }`}
  >
    {label}
  </button>
);

interface MethodCardProps {
  method: CalculationMethodDef;
  selected: boolean;
  onToggle: () => void;
  config: any;
  onConfigChange: (key: string, value: any) => void;
  showAdvanced: boolean;
}

const MethodCard: React.FC<MethodCardProps> = ({ method, selected, onToggle, config, onConfigChange, showAdvanced }) => {
  const [open, setOpen] = useState(false);
  const showParams = selected && (showAdvanced || open);

  return (
    <div className={`border rounded-lg p-4 transition-all ${selected ? 'border-blue-500 bg-blue-50/40' : 'border-gray-200 hover:border-gray-300'} ${method.category === 'machine_learning' ? 'border-l-4 border-l-orange-400' : ''}`}>
      <div className="flex items-start gap-3">
        <input type="checkbox" checked={selected} onChange={onToggle} className="mt-1 h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded" />

        <div className="flex-1">
          <div className="flex items-start justify-between gap-2">
            <div>
              <div className="flex items-center gap-2">
                {method.icon}
                <h4 className="font-medium text-gray-900">{method.name}</h4>
                {method.recommended && <span className="px-2 py-0.5 text-xs bg-green-100 text-green-700 rounded-full">Recommandé</span>}
                {method.category === 'machine_learning' && <span className="px-2 py-0.5 text-xs bg-orange-100 text-orange-700 rounded-full">ML</span>}
              </div>
              <p className="text-sm text-gray-600 mt-1">{method.description}</p>
              <div className="flex items-center gap-4 mt-2 text-xs text-gray-500">
                <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{method.processingTime}</span>
                <span className="flex items-center gap-1"><TrendingUp className="h-3 w-3" />Précision: {method.accuracy}%</span>
              </div>
            </div>

            <div className="flex flex-col items-end gap-2">
              <button
                onClick={() => setOpen(v => !v)}
                className={`px-2 py-1 text-xs rounded-md border flex items-center gap-1 ${showParams ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'}`}
                aria-expanded={showParams}
              >
                {showParams ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                Configurer
              </button>
            </div>
          </div>

          {/* Paramètres */}
          {showParams && method.parameters.length > 0 && (
            <div className="mt-4 space-y-3 pt-4 border-t border-gray-200">
              {method.parameters.map(param => (
                <div key={param.key}>
                  <label className="flex items-center justify-between text-sm">
                    <span className="text-gray-700">
                      {param.label}
                      {param.tooltip && (
                        // ⚠️ Pas de title sur l'icône Lucide : on met le title sur un conteneur
                        <span className="inline-block ml-1 align-middle" title={param.tooltip} aria-label={param.tooltip}>
                          <Info className="h-3 w-3 text-gray-400" />
                        </span>
                      )}
                    </span>
                  </label>

                  {param.type === 'number' && (
                    <input
                      type="number"
                      value={config?.[param.key] ?? param.default}
                      onChange={(e) => onConfigChange(param.key, parseFloat(e.target.value))}
                      min={param.min}
                      max={param.max}
                      step={param.step}
                      className="mt-1 w-full px-3 py-1 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                  )}

                  {param.type === 'select' && (
                    <select
                      value={config?.[param.key] ?? param.default}
                      onChange={(e) => onConfigChange(param.key, e.target.value)}
                      className="mt-1 w-full px-3 py-1 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500"
                    >
                      {param.options?.map(opt => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                      ))}
                    </select>
                  )}

                  {param.type === 'boolean' && (
                    <input
                      type="checkbox"
                      checked={Boolean(config?.[param.key] ?? param.default)}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => onConfigChange(param.key, e.currentTarget.checked)}
                      className="mt-1 h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                    />
                  )}

                  {param.type === 'range' && (
                    <div className="mt-1 flex items-center gap-2">
                      <input
                        type="range"
                        value={config?.[param.key] ?? param.default}
                        onChange={(e) => onConfigChange(param.key, parseFloat(e.target.value))}
                        min={param.min}
                        max={param.max}
                        step={param.step}
                        className="flex-1"
                      />
                      <span className="text-sm text-gray-600 w-12 text-right">{config?.[param.key] ?? param.default}</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Calculations;
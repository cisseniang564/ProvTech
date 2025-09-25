import React, { useState } from 'react';
import { Shield, Smartphone, Copy, ArrowLeft } from 'lucide-react';

const Migration2FA = () => {
  const [step, setStep] = useState('password'); // 'password', 'qr', 'verify'
  const [loading, setLoading] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [qrData, setQrData] = useState(null);
  const [verifyCode, setVerifyCode] = useState('');

  const handlePasswordSubmit = async () => {
    setLoading(true);
    // Simuler la configuration 2FA
    setTimeout(() => {
      setQrData({
        qrCode: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==',
        secret: 'JBSWY3DPEHPK3PXP'
      });
      setStep('qr');
      setLoading(false);
    }, 1000);
  };

  const handleVerifySubmit = async () => {
    setLoading(true);
    setTimeout(() => {
      console.log('2FA activé avec succès');
      setLoading(false);
      // Redirection vers dashboard
    }, 1000);
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center py-12 px-4">
      <div className="max-w-md w-full">
        <div className="bg-white rounded-xl shadow-lg p-8">
          {/* Header */}
          <div className="text-center mb-8">
            <div className="bg-blue-100 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
              <Shield className="w-8 h-8 text-blue-600" />
            </div>
            <h1 className="text-2xl font-bold text-gray-900 mb-2">
              Configuration 2FA
            </h1>
            <p className="text-gray-600">
              Sécurisez votre compte avec l'authentification à deux facteurs
            </p>
          </div>

          {/* Navigation */}
          <div className="flex items-center justify-between mb-8">
            <button
              onClick={() => window.history.back()}
              className="flex items-center text-gray-500 hover:text-gray-700"
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Retour
            </button>
            <div className="text-sm text-gray-500">
              Étape {step === 'password' ? '1' : step === 'qr' ? '2' : '3'} sur 3
            </div>
          </div>

          {/* Étape 1: Mot de passe */}
          {step === 'password' && (
            <div className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Confirmez votre mot de passe actuel
                </label>
                <input
                  type="password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="Mot de passe actuel"
                />
              </div>
              <button
                onClick={handlePasswordSubmit}
                disabled={loading || !currentPassword}
                className="w-full bg-blue-600 text-white py-3 px-4 rounded-lg font-semibold hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? 'Vérification...' : 'Continuer'}
              </button>
            </div>
          )}

          {/* Étape 2: QR Code */}
          {step === 'qr' && qrData && (
            <div className="space-y-6">
              <div className="text-center">
                <p className="text-sm font-medium text-gray-700 mb-4">
                  Scannez ce QR code avec votre application d'authentification
                </p>
                <div className="bg-white p-4 rounded-lg border inline-block">
                  <div className="w-48 h-48 bg-gray-100 flex items-center justify-center">
                    <span className="text-gray-400">QR Code 2FA</span>
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Ou saisissez manuellement :
                </label>
                <div className="flex items-center bg-gray-50 rounded-lg p-3">
                  <code className="flex-1 text-sm font-mono text-gray-800">
                    {qrData.secret}
                  </code>
                  <button
                    onClick={() => navigator.clipboard.writeText(qrData.secret)}
                    className="ml-2 p-2 text-gray-400 hover:text-gray-600 rounded"
                  >
                    <Copy className="w-4 h-4" />
                  </button>
                </div>
              </div>

              <button
                onClick={() => setStep('verify')}
                className="w-full bg-blue-600 text-white py-3 px-4 rounded-lg font-semibold hover:bg-blue-700"
              >
                J'ai configuré mon app
              </button>
            </div>
          )}

          {/* Étape 3: Vérification */}
          {step === 'verify' && (
            <div className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Code de vérification
                </label>
                <div className="flex items-center">
                  <Smartphone className="w-5 h-5 text-gray-400 mr-3" />
                  <input
                    type="text"
                    maxLength={6}
                    value={verifyCode}
                    onChange={(e) => setVerifyCode(e.target.value.replace(/\D/g, ''))}
                    className="flex-1 px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-center text-xl tracking-wider"
                    placeholder="123456"
                  />
                </div>
                <p className="text-sm text-gray-500 mt-2">
                  Saisissez le code généré par votre application
                </p>
              </div>

              <div className="flex space-x-3">
                <button
                  onClick={() => setStep('qr')}
                  className="flex-1 bg-gray-200 text-gray-800 py-3 px-4 rounded-lg font-semibold hover:bg-gray-300"
                >
                  Retour
                </button>
                <button
                  onClick={handleVerifySubmit}
                  disabled={loading || verifyCode.length !== 6}
                  className="flex-1 bg-blue-600 text-white py-3 px-4 rounded-lg font-semibold hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loading ? 'Activation...' : 'Activer 2FA'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Migration2FA;
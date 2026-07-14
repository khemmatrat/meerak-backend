import React, { useEffect, useState } from 'react';
import { Certificate } from '../types';
import { certificateService } from '../services/certificateService';
import { useAuth } from '../context/AuthContext';

/**
 * Display and manage user certificates
 */
export default function CertificateView() {
  const { user } = useAuth();
  const [certs, setCerts] = useState<Certificate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user?.id) return;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const c = await certificateService.getCertificates(user.id);
        setCerts(c);
      } catch (err: any) {
        setError(err?.message ?? 'Failed to load certificates');
      } finally {
        setLoading(false);
      }
    })();
  }, [user?.id]);

  const handleDownload = async (cert: Certificate) => {
    try {
      const filename = `${cert.courseName.replace(/\s+/g, '_')}_${new Date(cert.issuedAt).getFullYear()}.pdf`;
      if (cert.pdfUrl) {
        await certificateService.downloadCertificatePDF(cert.pdfUrl, filename);
      }
    } catch (err: any) {
      setError(err?.message);
    }
  };

  const handleDelete = async (certId: string) => {
    if (!window.confirm('Delete this certificate?')) return;
    if (!user?.id) return;
    try {
      await certificateService.deleteCertificate(user.id, certId);
      setCerts((prev) => prev.filter((c) => c.id !== certId));
    } catch (err: any) {
      setError(err?.message);
    }
  };

  if (loading) return <div className="text-gray-600">Loading certificates...</div>;

  return (
    <div className="p-4">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-lg font-semibold">My Certificates</h3>
        <span className="text-sm text-gray-600">{certs.length} certificate(s)</span>
      </div>

      {error && <div className="text-red-600 mb-3 p-2 bg-red-50 rounded">{error}</div>}

      {certs.length === 0 ? (
        <p className="text-gray-600 text-center py-8">No certificates yet. Complete courses to earn certificates! 🎯</p>
      ) : (
        <div className="grid gap-4">
          {certs.map((cert) => (
            <div key={cert.id} className="p-4 border rounded-lg bg-gradient-to-r from-yellow-50 to-amber-50 shadow-sm hover:shadow-md transition">
              <div className="flex justify-between items-start">
                <div className="flex-1">
                  <div className="font-bold text-lg text-gray-800">{cert.courseName}</div>
                  <div className="text-sm text-gray-600 mt-1">Issued: {new Date(cert.issuedAt).toLocaleDateString('th-TH')}</div>
                  {cert.expiresAt && <div className="text-xs text-gray-500 mt-1">Expires: {new Date(cert.expiresAt).toLocaleDateString('th-TH')}</div>}
                  {cert.badge && <div className="text-2xl mt-2">{cert.badge === 'star' ? '⭐' : '🏆'}</div>}
                </div>
                <div className="flex space-x-2">
                  {cert.pdfUrl && (
                    <button
                      onClick={() => handleDownload(cert)}
                      className="px-3 py-1 bg-blue-600 text-white text-sm rounded hover:bg-blue-700"
                    >
                      Download
                    </button>
                  )}
                  <button onClick={() => handleDelete(cert.id)} className="px-3 py-1 bg-red-100 text-red-600 text-sm rounded hover:bg-red-200">
                    Delete
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
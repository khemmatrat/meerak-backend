/**
 * Certificate service: generate PDF certificates, upload to Firebase Storage, manage certificates
 * Dependencies: jspdf, html2canvas
 */
import { Certificate } from '../types';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';

const STORAGE_KEY_PREFIX = 'certificates_v1';

function storageKey(userId: string) {
  return `${STORAGE_KEY_PREFIX}:${userId}`;
}

/**
 * Generate certificate HTML template
 */
function generateCertificateHTML(userId: string, courseName: string, score: number, issuedDate: string): string {
  const dateObj = new Date(issuedDate);
  const formattedDate = dateObj.toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' });

  return `
    <div id="certificate-template" style="
      width: 800px;
      height: 600px;
      margin: 0;
      padding: 40px;
      text-align: center;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      font-family: Georgia, serif;
      box-sizing: border-box;
      display: flex;
      flex-direction: column;
      justify-content: center;
      align-items: center;
    ">
      <div style="border: 3px solid white; padding: 30px; border-radius: 10px; max-width: 700px;">
        <h1 style="margin: 0 0 20px 0; font-size: 48px;">Certificate of Completion</h1>
        
        <p style="margin: 20px 0; font-size: 16px;">This is to certify that</p>
        
        <h2 style="margin: 20px 0; font-size: 32px; font-weight: bold; text-decoration: underline;">
          ${userId}
        </h2>
        
        <p style="margin: 20px 0; font-size: 16px;">has successfully completed the course</p>
        
        <h3 style="margin: 20px 0; font-size: 28px; font-weight: bold;">
          ${courseName}
        </h3>
        
        <p style="margin: 20px 0; font-size: 14px;">with a score of <strong>${score}%</strong></p>
        
        <p style="margin: 40px 0 20px 0; font-size: 14px;">
          Issued on <strong>${formattedDate}</strong>
        </p>
        
        <div style="margin-top: 40px; font-size: 48px;">⭐</div>
      </div>
    </div>
  `;
}

export const certificateService = {
  /**
   * Generate certificate as PDF using html2canvas + jsPDF
   */
  async generateCertificatePDF(
    userId: string,
    courseId: string,
    courseName: string,
    score: number,
    issuedAt: string
  ): Promise<{ dataUrl: string; filename: string }> {
    try {
      // Create temporary container
      const container = document.createElement('div');
      container.innerHTML = generateCertificateHTML(userId, courseName, score, issuedAt);
      container.style.position = 'fixed';
      container.style.left = '-9999px';
      document.body.appendChild(container);

      // Convert HTML to canvas
      const canvas = await html2canvas(container, {
        scale: 2,
        useCORS: true,
        allowTaint: true,
      });

      // Clean up
      document.body.removeChild(container);

      // Convert canvas to PDF
      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF({
        orientation: 'landscape',
        unit: 'mm',
        format: 'a4',
      });

      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = pdf.internal.pageSize.getHeight();
      pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);

      const filename = `Certificate_${userId}_${courseId}_${Date.now()}.pdf`;
      return {
        dataUrl: pdf.output('datauristring'),
        filename,
      };
    } catch (err) {
      console.error('generateCertificatePDF error', err);
      throw err;
    }
  },

  /**
   * Create certificate record and optionally upload to Firebase Storage
   */
 // ...existing code...
  /**
   * Create certificate record and optionally upload to Firebase Storage
   */
  async createCertificate(
    userId: string,
    courseId: string,
    courseName: string,
    score: number
  ): Promise<Certificate> {
    try {
      const issuedAt = new Date().toISOString();

      // Generate PDF
      const { dataUrl, filename } = await this.generateCertificatePDF(userId, courseId, courseName, score, issuedAt);

      // In production: upload to Firebase Storage
      // const pdfUrl = await uploadToFirebaseStorage(dataUrl, filename);
      const pdfUrl = dataUrl; // mock: use data URL for now
      const certificateUrl = pdfUrl; // keep both names for backward compatibility

      // Try to read user name from localStorage (seed/data provides 'app_user')
      let userName: string | undefined = undefined;
      try {
        const raw = localStorage.getItem('app_user');
        if (raw) {
          const u = JSON.parse(raw);
          userName = u?.name || u?.email || undefined;
        }
      } catch {
        userName = undefined;
      }

      const cert: Certificate = {
        id: `cert-${Date.now()}`,
        userId,
        userName: userName ?? userId,
        courseId,
        courseName,
        issuedAt,
        // keep fields used across UI
        expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(), // 1 year
        certificateUrl,
        pdfUrl,
        badge: 'star',
      };

      // Save to localStorage
      await this.saveCertificate(userId, cert);
      return cert;
    } catch (err) {
      console.error('createCertificate error', err);
      throw err;
    }
  },
// ...existing code...
  async getCertificates(userId: string): Promise<Certificate[]> {
    try {
      const raw = localStorage.getItem(storageKey(userId));
      return raw ? (JSON.parse(raw) as Certificate[]) : [];
    } catch (err) {
      console.error('getCertificates error', err);
      return [];
    }
  },

  async saveCertificate(userId: string, cert: Certificate): Promise<boolean> {
    try {
      const certs = await this.getCertificates(userId);
      const exists = certs.findIndex((c) => c.id === cert.id);
      if (exists === -1) {
        certs.push(cert);
      } else {
        certs[exists] = cert;
      }
      localStorage.setItem(storageKey(userId), JSON.stringify(certs));
      return true;
    } catch (err) {
      console.error('saveCertificate error', err);
      throw err;
    }
  },

  async downloadCertificatePDF(pdfUrl: string, filename: string): Promise<void> {
    try {
      const link = document.createElement('a');
      link.href = pdfUrl;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (err) {
      console.error('downloadCertificatePDF error', err);
      throw err;
    }
  },

  async deleteCertificate(userId: string, certId: string): Promise<boolean> {
    try {
      const certs = await this.getCertificates(userId);
      const filtered = certs.filter((c) => c.id !== certId);
      localStorage.setItem(storageKey(userId), JSON.stringify(filtered));
      return true;
    } catch (err) {
      console.error('deleteCertificate error', err);
      throw err;
    }
  },
};
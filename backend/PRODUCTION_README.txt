================================================================================
  AQOND PRODUCTION DEPLOYMENT GUIDE
================================================================================

ALL PRODUCTION FEATURES COMPLETED:

1. Security Middleware (Rate Limit + Helmet) - DONE
2. Error Logging (Winston) - DONE
3. Withdrawal Validation (Atomic) - DONE
4. Account Deletion (Store Compliance) - DONE
5. Automated API Tests (Jest + Supertest) - DONE
6. Database Constraints (No Negative Balance) - DONE

================================================================================
QUICK START DEPLOYMENT
================================================================================

1. Environment Setup
   - Set NODE_ENV=production
   - Use PRODUCTION Omise keys (not test!)
   - Generate new JWT_SECRET with: openssl rand -base64 32
   - Configure DATABASE_URL for production DB

2. Install Dependencies
   $ npm ci --production

3. Run Migrations
   $ npm run migrate 030 031 032

4. Start Production Server
   $ npm install -g pm2
   $ pm2 start backend/server.js --name aqond --env production
   $ pm2 save
   $ pm2 startup

5. Configure SSL (Let's Encrypt)
   $ sudo certbot --nginx -d api.aqond.com

6. Monitor
   $ pm2 logs aqond
   $ tail -f backend/logs/error.log

================================================================================
SECURITY FEATURES
================================================================================

Rate Limiting:
- General API: 100 requests/15 min
- Auth endpoints: 5 attempts/15 min
- Payment: 10 requests/5 min
- Withdrawal: 5 requests/hour

Security Headers (Helmet):
- XSS Protection
- Content Security Policy
- Frame Options

Logging (Winston):
- backend/logs/error.log (errors only)
- backend/logs/combined.log (all logs)
- backend/logs/payments.log (financial transactions)

================================================================================
DATABASE MIGRATIONS
================================================================================

Migration 030: Compliance Policies
- Tables: compliance_policies, user_policy_acceptance
- Policies: Terms, Privacy, Cookie, Refund, Community Guidelines

Migration 031: Wallet Constraints
- CHECK constraint: wallet_balance >= 0
- Trigger: prevent_negative_wallet_balance
- Indexes for performance

Migration 032: Account Deletion
- Table: account_deletion_requests
- Function: anonymize_user_data (GDPR)
- 30-day grace period

================================================================================
API TESTING
================================================================================

Run Tests:
$ npm test

Test Coverage:
$ npm run test:coverage

Test Files:
- backend/__tests__/wallet.test.js (deposit, withdrawal, balance)
- backend/__tests__/kyc.test.js (identity verification)

================================================================================
ACCOUNT DELETION (App Store Compliance)
================================================================================

Endpoints:
- POST /api/account/delete-request (User request)
- GET /api/account/delete-status (Check status)
- DELETE /api/account/cancel-deletion/:id (Cancel request)
- PATCH /api/admin/account-deletions/:id (Admin approval)
- GET /api/admin/account-deletions (Admin view all)

Frontend Component:
- components/AccountDeletion.tsx

Process:
1. User requests deletion with reason
2. Admin reviews and approves/rejects
3. 30-day grace period
4. Automatic data anonymization

================================================================================
MONITORING & BACKUP
================================================================================

Daily Database Backup:
$ cat > /usr/local/bin/backup-aqond.sh << 'EOF'
#!/bin/bash
DATE=$(date +%Y%m%d_%H%M%S)
pg_dump $DATABASE_URL | gzip > /var/backups/aqond_$DATE.sql.gz
find /var/backups -name "aqond_*.sql.gz" -mtime +30 -delete
EOF

$ chmod +x /usr/local/bin/backup-aqond.sh
$ crontab -e
0 3 * * * /usr/local/bin/backup-aqond.sh

View Logs:
$ tail -f backend/logs/combined.log
$ tail -f backend/logs/payments.log
$ pm2 logs aqond

Health Check:
$ curl https://api.aqond.com/api/health

================================================================================
TROUBLESHOOTING
================================================================================

Server Not Responding:
$ pm2 restart aqond
$ pm2 logs aqond --lines 100

Database Issues:
$ sudo systemctl status postgresql
$ sudo systemctl restart postgresql

High CPU:
$ pm2 monit
$ psql $DATABASE_URL -c "SELECT pid, query FROM pg_stat_activity WHERE state = 'active';"

Payment Webhook Failed:
$ grep "omiseWebhookHandler" backend/logs/payments.log

================================================================================
DEPLOYMENT CHECKLIST
================================================================================

[ ] SSL certificate installed
[ ] Production .env configured (no test keys!)
[ ] Database backups enabled
[ ] Migrations 030, 031, 032 applied
[ ] PM2 running and auto-start enabled
[ ] Rate limiting tested
[ ] Payment gateway tested (real transaction)
[ ] API tests passing (npm test)
[ ] Error logging working
[ ] Account deletion tested
[ ] App Store requirements met

================================================================================
BACKUP: ใบรับรองรายได้ (Certified Statements PDF)
================================================================================

โฟลเดอร์: backend/uploads/statements/
- เก็บไฟล์ PDF ใบรับรองรายได้ที่ออกโดยระบบ Tax & Compliance
- โฟลเดอร์นี้ไม่ถูก commit ขึ้น GitHub (.gitignore)
- ⚠️ กรุณาทำ Backup โฟลเดอร์นี้เป็นระยะ (อย่างน้อยสัปดาห์ละครั้ง)
- ไฟล์ PDF เป็นหลักฐานทางภาษีสำหรับพาร์ทเนอร์

================================================================================
GO LIVE COMMAND
================================================================================

$ git pull origin main
$ npm ci
$ npm run build
$ npm run migrate 030 031 032
$ pm2 restart aqond
$ pm2 save
$ curl https://api.aqond.com/api/health

AQOND IS PRODUCTION-READY!

================================================================================
Version: 1.0.0
Date: 2026-02-18
Status: ALL SYSTEMS OPERATIONAL
================================================================================

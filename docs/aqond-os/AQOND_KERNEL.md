# AQOND Kernel (target architecture)

Central hub — every product connects here:

```
AQOND Kernel
├── Identity
├── Wallet
├── Pay
├── Event Bus
├── Analytics
├── Experience Engine  ← Sprint 30
├── AI Director
├── Jarvis (AI OS)
├── Notification
├── Feature Flag
├── Permissions
├── Audit
└── API Gateway
```

**Sprint 30a:** Experience Engine stubs in `backend/lib/experience/`.  
Kernel is **documented target** — incremental extraction, not big-bang rewrite.

## Experience Engine modules (30a stubs)

| Module | File | Role |
|--------|------|------|
| Orchestrator | experienceEngine.js | getSnapshot, layers |
| Intent | intentEngine.js | Primary / Secondary / Hidden |
| Lifecycle | lifecycleEngine.js | Visitor → Enterprise |
| Personalization | personalizationEngine.js | Home module order |
| AI Memory | aiMemoryEngine.js | context_json extension |
| Recommendation | recommendationEngine.js | Delegates to recsys |
| Growth | growthDecisionEngine.js | Wraps growthEngine |
| Feature gate | featureGateEngine.js | AIVOS_EXPERIENCE_* flags |

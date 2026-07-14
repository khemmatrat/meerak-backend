/**
 * Registration evolution — Phase 0 safety baseline (single import surface)
 */

export {
  getRegistrationEvolutionFeatureFlags,
  isAnySignupEvolutionFeatureEnabled,
  parseEnvBoolean,
} from './featureFlags.js';
export { getRegistrationEvolutionConfig } from './config.js';
export {
  REGISTRATION_METRICS_EVENT_V1,
  SIGNUP_EVOLUTION_METRICS_EVENT,
  SIGNUP_EVOLUTION_METRICS_SCHEMA,
  logSignupEvolutionMetric,
  SHADOW_COMPARISON_METRICS_EVENT,
  SHADOW_COMPARISON_METRICS_SCHEMA,
  logShadowComparisonMetric,
  SHADOW_SNAPSHOT_METRICS_EVENT,
  SHADOW_SNAPSHOT_METRICS_SCHEMA,
  logShadowSnapshotMetric,
} from './metrics.js';
export { buildSignupTrafficTags, uaIndicatesEmbeddedSocialWebView } from './trafficContext.js';
export {
  orchestrateSignupEntry,
  logSignupOrchestrationDecision,
  respondSignupV2DarkInternalProbe,
  signupRegisterEntryOrchestration,
  SIGNUP_ORCHESTRATION_EVENT,
  SIGNUP_ORCHESTRATION_SCHEMA,
} from './signupOrchestrator.js';
export { mountSignupIntentRoutes } from './signupIntentRoutes.js';
export {
  signupIntentHttpCreate,
  signupIntentHttpStatus,
  lazyExpireSignupIntentIfNeeded,
  transitionSignupIntentState,
} from './signupIntentService.js';
export {
  SIGNUP_INTENT_STATES,
  SIGNUP_INTENT_ALLOWED_TRANSITIONS,
  isTransitionAllowed,
  getSignupIntentTtlMinutesResolved,
  SIGNUP_INTENT_TRANSITION_EVENT,
  SIGNUP_FLOW_VERSION,
  getIntentExpirationSweeperBatchSize,
  getIntentExpirationSweeperIntervalMs,
} from './signupIntentConstants.js';
export { signIntentAccessToken, verifyIntentAccessToken, isSignedTokenModeActive } from './signupIntentTokens.js';
export { startIntentExpirationSweeper, stopIntentExpirationSweeper, runExpirationSweepOnce } from './signupIntentSweeper.js';
export { emitIntentMetric, getIntentMetricsSnapshot, getIntentMetricsFromDb, getIntentEventMetricsFromDb } from './signupIntentMetrics.js';

export {
  runSignupShadowExecution,
  runSignupShadowExecutionSafe,
  isShadowExecutionActive,
  compareShadowExecutionResult,
  DRIFT_CATEGORIES,
  SHADOW_COMPARISON_VERSION,
  shouldPersistShadowSnapshot,
  persistShadowComparisonSnapshot,
} from './shadowExecution.js';

export {
  SIGNUP_JOB_TYPES,
  SIGNUP_JOB_PRIORITIES,
  SIGNUP_JOB_ENVELOPE_VERSION,
  createSignupJobEnvelope,
  validateSignupJobEnvelope,
  serializeSignupJobEnvelope,
  deserializeSignupJobEnvelope,
} from './jobEnvelope.js';

export {
  SIGNUP_QUEUE_ADAPTER_VERSION,
  SIGNUP_QUEUE_BACKENDS,
  enqueueSignupJob,
  getSignupQueueSnapshot,
  getAllSignupQueueSnapshots,
  clearSignupQueue,
} from './queueAdapter.js';

export {
  SIGNUP_DISPATCH_CONTRACT_VERSION,
  SIGNUP_DISPATCH_STATES,
  SIGNUP_DISPATCH_FAILURE_REASONS,
  createDispatchReceipt,
  isValidDispatchState,
  isTerminalDispatchState,
  transitionDispatchReceipt,
} from './dispatchContract.js';

export {
  SIGNUP_RETRY_POLICY_VERSION,
  SIGNUP_RETRY_STRATEGIES,
  SIGNUP_RETRYABLE_FAILURES,
  createRetryPolicy,
  shouldRetryDispatch,
  calculateRetryDelayMs,
} from './retryPolicy.js';

export {
  SIGNUP_CONSUMER_CONTRACT_VERSION,
  SIGNUP_CONSUMER_STATES,
  SIGNUP_CONSUMER_FAILURE_REASONS,
  createConsumerLease,
  isValidConsumerState,
  isTerminalConsumerState,
  transitionConsumerLease,
  isLeaseExpired,
  computeLeaseRemainingMs,
} from './consumerContract.js';

export {
  SIGNUP_DEAD_LETTER_VERSION,
  SIGNUP_DEAD_LETTER_REASONS,
  SIGNUP_DEAD_LETTER_STATES,
  createDeadLetterRecord,
  isValidDeadLetterState,
  isTerminalDeadLetterState,
  transitionDeadLetterState,
  shouldDeadLetterDispatch,
} from './deadLetterContract.js';

export {
  SIGNUP_EXECUTION_RESULT_VERSION,
  SIGNUP_EXECUTION_RESULT_STATES,
  SIGNUP_EXECUTION_ERROR_KINDS,
  createExecutionResult,
  isValidExecutionResultState,
  isTerminalExecutionResultState,
  transitionExecutionResult,
  deriveExecutionResultState,
  computeExecutionDurationMs,
} from './executionResultContract.js';

export {
  SIGNUP_RUNTIME_ORCHESTRATOR_VERSION,
  SIGNUP_RUNTIME_STATES,
  SIGNUP_RUNTIME_FAILURE_REASONS,
  createRuntimeCoordinator,
  transitionRuntimeCoordinator,
  isValidRuntimeState,
  isTerminalRuntimeState,
  deriveRuntimeState,
} from './runtimeOrchestratorContract.js';

export {
  SIGNUP_RUNTIME_REGISTRY_VERSION,
  getSignupRuntimeRegistry,
  registerSignupRuntime,
  getSignupRuntime,
  listSignupRuntimes,
  removeSignupRuntime,
  clearSignupRuntimeRegistry,
} from './runtimeRegistry.js';

export {
  SIGNUP_RUNTIME_BOOTSTRAP_VERSION,
  bootstrapSignupRuntime,
  shutdownSignupRuntime,
  getSignupRuntimeHealth,
} from './runtimeBootstrap.js';

export {
  SIGNUP_PASSIVE_DISPATCH_RUNTIME_VERSION,
  inspectPassiveDispatchCycle,
  derivePassiveDispatchSnapshot,
  createPassiveDispatchArtifacts,
} from './passiveDispatchRuntime.js';

export {
  SIGNUP_QUEUE_RESERVATION_RUNTIME_VERSION,
  reserveSignupQueueEnvelope,
  releaseSignupQueueReservation,
  listSignupQueueReservations,
  getSignupQueueReservation,
  inspectReservedQueueState,
} from './queueReservationRuntime.js';

export {
  SIGNUP_PASSIVE_ACK_RUNTIME_VERSION,
  inspectPassiveAcknowledgements,
  createPassiveAcknowledgementArtifacts,
  acknowledgePassiveReservation,
} from './passiveAcknowledgeRuntime.js';

export {
  SIGNUP_PASSIVE_REPLAY_RUNTIME_VERSION,
  SIGNUP_REPLAY_RECOVERY_REASONS,
  inspectPassiveReplayRecovery,
  deriveReplayRecoveryArtifacts,
  evaluateReplayEligibility,
} from './passiveReplayRecoveryRuntime.js';

export {
  SIGNUP_PASSIVE_RETRY_RUNTIME_VERSION,
  SIGNUP_RETRY_ORCHESTRATION_REASONS,
  inspectPassiveRetryOrchestration,
  deriveRetryOrchestrationArtifacts,
  evaluatePassiveRetryDecision,
} from './passiveRetryOrchestrator.js';

export {
  SIGNUP_PASSIVE_DLQ_RUNTIME_VERSION,
  SIGNUP_DLQ_ROUTING_REASONS,
  inspectPassiveDeadLetterRouting,
  deriveDeadLetterRoutingArtifacts,
  evaluatePassiveDeadLetterDecision,
} from './passiveDeadLetterRouter.js';

export {
  SIGNUP_ACTIVE_DISPATCH_RUNTIME_VERSION,
  executeActiveDispatchCycle,
  executeSingleActiveEnvelope,
  deriveActiveExecutionArtifacts,
  isActiveDispatchRuntimeEnabled,
} from './activeDispatchRuntime.js';

export {
  SIGNUP_EXECUTION_COMMIT_COORDINATOR_VERSION,
  commitExecutionArtifacts,
  deriveCommitDecision,
  inspectCommittedExecutions,
  isExecutionCommitEligible,
} from './executionCommitCoordinator.js';

export {
  SIGNUP_RUNTIME_LIFECYCLE_COORDINATOR_VERSION,
  advanceRuntimeLifecycle,
  deriveLifecycleAdvancement,
  inspectLifecycleAdvancements,
  isLifecycleAdvanceEligible,
} from './runtimeLifecycleCoordinator.js';

export {
  SIGNUP_EXECUTION_WINDOW_COORDINATOR_VERSION,
  createExecutionWindow,
  executeWindowCycle,
  inspectExecutionWindows,
  closeExecutionWindow,
  isExecutionWindowEligible,
} from './executionWindowCoordinator.js';

export {
  SIGNUP_EXECUTION_JOURNAL_VERSION,
  SIGNUP_JOURNAL_EVENT_TYPES,
  appendExecutionJournalEntry,
  inspectExecutionJournal,
  deriveExecutionTimeline,
  isJournalReplayable,
  clearExecutionJournal,
} from './executionJournal.js';

export {
  replayExecutionJournal,
  replayEnvelopeState,
  validateReplayIntegrity,
  buildExecutionStateMachine,
  compareReplayStates,
} from './executionReplayEngine.js';

export {
  EXECUTION_STATE_MACHINE_VERSION,
  EXECUTION_LIFECYCLE_STATES,
  getAllowedTransitions,
  getTerminalStates,
  isTerminalState,
  validateTransition,
  validateStatePath,
  getSuccessorStates,
  detectCyclesFrom,
} from './executionStateMachine.js';

export {
  dispatchExecution,
  evaluateDispatchEligibility,
  buildDispatchPlan,
  classifyExecutionOutcome,
  isDispatchSafe,
} from './executionDispatcher.js';

export {
  executeDispatchPlan,
  runControlledExecution,
  applyExecutionStep,
  validateExecutionPermission,
  emitExecutionResult,
} from './executionRuntime.js';

export {
  generateExecutionFingerprint,
  isExecutionAlreadyProcessed,
  registerExecutionFingerprint,
  validateExecutionFencing,
  clearExecutionFence,
} from './executionFencing.js';

export {
  createExecutionScope,
  resolveScopeKey,
  isScopeValid,
  compareScopes,
  getScopeHierarchy,
} from './executionScope.js';

export {
  registerRuntimeInstance,
  getActiveRuntimes,
  assignScopeToRuntime,
  getRuntimeForScope,
  resolveExecutionOwnership,
  clearCoordinationState,
} from './multiRuntimeCoordinator.js';

export {
  validateKernelIntegrity,
  generateReadinessReport,
  freezeKernel,
  validatePhaseBoundaries,
  getKernelSummary,
} from './kernelFinalizer.js';

export {
  registerNode,
  getActiveNodes,
  assignScopeToNode,
  getNodeForScope,
  validatePartitionConsistency,
  clearNodeRegistry,
} from './executionPartitioner.js';

export {
  resolveExecutionRoute,
  buildRoutingTable,
  validateRoutingDecision,
  simulateRouting,
  getRoutingStats,
} from './executionRouter.js';

export {
  computeDistributedDispatch,
  validateDispatchConsensus,
  simulateClusterDispatch,
  detectDispatchDrift,
  buildConsensusKey,
} from './distributedDispatcherSync.js';

export {
  replayWithConsistencyCheck,
  normalizeReplayInput,
  detectReplayDrift,
  buildReplayFingerprint,
  validateReplayDeterminism,
} from './crossNodeReplayConsistency.js';

export {
  computeCanonicalState,
  detectStateConflicts,
  resolveStateConflict,
  buildConvergencePlan,
  validateConvergence,
} from './executionConvergence.js';

export {
  computeStabilizationVector,
  detectSystemDrift,
  computeConvergencePressure,
  simulateStabilizationStep,
  validateMeshStability,
} from './eventualConsistencyMesh.js';

export {
  evaluateExecutionGate,
  validateExecutionEligibility,
  classifyExecutionRisk,
  buildExecutionGateReport,
  isExecutionAllowed,
} from './executionGateway.js';

export {
  executeThroughGateway,
  simulateExecutionFlow,
  buildExecutionTrace,
  validateExecutionBridge,
  isBridgeExecutionAllowed,
} from './executionRuntimeBridge.js';

export {
  getExecutionMode,
  evaluateModeFromRisk,
  isRealExecutionAllowed,
  buildModeExecutionPolicy,
  validateExecutionMode,
} from './executionModes.js';

export {
  applyExecutionMode,
  determineExecutionDepth,
  shouldCommitExecution,
  buildModeExecutionPlan,
  validateModeExecution,
} from './executionModeController.js';

export {
  activateControlledExecution,
  executeGovernedStep,
  buildActivationPipeline,
  validateActivationEligibility,
  isExecutionActivated,
} from './executionActivationEngine.js';

export {
  createExecutionLifecycle,
  transitionExecutionLifecycle,
  getExecutionLifecycleState,
  finalizeExecutionLifecycle,
  validateLifecycleIntegrity,
} from './executionLifecycleBoundary.js';

export {
  buildExecutionRecoveryPlan,
  simulateCrashRecovery,
  validateDurabilityIntegrity,
  computeRecoveryChecksum,
  isLifecycleRecoverable,
} from './executionDurabilityFoundation.js';

export {
  finalizeExecutionGovernance,
  validateGovernanceIntegrity,
  buildGovernanceFinalSnapshot,
  isGovernanceFrozen,
  assertNoPhase6Mutation,
} from './executionGovernanceFinalizer.js';

export {
  ingestTrafficRequest,
  normalizeTrafficPayload,
  validateIngressRequest,
  buildIngressContext,
  isTrafficAllowed,
} from './trafficIngressGateway.js';

export {
  classifyTrafficIntent,
  buildRoutingIntent,
  resolveExposureRoute,
  getTrafficExposureProfile,
  validateRoutingIntent,
} from './executionExposureRouter.js';

export {
  simulateShadowExecution,
  buildShadowTrace,
  compareShadowVsExpected,
  validateShadowIntegrity,
  isShadowExecutionValid,
} from './executionShadowEngine.js';

export {
  createExecutionTrace,
  recordExecutionMetric,
  buildObservabilitySnapshot,
  detectTraceAnomalies,
  getExecutionTelemetry,
} from './executionObservabilityHub.js';

export {
  evaluateGlobalExecutionPolicy,
  buildPolicySnapshot,
  validatePolicyCompliance,
  isExecutionCompliant,
  detectPolicyViolationSignals,
} from './executionPolicyEnforcer.js';

export {
  evaluateFinalExecutionGate,
  validateExecutionGuard,
  isExecutionGuardPassed,
  buildGuardDecisionTrace,
  resolveExecutionFinality,
} from './executionGuardKernel.js';

export {
  analyzeExecutionForensics,
  buildForensicReport,
  detectDecisionDrift,
  validateForensicIntegrity,
  computeForensicHash,
} from './executionForensicsEngine.js';

export {
  generateConsistencyProof,
  validateSystemConsistency,
  compareConsistencyStates,
  buildConsistencyGraph,
  isSystemConsistent,
} from './executionConsistencyProofEngine.js';

export {
  createProductionSeal,
  validateSealIntegrity,
  isSystemSealed,
  buildSealReport,
  verifySealConsistency,
} from './executionProductionSeal.js';

export {
  INTENT_CONTRACT_VERSION,
  INTENT_TYPES,
  createIntentEnvelope,
  normalizeIntentPayload,
  validateIntentContract,
  computeIntentHash,
  parseIntentContract,
  isIntentReplaySafe,
} from './intentContractLayer.js';

export {
  INTENT_REGISTRY_VERSION,
  registerIntentDefinition,
  getIntentDefinition,
  listRegisteredIntents,
  validateIntentCompatibility,
  computeIntentDefinitionHash,
  freezeIntentRegistry,
  isIntentRegistryFrozen,
} from './intentRegistry.js';

export {
  RUNTIME_CAPABILITY_VERSION,
  RUNTIME_CAPABILITIES,
  registerRuntimeCapabilityMapping,
  resolveRuntimeCapability,
  listRuntimeCapabilityMappings,
  validateRuntimeCapability,
  computeCapabilityMappingHash,
  freezeRuntimeCapabilityRegistry,
  isRuntimeCapabilityRegistryFrozen,
} from './runtimeCapabilityMapper.js';

export {
  WORKFLOW_COMPOSITION_VERSION,
  WORKFLOW_STEP_TYPES,
  createWorkflowDefinition,
  validateWorkflowDefinition,
  computeWorkflowHash,
  buildWorkflowExecutionPlan,
  detectWorkflowCycles,
  listWorkflowSteps,
  freezeWorkflowRegistry,
  isWorkflowRegistryFrozen,
} from './workflowCompositionLayer.js';

export {
  WORKFLOW_RUNTIME_VERSION,
  createWorkflowRuntimeSession,
  advanceWorkflowRuntime,
  getExecutableWorkflowSteps,
  pauseWorkflowRuntime,
  resumeWorkflowRuntime,
  finalizeWorkflowRuntime,
  validateWorkflowRuntimeIntegrity,
  computeWorkflowRuntimeHash,
} from './workflowRuntimeOrchestrator.js';

export {
  WORKFLOW_CHECKPOINT_VERSION,
  createWorkflowCheckpoint,
  restoreWorkflowCheckpoint,
  buildWorkflowRecoveryPlan,
  validateWorkflowCheckpoint,
  computeWorkflowCheckpointHash,
  compareWorkflowCheckpoints,
  isWorkflowRecoverable,
} from './workflowCheckpointRuntime.js';

export {
  DISTRIBUTED_WORKFLOW_VERSION,
  registerWorkflowRuntimeNode,
  assignWorkflowSession,
  transferWorkflowSession,
  resolveWorkflowSessionOwner,
  buildDistributedWorkflowMap,
  validateDistributedWorkflowIntegrity,
  computeDistributedWorkflowHash,
} from './distributedWorkflowCoordinator.js';

export {
  RUNTIME_SDK_VERSION,
  createRuntimeClient,
  submitRuntimeIntent,
  createWorkflowSession,
  buildRuntimeInvocation,
  validateRuntimeInvocation,
  buildSdkRuntimeSnapshot,
  computeSdkSurfaceHash,
} from './runtimeSdkSurface.js';

export {
  PRODUCT_KERNEL_VERSION,
  validateProductKernelIntegrity,
  buildProductKernelSnapshot,
  freezeProductKernel,
  validateKernelDeterminism,
  verifyProductKernelConsistency,
  isProductKernelFrozen,
  computeProductKernelHash,
} from './productKernelFinalizer.js';

export {
  RUNTIME_HTTP_SURFACE_VERSION,
  createRuntimeHttpSurface,
  registerRuntimeRoute,
  validateRuntimeRequest,
  handleRuntimeRequest,
  buildRuntimeHttpSnapshot,
  computeRuntimeSurfaceHash,
} from './runtimeHttpSurface.js';

export {
  RUNTIME_API_GATEWAY_VERSION,
  registerApiClient,
  authenticateRuntimeRequest,
  computeRequestSignature,
  authorizeRuntimeRequest,
  handleGatewayRuntimeRequest,
  buildApiGatewaySnapshot,
  computeApiGatewayHash,
} from './runtimeApiGateway.js';

export {
  TENANT_PROVISIONING_VERSION,
  registerTenant,
  bindClientToTenant,
  resolveTenantNamespace,
  validateTenantIsolation,
  buildTenantRuntimeContext,
  buildTenantProvisioningSnapshot,
  computeTenantProvisioningHash,
} from './tenantProvisioningLayer.js';

export {
  TENANT_RUNTIME_POLICY_VERSION,
  registerTenantRuntimePolicy,
  resolveTenantRuntimePolicy,
  validateTenantRuntimePolicy,
  buildTenantPolicyRuntimeContext,
  buildTenantPolicySnapshot,
  computeTenantPolicyHash,
} from './tenantRuntimePolicyLayer.js';

export {
  RUNTIME_USAGE_METER_VERSION,
  registerUsageMeter,
  recordRuntimeUsage,
  resolveRuntimeQuotaState,
  validateRuntimeQuota,
  buildRuntimeUsageSnapshot,
  computeRuntimeUsageHash,
} from './runtimeUsageMeter.js';

export {
  RUNTIME_AUDIT_LEDGER_VERSION,
  createAuditLedgerEntry,
  resolveAuditLedger,
  validateAuditLedgerIntegrity,
  buildAuditEvidenceChain,
  buildRuntimeAuditSnapshot,
  computeRuntimeAuditHash,
} from './runtimeAuditLedger.js';

export {
  RUNTIME_PROVENANCE_VERSION,
  registerProvenanceNode,
  linkProvenanceNodes,
  buildProvenanceGraph,
  validateProvenanceGraph,
  traceCausalLineage,
  buildProvenanceSnapshot,
  computeProvenanceHash,
} from './runtimeEventProvenanceGraph.js';

export {
  RUNTIME_CONVERGENCE_VERSION,
  buildSystemConvergenceModel,
  detectSystemContradictions,
  buildUnifiedTruthSnapshot,
  computeSystemConvergenceHash,
  validateSystemConvergence,
  freezeSystemConvergence,
  isSystemConvergenceFrozen,
} from './runtimeSystemConvergenceEngine.js';

export {
  RUNTIME_FINAL_SEAL_VERSION,
  computeFinalSystemHash,
  createFinalSystemSeal,
  validateFinalSealIntegrity,
  buildFinalSystemAttestation,
  freezeFinalSystemSeal,
  isSystemFinalSealed,
} from './runtimeFinalSealEngine.js';

export {
  RUNTIME_PRODUCTIZATION_VERSION,
  createProductPlatform,
  defineProductPlan,
  bindTenantToPlan,
  buildProductRuntimeSnapshot,
  computeProductPlatformHash,
  freezeProductPlatform,
  isProductPlatformFrozen,
} from './runtimeProductizationLayer.js';

export {
  SDK_PACKAGING_VERSION,
  createSdkClient,
  sdkSubmitIntent,
  sdkCreateWorkflow,
  sdkInvokeWorkflow,
  buildSdkPackageSnapshot,
  computeSdkPackageHash,
  freezeSdkPackage,
  isSdkPackageFrozen,
} from './runtimeSdkPackagingLayer.js';

export {
  GTM_VERSION,
  createMarketOffering,
  definePricingStrategy,
  registerGoToMarketBundle,
  evaluateMarketReadiness,
  freezeGoToMarketLayer,
  buildGoToMarketSnapshot,
  computeGoToMarketHash,
  isGoToMarketFrozen,
} from './runtimeGoToMarketLayer.js';

export {
  DASHBOARD_VERSION,
  createDashboardSession,
  buildDashboardView,
  getDashboardWidgetData,
  registerDashboardAction,
  simulateDashboardInteraction,
  buildDashboardSnapshot,
  computeDashboardHash,
  freezeDashboardLayer,
  isDashboardFrozen,
} from './runtimeSaaSDashboardLayer.js';

export {
  BRIDGE_VERSION,
  mapSignupToIntent,
  processSignupShadow,
  mapEventToIntent,
  processEventShadow,
} from './runtimeSignupIntegrationBridge.js';

export {
  INTERCEPTOR_VERSION,
  interceptEvent,
  createShadowMiddleware,
  getInterceptorStats,
} from './runtimeShadowInterceptor.js';

export {
  ADMIN_BRIDGE_VERSION,
  buildUnifiedAdminView,
  getAdminMetrics,
} from './runtimeMinimalAdminBridge.js';

export {
  SHADOW_INFRA_VERSION,
  getShadowInfra,
  isShadowInfraReady,
} from './runtimeShadowInfra.js';

export {
  ACTIVATION_VERSION,
  resolveActivationStep,
  verifyGoLive,
  buildActivationReport,
} from './runtimeProductActivation.js';

/** Phase 3.0 — ownership boundary version marker (no runtime logic). */
export const REGISTRATION_OWNERSHIP_VERSION = 'phase3-prep-v1';

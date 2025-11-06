// ============================================================================
// CORE TYPES - Mist Backbone
// ============================================================================

// ============================================================================
// USER & IDENTITY
// ============================================================================

export enum UserTier {
  FREE = 'free',
  PRO = 'pro',
  ENTERPRISE = 'enterprise'
}

export enum KYCStatus {
  NONE = 'none',
  LITE = 'lite',
  FULL = 'full'
}

export interface User {
  id: string;
  email: string;
  trust_score: number;
  tier: UserTier;
  kyc_status: KYCStatus;
  wallets: Wallet[];
  devices: Device[];
  metadata: Record<string, any>;
  created_at: Date;
  updated_at: Date;
}

export interface Wallet {
  id: string;
  user_id: string;
  type: 'crypto' | 'fiat';
  address?: string;
  balance: number;
  currency: string;
  created_at: Date;
}

export interface Device {
  id: string;
  user_id: string;
  fingerprint: string;
  os: string;
  browser?: string;
  last_seen: Date;
  trusted: boolean;
}

// ============================================================================
// RESOURCES
// ============================================================================

export enum ResourceType {
  GPU = 'gpu',
  MEMORY = 'memory',
  DATA = 'data',
  BANDWIDTH = 'bandwidth',
  STORAGE = 'storage'
}

export enum ResourceStatus {
  AVAILABLE = 'available',
  IN_USE = 'in_use',
  MAINTENANCE = 'maintenance',
  OFFLINE = 'offline'
}

export interface Resource {
  id: string;
  engine: string;  // 'gp4u', 'mas', 'dpras', etc.
  provider_id: string;
  type: ResourceType;
  specs: ResourceSpecs;
  region: string;
  status: ResourceStatus;
  price_per_unit: number;
  trust_score: number;
  availability: Availability;
  metadata: Record<string, any>;
  created_at: Date;
  updated_at: Date;
}

export interface ResourceSpecs {
  // GPU
  gpu_model?: string;
  gpu_memory_gb?: number;
  gpu_count?: number;

  // Memory
  memory_gb?: number;
  memory_type?: string;

  // Data
  dataset_hash?: string;
  size_gb?: number;
  category?: string;
  personal_data?: boolean;

  // Bandwidth
  bandwidth_mbps?: number;

  // Common
  [key: string]: any;
}

export interface Availability {
  is_available: boolean;
  next_available?: Date;
  capacity_used: number;
  capacity_total: number;
}

// ============================================================================
// JOBS
// ============================================================================

export enum JobStatus {
  PENDING = 'pending',
  SCHEDULED = 'scheduled',
  RUNNING = 'running',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELLED = 'cancelled'
}

export interface Job {
  id: string;
  user_id: string;
  engine: string;
  resource_id?: string;
  status: JobStatus;
  constraints: JobConstraints;
  price: number;
  started_at?: Date;
  completed_at?: Date;
  result?: JobResult;
  error?: string;
  metadata: Record<string, any>;
  created_at: Date;
  updated_at: Date;
}

export interface JobConstraints {
  // Trust
  min_trust_score?: number;

  // Pricing
  max_price?: number;

  // Latency
  max_latency_ms?: number;
  preferred_regions?: string[];

  // Memory
  memory_gb?: number;

  // Compliance
  data_residency?: string[];
  exclude_regions?: string[];
  require_encryption?: boolean;

  // SLA
  uptime_requirement?: number;
  performance_tier?: 'standard' | 'premium' | 'guaranteed';

  // Custom
  [key: string]: any;
}

export interface JobResult {
  success: boolean;
  output_hash?: string;
  metrics: {
    duration_seconds: number;
    cost: number;
    resources_used: Record<string, any>;
  };
  error?: string;
}

// ============================================================================
// TRUST
// ============================================================================

export interface TrustScore {
  user_id: string;
  engine?: string;
  score: number;
  components: TrustComponents;
  computed_at: Date;
}

export interface TrustComponents {
  completion_rate: number;
  user_ratings: number;
  uptime: number;
  transaction_volume: number;
  dispute_rate: number;
  compliance_score: number;
  tenure_days: number;
}

export interface TrustUpdate {
  user_id: string;
  engine: string;
  event_type: string;
  impact: number;
  reason: string;
  timestamp: Date;
}

// ============================================================================
// TRANSACTIONS & PAYMENTS
// ============================================================================

export enum TransactionStatus {
  PENDING = 'pending',
  ESCROWED = 'escrowed',
  COMPLETED = 'completed',
  FAILED = 'failed',
  REFUNDED = 'refunded',
  DISPUTED = 'disputed'
}

export interface Transaction {
  id: string;
  user_id: string;
  job_id?: string;
  amount: number;
  currency: string;
  status: TransactionStatus;
  escrow_until?: Date;
  splits: PaymentSplit[];
  metadata: Record<string, any>;
  created_at: Date;
  updated_at: Date;
}

export interface PaymentSplit {
  recipient_id: string;
  recipient_type: 'provider' | 'platform' | 'referrer' | 'royalty';
  amount: number;
  percentage: number;
}

export interface Bundle {
  id: string;
  user_id: string;
  resources: BundleResource[];
  total_price: number;
  discount_percentage: number;
  final_price: number;
  expires_at?: Date;
  metadata: Record<string, any>;
  created_at: Date;
}

export interface BundleResource {
  resource_id: string;
  type: ResourceType;
  quantity: number;
  duration_hours?: number;
  price: number;
}

// ============================================================================
// EVENTS
// ============================================================================

export enum EventType {
  // Resources
  RESOURCE_AVAILABLE = 'resource.available',
  RESOURCE_UNAVAILABLE = 'resource.unavailable',
  RESOURCE_UPDATED = 'resource.updated',

  // Jobs
  JOB_SUBMITTED = 'job.submitted',
  JOB_SCHEDULED = 'job.scheduled',
  JOB_STARTED = 'job.started',
  JOB_COMPLETED = 'job.completed',
  JOB_FAILED = 'job.failed',
  JOB_CANCELLED = 'job.cancelled',

  // Trust
  TRUST_UPDATED = 'trust.updated',
  TRUST_THRESHOLD_CROSSED = 'trust.threshold_crossed',

  // Payments
  PAYMENT_RECEIVED = 'payment.received',
  PAYMENT_ESCROWED = 'payment.escrowed',
  PAYMENT_RELEASED = 'payment.released',
  PAYMENT_REFUNDED = 'payment.refunded',

  // Compliance
  COMPLIANCE_VIOLATION = 'compliance.violation',
  AUDIT_LOG_CREATED = 'audit.log_created',

  // Analytics
  ANOMALY_DETECTED = 'anomaly.detected',
  PRICE_UPDATED = 'price.updated'
}

export interface Event {
  id: string;
  timestamp: Date;
  source: string;
  type: EventType;
  actor_id?: string;
  resource_id?: string;
  data: Record<string, any>;
}

// ============================================================================
// SCHEDULER & POLICIES
// ============================================================================

export interface SchedulingPolicy {
  id: string;
  name: string;
  priority: number;
  constraints: PolicyConstraint[];
  objectives: PolicyObjective[];
  enabled: boolean;
}

export interface PolicyConstraint {
  type: 'trust' | 'region' | 'price' | 'compliance' | 'availability';
  operator: 'gte' | 'lte' | 'eq' | 'in' | 'not_in';
  value: any;
  required: boolean;
}

export interface PolicyObjective {
  type: 'minimize_cost' | 'minimize_latency' | 'maximize_trust' | 'maximize_availability';
  weight: number;
}

export interface SchedulingDecision {
  job_id: string;
  resource_id: string;
  score: number;
  reasoning: {
    constraints_met: boolean;
    objective_scores: Record<string, number>;
    final_score: number;
  };
  timestamp: Date;
}

// ============================================================================
// COMPLIANCE & AUDIT
// ============================================================================

export enum AuditAction {
  CREATE = 'create',
  READ = 'read',
  UPDATE = 'update',
  DELETE = 'delete',
  EXECUTE = 'execute'
}

export interface AuditLog {
  id: string;
  timestamp: Date;
  event_type: string;
  actor_id: string;
  resource_id?: string;
  action: AuditAction;
  result: 'success' | 'failure';
  metadata: Record<string, any>;
  hash: string;  // For tamper detection
}

export interface ComplianceRule {
  id: string;
  name: string;
  type: 'geofencing' | 'data_residency' | 'consent' | 'encryption' | 'export_control';
  conditions: Record<string, any>;
  actions: string[];
  enabled: boolean;
}

// ============================================================================
// ANALYTICS & ML
// ============================================================================

export interface PriceRecommendation {
  resource_id: string;
  current_price: number;
  recommended_price: number;
  confidence: number;
  reasoning: string;
  factors: Record<string, number>;
  timestamp: Date;
}

export interface DemandForecast {
  engine: string;
  region: string;
  resource_type: ResourceType;
  forecast_hours: number[];
  demand: number[];
  confidence_intervals: [number, number][];
  timestamp: Date;
}

export interface AnomalyDetection {
  id: string;
  entity_id: string;
  entity_type: 'user' | 'resource' | 'transaction';
  anomaly_type: 'usage_pattern' | 'trust_decay' | 'price_manipulation' | 'fraud';
  score: number;
  details: Record<string, any>;
  timestamp: Date;
}

// ============================================================================
// PLUGIN INTERFACE
// ============================================================================

export interface ArbitrageEnginePlugin {
  // Metadata
  name: string;
  version: string;
  description: string;

  // Lifecycle
  initialize(config: Record<string, any>): Promise<void>;
  shutdown(): Promise<void>;

  // Resource management
  listResources(): Promise<Resource[]>;
  getResource(resourceId: string): Promise<Resource>;
  getAvailability(resourceId: string): Promise<Availability>;

  // Job lifecycle
  submitJob(job: Job): Promise<string>;
  getJobStatus(jobId: string): Promise<Job>;
  cancelJob(jobId: string): Promise<void>;

  // Trust inputs
  reportCompletion(jobId: string, result: JobResult): Promise<void>;
  reportIssue(jobId: string, issue: string): Promise<void>;

  // Pricing
  getPrice(resourceId: string, constraints: JobConstraints): Promise<number>;

  // Events
  on(event: EventType, handler: (data: Event) => void): void;
  emit(event: EventType, data: Record<string, any>): void;
}

export interface EngineConfig {
  name: string;
  enabled: boolean;
  api_url: string;
  api_key: string;
  webhook_url?: string;
  metadata: Record<string, any>;
}

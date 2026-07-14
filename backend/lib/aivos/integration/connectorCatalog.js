export const BUILTIN_CONNECTORS = Object.freeze([
  { id: 'conn-stripe', name: 'Stripe', version: '1.0.0', provider: 'stripe', permissions: ['payment.read', 'payment.write'], oauth: { required: false, flow: 'api_key' }, webhooks: ['payment.succeeded'], events: ['charge.created'], dependencies: { marketplace: [] }, billingMultiplier: 1.2, tenantScoped: true },
  { id: 'conn-shopify', name: 'Shopify', version: '1.0.0', provider: 'shopify', permissions: ['commerce.read'], oauth: { required: true, flow: 'authorization_code', scopes: ['read_products'] }, webhooks: ['orders/create'], events: ['order.created'], dependencies: {}, billingMultiplier: 1, tenantScoped: true, primaryWorkflow: 'wf-commerce' },
  { id: 'conn-tiktok', name: 'TikTok', version: '1.0.0', provider: 'tiktok', permissions: ['social.publish'], oauth: { required: true, flow: 'authorization_code', scopes: ['video.publish'] }, webhooks: [], events: ['video.published'], dependencies: {}, billingMultiplier: 1.5, tenantScoped: true, primaryWorkflow: 'wf-video-marketing' },
  { id: 'conn-facebook', name: 'Facebook', version: '1.0.0', provider: 'facebook', permissions: ['social.publish'], oauth: { required: true, flow: 'authorization_code', scopes: ['pages_manage_posts'] }, webhooks: ['feed'], events: ['post.created'], dependencies: {}, billingMultiplier: 1, tenantScoped: true },
  { id: 'conn-line-oa', name: 'LINE OA', version: '1.0.0', provider: 'line_oa', permissions: ['messaging.send'], oauth: { required: true, flow: 'client_credentials', scopes: ['push'] }, webhooks: ['message'], events: ['message.received'], dependencies: {}, billingMultiplier: 1, tenantScoped: true },
  { id: 'conn-gmail', name: 'Gmail', version: '1.0.0', provider: 'gmail', permissions: ['email.send'], oauth: { required: true, flow: 'authorization_code', scopes: ['gmail.send'] }, webhooks: [], events: ['email.sent'], dependencies: {}, billingMultiplier: 1, tenantScoped: true },
  { id: 'conn-slack', name: 'Slack', version: '1.0.0', provider: 'slack', permissions: ['chat.write'], oauth: { required: true, flow: 'authorization_code', scopes: ['chat:write'] }, webhooks: ['event'], events: ['message.posted'], dependencies: {}, billingMultiplier: 1, tenantScoped: true },
  { id: 'conn-discord', name: 'Discord', version: '1.0.0', provider: 'discord', permissions: ['chat.write'], oauth: { required: true, flow: 'authorization_code', scopes: ['bot'] }, webhooks: ['interaction'], events: ['interaction.created'], dependencies: {}, billingMultiplier: 1, tenantScoped: true },
  { id: 'conn-google-drive', name: 'Google Drive', version: '1.0.0', provider: 'google_drive', permissions: ['files.read'], oauth: { required: true, flow: 'authorization_code', scopes: ['drive.readonly'] }, webhooks: [], events: ['file.uploaded'], dependencies: {}, billingMultiplier: 1, tenantScoped: true },
  { id: 'conn-erp', name: 'ERP', version: '1.0.0', provider: 'erp', permissions: ['erp.read'], oauth: { required: false, flow: 'api_key' }, webhooks: ['sync'], events: ['inventory.updated'], dependencies: {}, billingMultiplier: 2, tenantScoped: true },
  { id: 'conn-crm', name: 'CRM', version: '1.0.0', provider: 'crm', permissions: ['crm.read'], oauth: { required: true, flow: 'authorization_code', scopes: ['contacts.read'] }, webhooks: ['contact'], events: ['contact.created'], dependencies: {}, billingMultiplier: 1, tenantScoped: true, primaryApplication: 'app-lead-gen-ai' },
  { id: 'conn-pos', name: 'POS', version: '1.0.0', provider: 'pos', permissions: ['pos.write'], oauth: { required: false, flow: 'api_key' }, webhooks: ['sale'], events: ['sale.completed'], dependencies: {}, billingMultiplier: 1, tenantScoped: true, primaryApplication: 'app-restaurant-ai' },
  { id: 'conn-payment', name: 'Payment Gateway', version: '1.0.0', provider: 'payment', permissions: ['payment.capture'], oauth: { required: false, flow: 'api_key' }, webhooks: ['capture'], events: ['payment.captured'], dependencies: { marketplace: ['resume-ai'] }, billingMultiplier: 1.5, tenantScoped: true },
  { id: 'conn-logistics', name: 'Logistics', version: '1.0.0', provider: 'logistics', permissions: ['shipment.track'], oauth: { required: false, flow: 'api_key' }, webhooks: ['tracking'], events: ['shipment.updated'], dependencies: {}, billingMultiplier: 1, tenantScoped: true, primaryApplication: 'app-food-ai' },
  { id: 'conn-openai', name: 'OpenAI', version: '1.0.0', provider: 'openai', permissions: ['llm.invoke'], oauth: { required: false, flow: 'api_key' }, webhooks: [], events: ['completion.created'], dependencies: {}, billingMultiplier: 2, tenantScoped: true, primaryWorkflow: 'wf-resume' },
  { id: 'conn-anthropic', name: 'Anthropic', version: '1.0.0', provider: 'anthropic', permissions: ['llm.invoke'], oauth: { required: false, flow: 'api_key' }, webhooks: [], events: ['message.created'], dependencies: {}, billingMultiplier: 2, tenantScoped: true },
]);

export function getConnectorTemplate(id) {
  return BUILTIN_CONNECTORS.find((c) => c.id === id) || null;
}

export function listConnectorTemplates() {
  return BUILTIN_CONNECTORS.map((c) => ({ ...c }));
}

export function isKernelEnabled() {
  return process.env.AIVOS_KERNEL_ENABLED === '1' || process.env.AIVOS_KERNEL_ENABLED === 'true';
}

export function assertKernelEnabled() {
  if (!isKernelEnabled()) {
    const err = new Error('aivos_kernel_disabled');
    err.code = 'AIVOS_KERNEL_DISABLED';
    throw err;
  }
}

let lastCpu = process.cpuUsage();

export function computeRuntimeMetrics() {
  const mem = process.memoryUsage();
  const cpu = process.cpuUsage(lastCpu);
  lastCpu = process.cpuUsage();

  return {
    generated_at: new Date().toISOString(),
    pid: process.pid,
    uptime_sec: Math.floor(process.uptime()),
    memory: {
      rss_mb: Math.round((mem.rss / 1024 / 1024) * 100) / 100,
      heap_used_mb: Math.round((mem.heapUsed / 1024 / 1024) * 100) / 100,
      heap_total_mb: Math.round((mem.heapTotal / 1024 / 1024) * 100) / 100,
      external_mb: Math.round((mem.external / 1024 / 1024) * 100) / 100,
      array_buffers_mb: Math.round(((mem.arrayBuffers || 0) / 1024 / 1024) * 100) / 100,
    },
    cpu_us: {
      user: cpu.user,
      system: cpu.system,
    },
  };
}

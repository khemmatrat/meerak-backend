/** Pure smart-match scoring — ใช้ได้ทั้ง mobile และ node --test */

export function suggestCategoryFromHistory(
  applications,
  savedJobs = [],
  routingCategories = [],
) {
  const catFreq = {};
  applications.forEach((a) => {
    if (a.category) catFreq[a.category] = (catFreq[a.category] || 0) + 3;
  });
  savedJobs.forEach((j) => {
    if (j.category) catFreq[j.category] = (catFreq[j.category] || 0) + 1;
  });
  routingCategories.forEach((c) => {
    if (c) catFreq[c] = (catFreq[c] || 0) + 1;
  });
  return Object.entries(catFreq).sort((a, b) => b[1] - a[1])[0]?.[0] || "";
}

export function scoreAdvanceSmartMatchJobs({
  jobs,
  applications,
  savedJobs,
  savedIds,
  appliedJobIds,
  profileProvinces,
  routingCategories,
  filterCategory,
  filterProvince,
  reasonLabels,
}) {
  const rLabels = reasonLabels || {};
  const appliedCategories = new Set();
  applications.forEach((a) => a.category && appliedCategories.add(a.category));
  const preferredCategories = new Set(appliedCategories);
  savedJobs.forEach((j) => j.category && preferredCategories.add(j.category));
  routingCategories.forEach((c) => preferredCategories.add(c));
  if (filterCategory) preferredCategories.add(filterCategory);

  const preferredProvinces = new Set();
  profileProvinces.forEach((p) => preferredProvinces.add(p));
  if (filterProvince) preferredProvinces.add(filterProvince);
  applications.forEach((a) => {
    const prov = a.target_province;
    if (prov) preferredProvinces.add(prov);
  });

  const scored = jobs.map((job) => {
    let score = 0;
    const reasons = [];
    if (job.category && preferredCategories.has(job.category)) {
      score += 3;
      reasons.push(
        appliedCategories.has(job.category)
          ? rLabels.categoryHistory || rLabels.applied || "หมวดที่คุณสนใจ"
          : rLabels.applied || "หมวดที่คุณเคยดู/สมัคร",
      );
    }
    if (job.category && routingCategories.includes(job.category)) {
      score += 2;
      reasons.push(rLabels.routing || "แนะนำโดยระบบ");
    }
    if (savedIds.has(String(job.id))) {
      score += 1;
      reasons.push(rLabels.saved || "งานที่คุณบันทึก");
    }
    if (preferredProvinces.size && job.target_province) {
      const jp = String(job.target_province);
      if (profileProvinces.includes(jp)) {
        score += 4;
        reasons.push(rLabels.profileProvince || "จังหวัดโปรไฟล์ของคุณ");
      } else if (preferredProvinces.has(jp)) {
        score += 2;
        reasons.push(rLabels.nearProvince || "ใกล้จังหวัดที่คุณเลือก");
      }
    }
    if (!appliedJobIds.has(String(job.id))) score += 1;
    if (job.status === "open") score += 1;
    return { job, score, reasons };
  });

  return scored
    .filter((x) => x.score > 0 && !appliedJobIds.has(String(x.job.id)))
    .sort((a, b) => b.score - a.score || (b.job.max_budget ?? 0) - (a.job.max_budget ?? 0))
    .slice(0, 5);
}

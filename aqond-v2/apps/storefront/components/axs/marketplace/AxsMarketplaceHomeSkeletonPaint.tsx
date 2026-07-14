/** Paint-first home skeleton — server HTML (no client JS required). */
export function AxsMarketplaceHomeSkeletonPaint() {
  return (
    <div
      className="axs-marketplace-loading"
      data-testid="home-skeleton"
      aria-busy="true"
      aria-label="กำลังโหลดสินค้า"
    >
      <div className="axs-home-skeleton-chips">
        {Array.from({ length: 5 }).map((_, i) => (
          <span key={i} className="axs-home-skeleton-chip" />
        ))}
      </div>
      <div className="axs-home-skeleton-card" />
      <div className="axs-home-skeleton-card" />
      <div className="axs-home-skeleton-card" />
    </div>
  );
}

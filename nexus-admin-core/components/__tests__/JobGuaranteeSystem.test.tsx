/**
 * Unit tests for JobGuaranteeSystem component (Real-time API)
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { JobGuaranteeSystem } from "../JobGuaranteeSystem";
import * as financialService from "../../services/financialService";

vi.mock("../../services/financialService", () => ({
  getJobGuarantees: vi.fn(),
}));

describe("JobGuaranteeSystem", () => {
  beforeEach(() => {
    vi.mocked(financialService.getJobGuarantees).mockResolvedValue({
      entries: [],
      total_held: 0,
      total_released: 0,
      total_claimed: 0,
      liability_to_release: 0,
      total_insurance_premium: 0,
      auto_release_enabled: true,
      counts: { active: 0, pending_release: 0, released: 0, claimed: 0 },
    });
  });

  it("renders without crashing", async () => {
    render(<JobGuaranteeSystem />);
    expect(screen.getByText(/ระบบเงินประกันงาน|Job Guarantee/i)).toBeTruthy();
  });

  it("shows summary labels for held, released, claimed", async () => {
    render(<JobGuaranteeSystem />);
    expect(screen.getByText(/ยอดประกันคงค้าง|เงินประกันทั้งหมด/i)).toBeTruthy();
    expect(screen.getByText(/คืนแล้ว/i)).toBeTruthy();
  });

  it("has export or refresh button", async () => {
    render(<JobGuaranteeSystem />);
    const buttons = screen.getAllByRole("button");
    expect(buttons.length).toBeGreaterThan(0);
  });
});

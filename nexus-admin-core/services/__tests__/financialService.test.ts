/**
 * Unit tests for financialService
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import * as financialService from "../financialService";

// Mock getAdminToken so we can test without auth
vi.mock("../adminApi", () => ({
  getAdminToken: vi.fn(() => null),
}));

describe("financialService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("getJobGuarantees", () => {
    it("returns empty data when no admin token", async () => {
      const res = await financialService.getJobGuarantees();
      expect(res).toEqual({
        entries: [],
        total_held: 0,
        total_released: 0,
        total_claimed: 0,
        liability_to_release: 0,
      });
    });
  });

  describe("getCommissionData", () => {
    it("returns empty data when no admin token", async () => {
      const res = await financialService.getCommissionData();
      expect(res).toEqual({
        by_category: [],
        trend: [],
        total_commission: 0,
        total_paid: 0,
        total_pending: 0,
      });
    });
  });

  describe("getRealTimeExpenses", () => {
    it("returns empty array when no admin token", async () => {
      const res = await financialService.getRealTimeExpenses();
      expect(res).toEqual([]);
    });
  });

  describe("getMarketCapData", () => {
    it("returns empty data when no admin token", async () => {
      const res = await financialService.getMarketCapData();
      expect(res).toEqual({
        current_market_cap: 0,
        total_shares: 0,
        share_value: 0,
        investors: [],
        growth: [],
      });
    });
  });
});

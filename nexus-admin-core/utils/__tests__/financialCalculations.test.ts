/**
 * Unit tests for financial calculations
 */
import { describe, it, expect } from "vitest";
import {
  calculateCommission,
  calculateCommissionAmount,
  calculateGuaranteeLiability,
  calculateMarketCap,
  calculateOwnershipPercentage,
  calculateShareValue,
  calculateProfitMargin,
} from "../financialCalculations";

describe("calculateCommission", () => {
  it("returns 12% for 0-9 completed jobs", () => {
    expect(calculateCommission(0)).toBe(0.12);
    expect(calculateCommission(5)).toBe(0.12);
    expect(calculateCommission(9)).toBe(0.12);
  });
  it("returns 10% for 10-19 completed jobs", () => {
    expect(calculateCommission(10)).toBe(0.1);
    expect(calculateCommission(15)).toBe(0.1);
  });
  it("returns 8% for 20-49 completed jobs", () => {
    expect(calculateCommission(20)).toBe(0.08);
    expect(calculateCommission(40)).toBe(0.08);
  });
  it("returns 7% for 50-99 completed jobs", () => {
    expect(calculateCommission(50)).toBe(0.07);
    expect(calculateCommission(80)).toBe(0.07);
  });
  it("returns 5% for 100+ completed jobs", () => {
    expect(calculateCommission(100)).toBe(0.05);
    expect(calculateCommission(200)).toBe(0.05);
  });
});

describe("calculateCommissionAmount", () => {
  it("computes commission from job amount and rate", () => {
    expect(calculateCommissionAmount(1000, 5)).toBe(120);
    expect(calculateCommissionAmount(10000, 100)).toBe(500);
  });
});

describe("calculateGuaranteeLiability", () => {
  it("sums amounts for pending_release and active past due", () => {
    const entries = [
      { amount: 1000, status: "pending_release", due_release_at: undefined },
      { amount: 500, status: "active", due_release_at: "2020-01-01T00:00:00Z" },
      { amount: 2000, status: "released", due_release_at: undefined },
    ];
    expect(calculateGuaranteeLiability(entries)).toBe(1500);
  });
  it("returns 0 for empty or no liability", () => {
    expect(calculateGuaranteeLiability([])).toBe(0);
    expect(
      calculateGuaranteeLiability([
        { amount: 100, status: "released", due_release_at: undefined },
      ])
    ).toBe(0);
  });
});

describe("calculateMarketCap", () => {
  it("computes market cap as shareValue * totalShares", () => {
    expect(calculateMarketCap(100, 10000)).toBe(1000000);
    expect(calculateMarketCap(50.5, 2000)).toBe(101000);
  });
});

describe("calculateOwnershipPercentage", () => {
  it("computes (investorShares / totalShares) * 100", () => {
    expect(calculateOwnershipPercentage(1000, 10000)).toBe(10);
    expect(calculateOwnershipPercentage(2500, 10000)).toBe(25);
  });
  it("returns 0 when totalShares is 0", () => {
    expect(calculateOwnershipPercentage(100, 0)).toBe(0);
  });
});

describe("calculateShareValue", () => {
  it("computes marketCap / totalShares", () => {
    expect(calculateShareValue(1000000, 10000)).toBe(100);
    expect(calculateShareValue(500000, 5000)).toBe(100);
  });
  it("returns 0 when totalShares is 0", () => {
    expect(calculateShareValue(1000000, 0)).toBe(0);
  });
});

describe("calculateProfitMargin", () => {
  it("computes (netProfit / revenue) * 100", () => {
    expect(calculateProfitMargin(100000, 20000)).toBe(20);
    expect(calculateProfitMargin(1000, 100)).toBe(10);
  });
  it("returns 0 when revenue is 0", () => {
    expect(calculateProfitMargin(0, 100)).toBe(0);
  });
});

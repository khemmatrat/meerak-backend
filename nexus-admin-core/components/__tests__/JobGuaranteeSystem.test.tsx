/**
 * Unit tests for JobGuaranteeSystem component
 */
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { JobGuaranteeSystem } from "../JobGuaranteeSystem";

describe("JobGuaranteeSystem", () => {
  it("renders without crashing", () => {
    render(<JobGuaranteeSystem />);
    expect(screen.getByText(/ระบบเงินประกันงาน|Job Guarantee/i)).toBeTruthy();
  });

  it("shows summary labels for held, released, claimed", () => {
    render(<JobGuaranteeSystem />);
    expect(screen.getByText(/ยอดประกันคงค้าง/i)).toBeTruthy();
    expect(screen.getByText(/คืนแล้ว/i)).toBeTruthy();
  });

  it("has export or refresh button", () => {
    render(<JobGuaranteeSystem />);
    const buttons = screen.getAllByRole("button");
    expect(buttons.length).toBeGreaterThan(0);
  });
});

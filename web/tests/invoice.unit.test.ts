import { describe, it, expect, vi } from "vitest";
import {
  validate,
  split,
  fromDraft,
  assertPayable,
  type Draft,
} from "../lib/invoice";
import {
  FixtureAdapter,
  FIXTURE_PAYER,
  FIXTURE_A,
  FIXTURE_B,
} from "../lib/fixture-adapter";
const draft: Draft = {
  payer: FIXTURE_PAYER,
  recipientA: FIXTURE_A,
  recipientB: FIXTURE_B,
  amount: "100",
  percent: "70",
  expiry: new Date(Date.now() + 86400000).toISOString(),
};
describe("USDC form validation", () => {
  it("accepts two valid recipients and preserves atomic payouts", () => {
    expect(validate(draft)).toEqual({});
    expect(split(fromDraft(draft).amount, 7000)).toEqual([
      70000000n,
      30000000n,
    ]);
  });
  it.each(["0", "-1", "1e3", "1.0000001", "abc", "", String(2n ** 256n)])(
    "rejects invalid amount %s",
    (amount) => {
      expect(validate({ ...draft, amount }).amount).toBeTruthy();
    },
  );
  it("rejects invalid/zero/duplicate recipients and past expiry", () => {
    expect(validate({ ...draft, recipientA: "0x0" }).recipientA).toBeTruthy();
    expect(
      validate({
        ...draft,
        recipientA: "0x0000000000000000000000000000000000000000",
      }).recipientA,
    ).toBeTruthy();
    expect(
      validate({ ...draft, recipientB: FIXTURE_A }).recipientB,
    ).toBeTruthy();
    expect(
      validate({ ...draft, expiry: new Date(0).toISOString() }).expiry,
    ).toBeTruthy();
  });
  it.each(["0", "100", "NaN", "70.001"])("rejects bad share %s", (percent) =>
    expect(validate({ ...draft, percent }).percent).toBeTruthy(),
  );
  it("assigns integer remainder to B and rejects dust payout", () => {
    expect(split(101n, 7000)).toEqual([70n, 31n]);
    expect(validate({ ...draft, amount: "0.000001" }).amount).toBeTruthy();
  });
});
describe("fixture settlement guards and recovery", () => {
  it("requires payer, open status, future expiry and allowance", async () => {
    const a = new FixtureAdapter();
    expect(() => assertPayable(a.getInvoice("1"), FIXTURE_A)).toThrow(
      "designated payer",
    );
    expect(() =>
      assertPayable(a.getInvoice("1"), FIXTURE_PAYER, Date.now() + 90000000),
    ).toThrow("expired");
    await expect(a.payInvoice("1", FIXTURE_PAYER, "success")).rejects.toThrow(
      "Approve",
    );
    a.cancelInvoice("1", FIXTURE_PAYER);
    await expect(a.payInvoice("1", FIXTURE_PAYER, "success")).rejects.toThrow(
      "cancelled",
    );
  });
  it("rejects approval and recovers with exact amount; pays once", async () => {
    vi.useFakeTimers();
    const a = new FixtureAdapter();
    const rejected = expect(
      a.approve(FIXTURE_PAYER, 100000000n, "reject"),
    ).rejects.toThrow("rejected");
    await vi.runAllTimersAsync();
    await rejected;
    expect(a.allowance(FIXTURE_PAYER)).toBe(0n);
    const approval = a.approve(FIXTURE_PAYER, 100000000n, "success");
    await vi.runAllTimersAsync();
    await approval;
    const payment = a.payInvoice("1", FIXTURE_PAYER, "success");
    await expect(a.payInvoice("1", FIXTURE_PAYER, "success")).rejects.toThrow(
      "pending",
    );
    await vi.runAllTimersAsync();
    expect((await payment).status).toBe("paid");
    expect(a.allowance(FIXTURE_PAYER)).toBe(0n);
    await expect(a.payInvoice("1", FIXTURE_PAYER, "success")).rejects.toThrow(
      "already paid",
    );
    vi.useRealTimers();
  });
  it("failed payment retains invoice and allowance for retry", async () => {
    vi.useFakeTimers();
    const a = new FixtureAdapter();
    const approval = a.approve(FIXTURE_PAYER, 100000000n, "success");
    await vi.runAllTimersAsync();
    await approval;
    const failed = expect(
      a.payInvoice("1", FIXTURE_PAYER, "fail"),
    ).rejects.toThrow("failed");
    await vi.runAllTimersAsync();
    await failed;
    expect(a.getInvoice("1").status).toBe("open");
    expect(a.allowance(FIXTURE_PAYER)).toBe(100000000n);
    vi.useRealTimers();
  });
});

"use client";
import { useState } from "react";
import { type Address } from "viem";
import config from "../config/deployment.json";
import { parseDeployment } from "../lib/deployment";
import {
  LiveInvoiceService,
  friendlyError,
  type LiveInvoice,
  type History,
  type TxState,
} from "../lib/live-service";
import { liveGateway } from "../lib/live-gateway";
import { money, split, validate, type Draft } from "../lib/invoice";
import { type useWallet } from "../lib/wallet";
export default function LivePanel({
  wallet,
}: {
  wallet: ReturnType<typeof useWallet>;
}) {
  const [state, setState] = useState<TxState>();
  const [service] = useState(() => {
    try {
      return new LiveInvoiceService(liveGateway, config, setState);
    } catch {
      return undefined;
    }
  });
  const [verified, setVerified] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [id, setId] = useState("");
  const [invoice, setInvoice] = useState<LiveInvoice>();
  const [history, setHistory] = useState<History>();
  const [funding, setFunding] = useState<{
    balance: bigint;
    allowance: bigint;
  }>();
  const [draft, setDraft] = useState<Draft>({
    payer: "",
    recipientA: "",
    recipientB: "",
    amount: "100",
    percent: "70",
    expiry: "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  let configError = "";
  try {
    parseDeployment(config);
  } catch (e) {
    configError = friendlyError(e);
  }
  const currentDraft = { ...draft, payer: wallet.address || "" };
  async function refresh(s: LiveInvoiceService, i: LiveInvoice) {
    setInvoice(i);
    setId(String(i.id));
    setFunding(await s.funding(i.payer));
    setHistory(await s.history(i));
  }
  async function run(
    work: (s: LiveInvoiceService, a: Address) => Promise<void>,
    needsWallet = true,
  ) {
    if (!service || busy) return;
    setBusy(true);
    setVerified(false);
    setError("");
    try {
      await service.verify();
      setVerified(true);
      if (needsWallet && !wallet.address)
        throw new Error("Connect your wallet first.");
      await work(
        service,
        wallet.address || "0x0000000000000000000000000000000000000000",
      );
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setBusy(false);
    }
  }
  async function verify() {
    await run(async () => {}, false);
  }
  async function create(e: React.FormEvent) {
    e.preventDefault();
    const found = validate(currentDraft);
    setErrors(found);
    if (Object.keys(found).length) return;
    await run(async (s, a) =>
      refresh(s, await s.createInvoice(currentDraft, a)),
    );
  }
  const field = (key: keyof Draft, label: string, type = "text") => (
    <label className="field">
      {label}
      <input
        type={type}
        value={draft[key]}
        onChange={(e) => {
          setDraft((d) => ({ ...d, [key]: e.target.value }));
          setErrors({});
        }}
        aria-invalid={!!errors[key]}
        disabled={busy}
      />
      {errors[key] && <span className="error">{errors[key]}</span>}
    </label>
  );
  return (
    <section className="workspace">
      <div className="section-heading">
        <p className="eyebrow">LIVE CONTRACT CONNECTION</p>
        <h1>Ready for the real split.</h1>
        <p>
          Arc Testnet only. Each create, approve, pay or cancel action requests
          a separate wallet signature.
        </p>
      </div>
      {configError ? (
        <div className="notice" role="status">
          {configError}
        </div>
      ) : (
        <div className="notice">
          <span>
            Contract:{" "}
            <span className="address">
              {service?.deployment.contractAddress}
            </span>{" "}
            · Profile: {service?.deployment.profile}
          </span>
          <button disabled={busy} onClick={() => void verify()}>
            Verify deployment
          </button>
          <strong>
            {verified
              ? "Deployment verified against RPC"
              : "Verification required"}
          </strong>
        </div>
      )}
      {error && (
        <div role="alert" className="notice error">
          {error}
        </div>
      )}
      {state && (
        <div className="notice" role="status">
          {state.message}
          {state.hash && (
            <a
              className="explorer-link address"
              href={`https://explorer.testnet.arc.io/tx/${state.hash}`}
              target="_blank"
              rel="noreferrer"
            >
              {state.hash} ↗
            </a>
          )}
        </div>
      )}
      {service?.pendingHash && (
        <div className="notice">
          <p>
            Confirmation is unresolved. Check the submitted transaction before
            sending another.
          </p>
          <button
            disabled={busy}
            onClick={() =>
              void run(async (s) => {
                const receipt = await s.recoverPending();
                const created = s.events(receipt, "InvoiceCreated")[0];
                if (created && typeof created.id === "bigint")
                  await refresh(s, await s.getInvoice(created.id));
                else if (invoice)
                  await refresh(s, await s.getInvoice(invoice.id));
              }, false)
            }
          >
            Check submitted transaction
          </button>
        </div>
      )}
      <div className="editor-grid">
        <form className="card" onSubmit={create} noValidate>
          <h2>Create an onchain invoice</h2>
          <label className="field">
            Designated payer
            <input value={wallet.address || "Wallet disconnected"} readOnly />
          </label>
          <p className="subtle">The connected wallet pays this invoice.</p>
          {field("recipientA", "Live recipient A address")}
          {field("recipientB", "Live recipient B address")}
          <div className="form-row">
            {field("amount", "Live total (USDC)")}
            {field("percent", "Live recipient A share (%)")}
          </div>
          {field("expiry", "Live expiry (local time)", "datetime-local")}
          <button
            className="button wide"
            disabled={!service || !wallet.address || busy}
            type="submit"
          >
            Create invoice on Arc Testnet
          </button>
          <p className="subtle">
            Keep a little extra USDC for network fees. Use the preview tab for
            an offline demo.
          </p>
        </form>
        <aside className="card">
          <h2>Look up a real invoice</h2>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void run(async (s) => {
                if (!/^[1-9]\d*$/.test(id))
                  throw new Error("Enter a positive invoice ID.");
                await refresh(s, await s.getInvoice(BigInt(id)));
              }, false);
            }}
          >
            <label className="field">
              Live invoice ID
              <input
                value={id}
                onChange={(e) => setId(e.target.value)}
                inputMode="numeric"
                disabled={busy}
              />
            </label>
            <button
              className="button secondary wide"
              disabled={!service || busy}
            >
              Read invoice from chain
            </button>
          </form>
          <p className="subtle">
            There are no sample invoices or simulated balances in this view.
          </p>
        </aside>
      </div>
      {invoice && (
        <div className="editor-grid">
          <article className="card detail">
            <div className="receipt-top">
              <span className="status">{invoice.status}</span>
              <span className="subtle">LIVE CHAIN DATA</span>
            </div>
            <p className="total-label">INVOICE #{String(invoice.id)}</p>
            <div className="large-amount">
              {money(invoice.amount)} <span>USDC</span>
            </div>
            {[invoice.recipientA, invoice.recipientB].map(
              (recipient, index) => (
                <div className="recipient" key={index}>
                  <span className={`avatar ${index ? "violet" : ""}`}>
                    {index ? "B" : "A"}
                  </span>
                  <div>
                    <strong>Recipient {index ? "B" : "A"}</strong>
                    <span className="address">{recipient}</span>
                  </div>
                  <b>
                    {money(split(invoice.amount, invoice.shareBps)[index])}
                    <small>USDC</small>
                  </b>
                </div>
              ),
            )}
            <dl>
              <dt>Payer</dt>
              <dd className="address">{invoice.payer}</dd>
              <dt>Creator</dt>
              <dd className="address">{invoice.creator}</dd>
              <dt>Expiry</dt>
              <dd>
                {new Date(Number(invoice.expiry) * 1000).toLocaleString()} ·{" "}
                {service?.deployment.profile === "studio-v1"
                  ? "inclusive"
                  : "exclusive"}{" "}
                chain timestamp boundary
              </dd>
            </dl>
            <h3>Confirmed transaction history</h3>
            {history?.partial && (
              <p className="subtle">
                Partial history: last 20,000 blocks only, or RPC history
                unavailable.
              </p>
            )}
            {history?.error && <p className="error">{history.error}</p>}
            <ol className="history">
              {history?.events.map((e, index) => (
                <li key={index}>
                  {e.event} · block {String(e.block)}
                  <br />
                  <a
                    className="address explorer-link"
                    href={`https://explorer.testnet.arc.io/tx/${e.hash}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {e.hash} ↗
                  </a>
                </li>
              ))}
            </ol>
            {history?.payment && (
              <div className="safety-note">
                <strong>Verified split receipt</strong>
                <p>
                  {money(history.payment.payoutA)} USDC to A ·{" "}
                  {money(history.payment.payoutB)} USDC to B
                </p>
                <p>
                  {new Date(
                    Number(history.payment.timestamp) * 1000,
                  ).toLocaleString()}
                </p>
                <a
                  className="address explorer-link"
                  href={`https://explorer.testnet.arc.io/tx/${history.payment.hash}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  {history.payment.hash} ↗
                </a>
                <p>
                  InvoicePaid and both USDC Transfer events verified in a
                  successful receipt.
                </p>
              </div>
            )}
            {invoice.status === "paid" && !history?.payment && (
              <p className="notice">
                Paid contract state; transfer receipt evidence is unavailable in
                this lookup. No verified payout receipt is claimed.
              </p>
            )}
          </article>
          <aside className="card">
            <h2>Settle this invoice</h2>
            <div className="payment-metric">
              <span>Payer USDC balance</span>
              <strong>
                {funding ? money(funding.balance) : "Unavailable"}
              </strong>
            </div>
            <div className="payment-metric">
              <span>Current allowance</span>
              <strong>
                {funding ? money(funding.allowance) : "Unavailable"}
              </strong>
            </div>
            <div className="payment-metric">
              <span>Required approval</span>
              <strong>{money(invoice.amount)} USDC</strong>
            </div>
            <p className="subtle">
              Payment validates the current chain time, payer, balance and
              allowance before opening your wallet.
            </p>
            <button
              className="button secondary wide"
              disabled={
                busy ||
                !wallet.address ||
                invoice.status !== "open" ||
                wallet.address.toLowerCase() !== invoice.payer.toLowerCase() ||
                (funding !== undefined && funding.allowance >= invoice.amount)
              }
              onClick={() =>
                void run(async (s, a) => {
                  await s.approve(invoice.id, a);
                  await refresh(s, await s.getInvoice(invoice.id));
                })
              }
            >
              Approve exact USDC amount
            </button>
            <button
              className="button wide"
              disabled={
                busy ||
                !wallet.address ||
                invoice.status !== "open" ||
                wallet.address.toLowerCase() !== invoice.payer.toLowerCase() ||
                !funding ||
                funding.allowance < invoice.amount ||
                funding.balance < invoice.amount
              }
              onClick={() =>
                void run(async (s, a) =>
                  refresh(s, await s.payInvoice(invoice.id, a)),
                )
              }
            >
              Confirm onchain payment
            </button>
            <button
              className="text-button"
              disabled={
                busy ||
                !wallet.address ||
                invoice.status !== "open" ||
                (wallet.address.toLowerCase() !== invoice.payer.toLowerCase() &&
                  !(
                    service?.deployment.profile === "studio-v1" &&
                    wallet.address.toLowerCase() ===
                      invoice.creator.toLowerCase()
                  ))
              }
              onClick={() =>
                void run(async (s, a) =>
                  refresh(s, await s.cancelInvoice(invoice.id, a)),
                )
              }
            >
              Cancel onchain invoice
            </button>
            <button
              className="text-button"
              disabled={busy}
              onClick={() =>
                void run(
                  async (s) => refresh(s, await s.getInvoice(invoice.id)),
                  false,
                )
              }
            >
              Refresh chain state
            </button>
            {busy && (
              <p role="status">
                Checking chain state or waiting for your transaction…
              </p>
            )}
          </aside>
        </div>
      )}
    </section>
  );
}

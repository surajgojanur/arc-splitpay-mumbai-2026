"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { formatUnits, parseUnits } from "viem";
import {
  FixtureAdapter,
  FIXTURE_PAYER,
  FIXTURE_A,
  FIXTURE_B,
  type Scenario,
} from "../lib/fixture-adapter";
import {
  fromDraft,
  money,
  split,
  validate,
  type Draft,
  type Invoice,
} from "../lib/invoice";
import { useWallet } from "../lib/wallet";
import { arc } from "../lib/network";
const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
export default function Dashboard() {
  const [adapter] = useState(() => new FixtureAdapter());
  const wallet = useWallet();
  const [demo, setDemo] = useState(false);
  const [view, setView] = useState<"home" | "create" | "invoice">("home");
  const [invoice, setInvoice] = useState<Invoice>();
  const [lookup, setLookup] = useState("1");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState("");
  const [approved, setApproved] = useState(false);
  const [scenario, setScenario] = useState<Scenario>("success");
  const [clock, setClock] = useState(0);
  const lock = useRef(false);
  const [draft, setDraft] = useState<Draft>({
    payer: FIXTURE_PAYER,
    recipientA: "",
    recipientB: "",
    amount: "100",
    percent: "70",
    expiry: "",
  });
  useEffect(() => {
    const tick = setInterval(() => setClock(Date.now()), 1000);
    return () => clearInterval(tick);
  }, []);
  const setField = (key: keyof Draft, value: string) => {
    setDraft((d) => ({ ...d, [key]: value }));
    setErrors((current) => {
      const next = { ...current };
      delete next[key];
      return next;
    });
    setMessage("");
  };
  const active = demo ? FIXTURE_PAYER : wallet.address;
  const wrongNetwork = !!wallet.address && wallet.chainId !== arc.id;
  const expired = invoice ? clock >= invoice.expiry : false;
  let preview: [bigint, bigint] | undefined;
  try {
    const checked = validate({ ...draft, expiry: "9999-01-01T00:00:00Z" }, 0);
    if (!checked.amount && !checked.percent)
      preview = split(
        parseUnits(draft.amount, 6),
        Math.round(Number(draft.percent) * 100),
      );
  } catch {}
  function show(i: Invoice) {
    setClock(Date.now());
    setInvoice(i);
    setApproved(adapter.allowance(FIXTURE_PAYER) >= i.amount);
    setView("invoice");
    setMessage("");
  }
  function start() {
    setView("create");
    setMessage("");
    setErrors({});
    setDraft((d) => ({
      ...d,
      expiry:
        d.expiry ||
        new Date(Date.now() + 86400000 - new Date().getTimezoneOffset() * 60000)
          .toISOString()
          .slice(0, 16),
    }));
  }
  function create(e: React.FormEvent) {
    e.preventDefault();
    const found = validate(draft);
    setErrors(found);
    if (Object.keys(found).length) {
      setMessage("Please correct the highlighted fields.");
      return;
    }
    if (!demo) {
      setMessage(
        "Use the demo wallet to create a fixture. Live contract creation awaits the confirmed ABI.",
      );
      return;
    }
    try {
      show(adapter.createInvoice(fromDraft(draft)));
    } catch (e) {
      setMessage((e as Error).message);
    }
  }
  async function transact(kind: "approve" | "pay") {
    if (!invoice || !demo || lock.current) return;
    lock.current = true;
    setMessage("");
    setPending(
      kind === "approve"
        ? "Approval pending — demo simulation"
        : "Payment pending — demo simulation",
    );
    try {
      if (kind === "approve") {
        await adapter.approve(FIXTURE_PAYER, invoice.amount, scenario);
        setApproved(true);
        setMessage("Demo allowance ready for this exact invoice amount.");
      } else {
        show(await adapter.payInvoice(invoice.id, FIXTURE_PAYER, scenario));
      }
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setPending("");
      lock.current = false;
    }
  }
  const disabled =
    !!pending ||
    !demo ||
    invoice?.status !== "open" ||
    expired ||
    invoice?.payer !== FIXTURE_PAYER;
  const field = (name: keyof Draft, label: string, type = "text") => (
    <label className="field">
      {label}
      <input
        name={name}
        type={type}
        value={draft[name]}
        onChange={(e) => setField(name, e.target.value)}
        aria-invalid={!!errors[name]}
        aria-describedby={errors[name] ? `error-${name}` : undefined}
        autoComplete="off"
      />
      {errors[name] && (
        <span className="error" id={`error-${name}`}>
          {errors[name]}
        </span>
      )}
    </label>
  );
  return (
    <>
      <div className="demo-banner">
        <strong>DEMO DATA</strong>
        <span>
          Fixture preview · No real transfers · Live contract integration
          pending
        </span>
      </div>
      <header>
        <Link className="brand" href="/" aria-label="ArcSplit home">
          <span className="brand-icon">a/</span>ArcSplit
          <span className="beta">TESTNET</span>
        </Link>
        <div className="wallet-area">
          <span className="network">
            <i />
            Arc Testnet
          </span>
          <button
            className="button secondary"
            disabled={wallet.busy}
            onClick={() => {
              setDemo(false);
              void wallet.connect();
            }}
          >
            {wallet.busy
              ? "Connecting…"
              : wallet.address
                ? short(wallet.address)
                : "Connect wallet"}
          </button>
          {wallet.address && (
            <button className="text-button" onClick={wallet.disconnect}>
              Disconnect
            </button>
          )}
        </div>
      </header>
      <main>
        <nav aria-label="Main navigation">
          <button
            className={view === "home" ? "selected" : ""}
            onClick={() => {
              setView("home");
              setMessage("");
            }}
          >
            Overview
          </button>
          <button
            className={view === "create" ? "selected" : ""}
            onClick={start}
          >
            Create invoice
          </button>
          <a
            href="https://github.com/surajgojanur/arc-splitpay-mumbai-2026"
            target="_blank"
            rel="noreferrer"
          >
            Project ↗
          </a>
        </nav>
        {wallet.error && (
          <div role="alert" className="notice error">
            {wallet.error}
          </div>
        )}
        {wrongNetwork && (
          <div className="notice" role="alert">
            Your wallet is on another network.{" "}
            <button
              onClick={() => void wallet.switchNetwork()}
              disabled={wallet.busy}
            >
              Switch to Arc Testnet
            </button>
          </div>
        )}
        {wallet.address && (
          <p className="wallet-summary">
            Connected: <span className="address">{wallet.address}</span> · USDC
            balance:{" "}
            {wallet.balance === undefined
              ? "Unavailable"
              : formatUnits(wallet.balance, 6)}{" "}
            · Live invoice writes unavailable
          </p>
        )}
        {view === "home" && (
          <>
            <section className="hero">
              <div>
                <p className="eyebrow">SIMPLE PAYMENTS. SHARED SUCCESS.</p>
                <h1>
                  One invoice.
                  <br />
                  Two payouts.
                  <br />
                  <span>All settled.</span>
                </h1>
                <p className="intro">
                  Pay your collaborators in one move. Choose the split, approve
                  the amount, and let the contract handle the rest.
                </p>
                <div className="actions">
                  <button className="button" onClick={start}>
                    Create an invoice <span>↗</span>
                  </button>
                  <button
                    className="text-button"
                    onClick={() => {
                      setDemo(true);
                      wallet.clearError();
                      setErrors({});
                      setMessage("");
                      show(adapter.getInvoice("1"));
                    }}
                  >
                    Explore demo →
                  </button>
                </div>
                <p className="subtle">
                  Built for USDC on Arc · No account required
                </p>
              </div>
              <div
                className="hero-art"
                aria-label="Example 100 USDC invoice split 70 and 30"
              >
                <div className="mini-label">THE PAYMENT, SIMPLIFIED</div>
                <div className="amount-orb">
                  <span>ONE INVOICE</span>
                  <strong>
                    100<span> USDC</span>
                  </strong>
                  <small>Example payment</small>
                </div>
                <div className="split-line" />
                <div className="payout-grid">
                  <div>
                    <span className="avatar">A</span>
                    <small>CONTRIBUTOR A · 70%</small>
                    <strong>
                      70.00 <span>USDC</span>
                    </strong>
                  </div>
                  <div>
                    <span className="avatar violet">B</span>
                    <small>CONTRIBUTOR B · 30%</small>
                    <strong>
                      30.00 <span>USDC</span>
                    </strong>
                  </div>
                </div>
                <p className="art-note">
                  Two recipients. One atomic settlement.
                </p>
              </div>
            </section>
            <section className="bottom-grid">
              <article className="card">
                <p className="eyebrow">PICK UP WHERE YOU LEFT OFF</p>
                <h2>Find an invoice</h2>
                <p className="subtle">
                  Look up a fixture from this session. Try invoice 1.
                </p>
                <form
                  className="lookup"
                  onSubmit={(e) => {
                    e.preventDefault();
                    try {
                      show(adapter.getInvoice(lookup));
                    } catch (e) {
                      setMessage((e as Error).message);
                    }
                  }}
                >
                  <label className="sr-only" htmlFor="lookup">
                    Invoice ID
                  </label>
                  <input
                    id="lookup"
                    value={lookup}
                    onChange={(e) => setLookup(e.target.value)}
                    placeholder="Invoice ID"
                  />
                  <button className="button secondary">Look up →</button>
                </form>
              </article>
              <article className="explain">
                <span className="step">01 / 02 / 03</span>
                <h2>Set the split. Make it simple.</h2>
                <p>
                  Only the designated payer can settle an open invoice. It must
                  be paid before expiry, and can never be paid twice.
                </p>
                <a
                  href="https://explorer.testnet.arc.io"
                  target="_blank"
                  rel="noreferrer"
                >
                  Explore Arc Testnet ↗
                </a>
              </article>
            </section>
          </>
        )}
        {view === "create" && (
          <section className="workspace">
            <div className="section-heading">
              <p className="eyebrow">NEW INVOICE</p>
              <h1>A fair split starts here.</h1>
              <p>
                Two recipients, one total. Preview every payout before you
                continue.
              </p>
            </div>
            <div className="editor-grid">
              <form className="card invoice-form" onSubmit={create} noValidate>
                <h2>Payment details</h2>
                <label className="field">
                  Payer wallet
                  <input value={active || "Wallet disconnected"} readOnly />
                </label>
                <p className="subtle">
                  The connected payer will own the invoice. For fixtures, use
                  the demo wallet.
                </p>
                <button
                  type="button"
                  className="text-button"
                  onClick={() => {
                    setDemo(true);
                    wallet.clearError();
                    setErrors({});
                    setMessage("");
                    setDraft((d) => ({
                      ...d,
                      payer: FIXTURE_PAYER,
                      recipientA: FIXTURE_A,
                      recipientB: FIXTURE_B,
                    }));
                  }}
                >
                  Use demo wallet & sample recipients
                </button>
                {field("recipientA", "Recipient A address")}
                {field("recipientB", "Recipient B address")}
                <div className="form-row">
                  {field("amount", "Total amount (USDC)")}
                  {field("percent", "Recipient A share (%)")}
                </div>
                {field(
                  "expiry",
                  "Expires at (your local time)",
                  "datetime-local",
                )}
                <button className="button wide" type="submit">
                  Create demo invoice →
                </button>
                <p className="subtle">
                  Fixture only. This does not create an onchain invoice.
                </p>
              </form>
              <aside className="card preview">
                <p className="eyebrow">PAYOUT PREVIEW</p>
                <h2>
                  {draft.amount || "0"} <span>USDC</span>
                </h2>
                <div className="split-bar">
                  <div
                    style={{
                      width: `${Math.min(100, Math.max(0, Number(draft.percent) || 0))}%`,
                    }}
                  />
                </div>
                <div className="preview-row">
                  <span>A · {draft.percent || 0}%</span>
                  <strong>{preview ? money(preview[0]) : "—"} USDC</strong>
                </div>
                <div className="preview-row">
                  <span>
                    B ·{" "}
                    {Number.isFinite(Number(draft.percent))
                      ? 100 - Number(draft.percent)
                      : "—"}
                    %
                  </span>
                  <strong>{preview ? money(preview[1]) : "—"} USDC</strong>
                </div>
                <p className="subtle">
                  Amounts use 6 decimal places. Recipient B receives any
                  rounding remainder.
                </p>
                <div className="safety-note">
                  One payment distributes both payouts atomically. If either
                  transfer fails, the entire settlement fails.
                </div>
              </aside>
            </div>
          </section>
        )}
        {view === "invoice" && invoice && (
          <section className="workspace">
            <div className="section-heading">
              <p className="eyebrow">INVOICE #{invoice.id} · DEMO DATA</p>
              <h1>
                {invoice.status === "paid"
                  ? "A split worth celebrating."
                  : "Everything in its place."}
              </h1>
              <p>
                {invoice.status === "paid"
                  ? "Fixture receipt — no money moved onchain."
                  : "Review both payouts, then approve the exact total."}
              </p>
            </div>
            <div className="editor-grid">
              <article
                className={`card detail ${invoice.status === "paid" ? "receipt" : ""}`}
              >
                <div className="receipt-top">
                  <span className="status">
                    {expired && invoice.status === "open"
                      ? "expired"
                      : invoice.status}
                  </span>
                  <span className="subtle">USDC / ARC TESTNET</span>
                </div>
                <p className="total-label">
                  {invoice.status === "paid"
                    ? "SIMULATED TOTAL PAID"
                    : "INVOICE TOTAL"}
                </p>
                <div className="large-amount">
                  {money(invoice.amount)} <span>USDC</span>
                </div>
                <div className="split-bar">
                  <div style={{ width: `${invoice.shareBps / 100}%` }} />
                </div>
                {([invoice.recipientA, invoice.recipientB] as const).map(
                  (a, index) => (
                    <div className="recipient" key={index}>
                      <span className={`avatar ${index ? "violet" : ""}`}>
                        {index ? "B" : "A"}
                      </span>
                      <div>
                        <strong>
                          Recipient {index ? "B" : "A"} ·{" "}
                          {index
                            ? 100 - invoice.shareBps / 100
                            : invoice.shareBps / 100}
                          %
                        </strong>
                        <span className="address">{a}</span>
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
                  <dt>Expires</dt>
                  <dd>{new Date(invoice.expiry).toLocaleString()}</dd>
                  {invoice.paidAt && (
                    <>
                      <dt>Simulated at</dt>
                      <dd>{new Date(invoice.paidAt).toLocaleString()}</dd>
                      <dt>Transaction hash</dt>
                      <dd>None — fixture simulation</dd>
                    </>
                  )}
                </dl>
                <h3>Session history</h3>
                <ol className="history">
                  {invoice.history.map((h, index) => (
                    <li key={index}>
                      <span>{h.action}</span>
                      <small>{new Date(h.at).toLocaleTimeString()}</small>
                    </li>
                  ))}
                </ol>
              </article>
              <aside className="card payment">
                <p className="eyebrow">
                  {invoice.status === "paid"
                    ? "DEMO RECEIPT"
                    : "SETTLE INVOICE"}
                </p>
                <h2>
                  {invoice.status === "paid"
                    ? "Both payouts simulated."
                    : "One clear payment."}
                </h2>
                <p className="subtle">
                  Live payments are disabled until the contract ABI and
                  deployment are confirmed.
                </p>
                {!demo && (
                  <button
                    className="button secondary wide"
                    onClick={() => {
                      setDemo(true);
                      wallet.clearError();
                      setErrors({});
                      setMessage("");
                      setApproved(
                        adapter.allowance(FIXTURE_PAYER) >= invoice.amount,
                      );
                    }}
                  >
                    Use demo wallet
                  </button>
                )}
                <div className="payment-metric">
                  <span>Demo balance</span>
                  <strong>1,000 USDC</strong>
                </div>
                <div className="payment-metric">
                  <span>Required allowance</span>
                  <strong>{money(invoice.amount)} USDC</strong>
                </div>
                <div className="payment-metric">
                  <span>Demo allowance</span>
                  <strong>
                    {money(adapter.allowance(FIXTURE_PAYER))} USDC
                  </strong>
                </div>
                {invoice.status === "open" && (
                  <>
                    <label className="field">
                      Demo outcome
                      <select
                        value={scenario}
                        onChange={(e) =>
                          setScenario(e.target.value as Scenario)
                        }
                        disabled={!!pending}
                      >
                        <option value="success">Successful simulation</option>
                        <option value="reject">Wallet rejection</option>
                        <option value="fail">Transaction failure</option>
                      </select>
                    </label>
                    <button
                      className="button secondary wide"
                      disabled={disabled || approved}
                      onClick={() => void transact("approve")}
                    >
                      {approved
                        ? "✓ Exact amount approved"
                        : "1. Simulate approval"}
                    </button>
                    <button
                      className="button wide"
                      disabled={disabled || !approved}
                      onClick={() => void transact("pay")}
                    >
                      2. Confirm demo payment
                    </button>
                    <button
                      className="text-button"
                      disabled={disabled}
                      onClick={() => {
                        try {
                          show(
                            adapter.cancelInvoice(invoice.id, FIXTURE_PAYER),
                          );
                        } catch (e) {
                          setMessage((e as Error).message);
                        }
                      }}
                    >
                      Cancel demo invoice
                    </button>
                  </>
                )}
                {invoice.status === "paid" && (
                  <div className="safety-note">
                    ✓ Demo flow complete. This receipt is not proof of an
                    onchain payment.
                  </div>
                )}
                {expired && invoice.status === "open" && (
                  <p className="error">Expired invoices cannot be paid.</p>
                )}
                {invoice.payer !== FIXTURE_PAYER && (
                  <p className="error">
                    Only the designated payer can settle this invoice.
                  </p>
                )}
                <a
                  className="explorer-link"
                  href={arc.blockExplorers.default.url}
                  target="_blank"
                  rel="noreferrer"
                >
                  Arc Testnet explorer ↗
                </a>
              </aside>
            </div>
          </section>
        )}
        {(message || pending) && (
          <div
            className={`notice ${message.toLowerCase().match(/reject|failed|correct|not found/) ? "error" : ""}`}
            role={pending ? "status" : "alert"}
            aria-live="polite"
          >
            {pending && <span className="pending-dot" />}
            {pending || message}
          </div>
        )}
        <footer>
          <span className="brand footer-brand">a/ ArcSplit</span>
          <span>Programmable payments. Human simplicity.</span>
          <span>Arc Testnet · Fixture preview</span>
        </footer>
      </main>
    </>
  );
}

import Link from "next/link";

export const dynamic = "force-static";

export default function SetupPage() {
  return (
    <main className="max-w-[640px] mx-auto px-5 pt-8 pb-16 animate-print">
      <Link href="/" className="eyebrow ink-link">
        ← BACK
      </Link>

      <header className="text-center mt-8 mb-6">
        <div className="eyebrow">ONE-TIME SETUP · ~ 5 MIN</div>
        <h1 className="display-italic text-[56px] mt-3 leading-[0.9]">Wire up Slack.</h1>
        <p className="text-ink-soft text-[14px] mt-3 max-w-[480px] mx-auto">
          Slack&apos;s free Workflow Builder no longer offers an outbound webhook step, so
          tickets are created on the web — Slack just gets <em className="display-italic">notified</em>{" "}
          when things happen. One <strong>incoming webhook</strong> workflow does the whole job.
        </p>
      </header>

      <div className="divider-double my-8" />

      {/* Pre-flight */}
      <Step n="00" title="Before you start">
        <ul className="space-y-2 mt-3 text-[14px]">
          <li>
            <span className="text-saffron">·</span> Add yourself to{" "}
            <Link href="/people" className="ink-link">
              the roster
            </Link>{" "}
            with your <em className="display-italic">work email</em> + JazzCash / EasyPaisa / IBAN.
            Tickets you create pull payment methods from here.
          </li>
          <li>
            <span className="text-saffron">·</span> Open Slack →{" "}
            <code className="font-mono">#secure-lunch-internal</code>.
          </li>
        </ul>
      </Step>

      <div className="divider-dots my-8" />

      <Step n="01" title="Pin the ‘new ticket’ link in the channel">
        <p className="mt-3 text-[14px]">
          Post a message in <code className="font-mono">#secure-lunch-internal</code>:
        </p>
        <pre className="mt-3 text-[12.5px] leading-[1.7] whitespace-pre-wrap font-mono border-l-2 border-saffron/60 pl-3 py-2 bg-paper-light/50">
{`🍱 Start a lunch ticket → https://lunch-split.vercel.app/tickets/new`}
        </pre>
        <p className="mt-3 text-[14px]">
          Hover the message → <strong>···</strong> → <strong>Pin to channel</strong>. Now it&apos;s
          always one click from the top of the channel.
        </p>
        <p className="mt-2 text-[12px] text-ink-faint italic">
          Optional: also stick the URL in the channel <em className="display-italic">topic</em> for
          mobile users who skip the pin tray.
        </p>
      </Step>

      <div className="divider-dots my-8" />

      <Step n="02" title="Build the notifier workflow">
        <p className="mt-3 text-[14px]">
          In <code className="font-mono">#secure-lunch-internal</code>, click the{" "}
          <span className="display-italic text-[17px]">+</span> button at the top of the channel →{" "}
          <strong>Workflows</strong> → <strong>New Workflow</strong> →{" "}
          <strong>Build Workflow</strong>. Name it <code className="font-mono">Lunch ticket updates</code>.
        </p>
      </Step>

      <Step n="03" title="Trigger — From a webhook">
        <p className="mt-3 text-[14px]">
          Pick <strong>From a webhook</strong> (<em className="display-italic">not</em> &ldquo;From
          a link in Slack&rdquo;). Slack will ask you to declare the variables that the incoming
          body must include.
        </p>
        <p className="mt-3 text-[14px]">Add <strong>one</strong> variable:</p>
        <div className="mt-3 border border-dashed border-ink-faint/50 p-3 text-[13px]">
          <div className="line-item">
            <span>
              <strong>Key:</strong>{" "}
              <code className="font-mono">text</code>
            </span>
            <span className="leader" />
            <span className="font-mono text-[11px] text-ink-faint">Data type: text</span>
          </div>
        </div>
        <p className="mt-3 text-[12px] text-ink-faint italic">
          That&apos;s it — Slack will generate the webhook URL at publish time. Don&apos;t worry
          about secrets — the URL itself is the secret.
        </p>
      </Step>

      <Step n="04" title="Step 1 — Send a message to the channel">
        <p className="mt-3 text-[14px]">
          Add a step → <strong>Messages</strong> → <strong>Send a message in a channel</strong>.
        </p>
        <div className="mt-3 space-y-3">
          <KV label="Channel">
            <code className="font-mono text-[12px]">#secure-lunch-internal</code>
          </KV>
          <KV label="Message">
            <code className="font-mono text-[12px]">{"{{text}}"}</code>
            <p className="text-[11px] text-ink-faint mt-1 italic">
              Insert the <code className="font-mono">text</code> variable from the variable picker
              — the field will turn into a coloured chip. That&apos;s the whole message body.
            </p>
          </KV>
        </div>
      </Step>

      <Step n="05" title="Publish — grab the URL">
        <p className="mt-3 text-[14px]">
          Click <strong>Finish Up</strong> → <strong>Publish</strong>. Slack will show a webhook
          URL like:
        </p>
        <pre className="mt-3 text-[11px] leading-[1.5] whitespace-pre-wrap break-all font-mono border-l-2 border-moss/60 pl-3 py-2 bg-paper-light/50">
{`https://hooks.slack.com/triggers/T.../<id>/<token>`}
        </pre>
        <p className="mt-3 text-[14px]">Copy it.</p>
      </Step>

      <Step n="06" title="Paste the URL into Vercel">
        <p className="mt-3 text-[14px]">
          Vercel → <code className="font-mono">lunch-split</code> project → Settings → Environment
          Variables → add:
        </p>
        <div className="mt-3 space-y-3">
          <KV label="Name">
            <code className="font-mono text-[12px]">SLACK_NOTIFY_WEBHOOK_URL</code>
          </KV>
          <KV label="Value">
            <span className="font-mono text-[12px]">paste the URL from step 05</span>
          </KV>
          <KV label="Envs">
            <span className="text-[12px]">Production (and Preview, if you want previews to ping too)</span>
          </KV>
        </div>
        <p className="mt-3 text-[12px] text-ink-faint italic">
          Then <strong>redeploy</strong> — env-var changes don&apos;t take effect on existing
          deploys. Deployments → latest → <strong>···</strong> → Redeploy.
        </p>
      </Step>

      <Step n="07" title="Smoke test">
        <p className="mt-3 text-[14px]">
          After the redeploy lands:
        </p>
        <ol className="mt-3 space-y-2 text-[14px] list-decimal pl-5">
          <li>
            Open <Link href="/tickets/new" className="ink-link">/tickets/new</Link> and create any
            throwaway ticket (e.g., <em className="display-italic">&ldquo;Webhook smoke test&rdquo;</em>,
            total <code className="font-mono">100</code>).
          </li>
          <li>
            Within ~2 seconds, a message like{" "}
            <code className="font-mono text-[11.5px]">
              🍱 New ticket: *Webhook smoke test* · ₨ 100 by Ismail
            </code>{" "}
            should land in <code className="font-mono">#secure-lunch-internal</code>.
          </li>
          <li>
            Open the ticket, hit <strong>mark paid</strong> on a participant → another channel
            message fires.
          </li>
        </ol>
      </Step>

      <div className="divider-double my-10" />

      <footer className="text-center space-y-3">
        <div className="eyebrow">EVENTS THAT TRIGGER A POST</div>
        <div className="text-[12px] text-ink-faint max-w-[520px] mx-auto leading-relaxed space-y-1 text-left">
          <div><code className="font-mono">🍱</code> Ticket created on the web</div>
          <div><code className="font-mono">·</code> Someone self-marks &ldquo;paid&rdquo; (pending payer confirmation)</div>
          <div><code className="font-mono">✓</code> Payer confirms a payment (with running settled/total count)</div>
          <div><code className="font-mono">💵</code> Payer marks someone as paid in cash</div>
          <div><code className="font-mono">🟢</code> Ticket auto-closes — everyone settled</div>
          <div><code className="font-mono">·</code> Ticket manually closed by the payer</div>
        </div>
        <div className="divider-dots my-6 max-w-[300px] mx-auto" />
        <div className="eyebrow">VISIBILITY NOTE</div>
        <p className="text-[12px] text-ink-faint max-w-[480px] mx-auto leading-relaxed">
          Slack workflows aren&apos;t installed apps and don&apos;t trigger an approval flow. They
          live under <code className="font-mono">Tools → Workflow Builder</code> and are visible to
          an admin only if they specifically audit there. The webhook URL doesn&apos;t reveal what
          the app does without inspecting.
        </p>
      </footer>
    </main>
  );
}

function Step({ n, title, children }: { n: string; title: string; children: React.ReactNode }) {
  return (
    <section>
      <div className="flex items-baseline gap-3">
        <span className="display-italic text-[40px] text-saffron leading-none">{n}</span>
        <h2 className="display-italic text-[28px] leading-none">{title}</h2>
      </div>
      <div className="mt-2 ml-1">{children}</div>
    </section>
  );
}

function KV({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[80px_1fr] gap-3 items-baseline">
      <div className="eyebrow">{label}</div>
      <div className="text-[13px]">{children}</div>
    </div>
  );
}

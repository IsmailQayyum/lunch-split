import Link from "next/link";

export const dynamic = "force-static";

export default function SetupPage() {
  const webhookUrl = "https://lunch-split.vercel.app/api/slack/workflow";

  return (
    <main className="max-w-[640px] mx-auto px-5 pt-8 pb-16 animate-print">
      <Link href="/" className="eyebrow ink-link">
        ← BACK
      </Link>

      <header className="text-center mt-8 mb-6">
        <div className="eyebrow">ONE-TIME SETUP · ~ 5 MIN</div>
        <h1 className="display-italic text-[56px] mt-3 leading-[0.9]">Wire up Slack.</h1>
        <p className="text-ink-soft text-[14px] mt-3 max-w-[480px] mx-auto">
          A native Slack Workflow gives <code className="font-mono">#secure-lunch-internal</code> a{" "}
          <span className="display-italic">+ New lunch ticket</span> shortcut. No Slack app, no
          admin approval — just Workflow Builder.
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
            with your <em className="display-italic">work email</em> + JazzCash / EasyPaisa / IBAN. The Slack
            workflow looks up your payment methods by email.
          </li>
          <li>
            <span className="text-saffron">·</span> Open Slack →{" "}
            <code className="font-mono">#secure-lunch-internal</code>.
          </li>
        </ul>
      </Step>

      <div className="divider-dots my-8" />

      <Step n="01" title="Create the workflow">
        <p className="mt-3 text-[14px]">
          In the channel, click the <span className="display-italic text-[17px]">+</span> shortcut
          button at the top → <strong>Workflows</strong> → <strong>New Workflow</strong> →{" "}
          <strong>Build Workflow</strong>.
        </p>
        <p className="mt-2 text-[12px] text-ink-faint">
          Name it <code className="font-mono">New lunch ticket</code>.
        </p>
      </Step>

      <Step n="02" title="Trigger">
        <p className="mt-3 text-[14px]">
          Pick <strong>From a shortcut in this channel</strong>. (The thing that makes it show up
          in the <span className="display-italic text-[17px]">+</span> menu.)
        </p>
      </Step>

      <Step n="03" title="Step 1 — Open a form">
        <p className="mt-3 text-[14px]">Add a form step titled "Lunch details" with two fields:</p>
        <div className="mt-3 border border-dashed border-ink-faint/50 p-3 space-y-2 text-[13px]">
          <div className="line-item">
            <span>
              <strong>Title</strong>
              <span className="text-ink-faint ml-2">short text · required</span>
            </span>
            <span className="leader" />
            <span className="font-mono text-[11px] text-ink-faint">e.g. "KFC Friday"</span>
          </div>
          <div className="line-item">
            <span>
              <strong>Total amount in PKR</strong>
              <span className="text-ink-faint ml-2">number · required</span>
            </span>
            <span className="leader" />
            <span className="font-mono text-[11px] text-ink-faint">e.g. 3500</span>
          </div>
        </div>
        <p className="mt-3 text-[12px] text-ink-faint italic">
          Don't add a "participants" field — people pick themselves on the ticket page (way more
          reliable than wrangling Slack's multi-user picker).
        </p>
      </Step>

      <Step n="04" title="Step 2 — Send a webhook">
        <p className="mt-3 text-[14px]">Add a "Send a webhook" step. Configure it:</p>

        <div className="mt-3 space-y-3">
          <KV label="URL">
            <code className="font-mono text-[12px] break-all">{webhookUrl}</code>
          </KV>
          <KV label="Method">POST</KV>
          <KV label="Header">
            <div className="space-y-1">
              <div>
                <span className="text-ink-faint">name </span>
                <code className="font-mono text-[12px]">X-Slack-Workflow-Secret</code>
              </div>
              <div>
                <span className="text-ink-faint">value </span>
                <code className="font-mono text-[12px]">
                  paste from your Vercel env vars
                </code>
              </div>
              <p className="text-[11px] text-ink-faint mt-1">
                (You set this when the project was deployed. Find it at{" "}
                <code className="font-mono">SLACK_WORKFLOW_SECRET</code> under Project →
                Settings → Environment Variables.)
              </p>
            </div>
          </KV>
        </div>

        <p className="mt-4 text-[14px]">Body — paste this JSON, then replace the placeholders with Slack variables from the picker:</p>

        <pre className="mt-3 text-[11.5px] leading-[1.7] whitespace-pre-wrap font-mono border-l-2 border-saffron/60 pl-3 py-2 bg-paper-light/50">
{`{
  "title":         {{form.title}},
  "totalAmount":   {{form.total_amount_in_pkr}},
  "payerEmail":    {{person_who_started_workflow.email}},
  "payerNameFallback": {{person_who_started_workflow.real_name}}
}`}
        </pre>

        <p className="mt-3 text-[12px] text-ink-faint italic">
          In Slack's body editor, you select each <code className="font-mono">{`{{...}}`}</code>{" "}
          via the variable picker rather than typing it — but the shape is the above. The four
          fields are all that's needed.
        </p>

        <p className="mt-3 text-[13px]">
          Under <strong>Variables from response</strong>, add:
        </p>
        <div className="mt-2 border border-dashed border-ink-faint/50 p-3 text-[13px] font-mono">
          ticketUrl <span className="text-ink-faint ml-2">(string)</span>
        </div>
      </Step>

      <Step n="05" title="Step 3 — Send a message to the channel">
        <p className="mt-3 text-[14px]">
          Add a "Send a message" step. Channel:{" "}
          <code className="font-mono">#secure-lunch-internal</code>. Body:
        </p>

        <pre className="mt-3 text-[12px] leading-[1.7] whitespace-pre-wrap font-mono border-l-2 border-moss/60 pl-3 py-2 bg-paper-light/50">
{`🍱 New lunch ticket from <@{{person_who_started_workflow.id}}>

*{{form.title}}*
Total: ₨ {{form.total_amount_in_pkr}}

Pick yourselves + pay your share:
{{step_2_response.ticketUrl}}`}
        </pre>
      </Step>

      <Step n="06" title="Publish">
        <p className="mt-3 text-[14px]">
          Click <strong>Publish</strong>. Done.
        </p>
        <p className="mt-3 text-[14px]">
          From now on, anyone in <code className="font-mono">#secure-lunch-internal</code> hits the{" "}
          <span className="display-italic text-[17px]">+</span> shortcut → fills 2 fields → the
          ticket lands in the channel. Everyone taps the link, picks themselves from the roster,
          marks paid, and the payer confirms.
        </p>
      </Step>

      <div className="divider-double my-10" />

      <footer className="text-center space-y-3">
        <div className="eyebrow">VISIBILITY NOTE</div>
        <p className="text-[12px] text-ink-faint max-w-[480px] mx-auto leading-relaxed">
          Slack workflows aren't installed apps and don't trigger an approval flow. They live
          under <code className="font-mono">Tools → Workflow Builder</code> and are visible to an
          admin only if they specifically audit there. The webhook URL doesn't reveal what the
          app does without inspecting.
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

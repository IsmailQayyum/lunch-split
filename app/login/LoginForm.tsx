"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { loginAction } from "@/lib/actions/auth";

export function LoginForm({ next, error }: { next?: string; error?: string }) {
  const [email, setEmail] = useState("");
  const [pending, startTransition] = useTransition();

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData();
    fd.set("email", email);
    if (next) fd.set("next", next);
    startTransition(async () => {
      await loginAction(fd);
    });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      <div className="space-y-2">
        <Label>EMAIL</Label>
        <Input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          required
          autoFocus
        />
      </div>
      {error === "invalid_email" && (
        <div className="text-[12px] text-saffron italic">That doesn't look like an email.</div>
      )}
      <Button type="submit" disabled={pending || !email.trim()} size="lg">
        {pending ? "Signing in…" : "↓ Sign in"}
      </Button>
    </form>
  );
}

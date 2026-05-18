"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { enableAdminAction } from "@/lib/actions/admin";

export function AdminLogin({ error }: { error?: string }) {
  const [password, setPassword] = useState("");
  const [pending, startTransition] = useTransition();

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData();
    fd.set("password", password);
    startTransition(async () => {
      await enableAdminAction(fd);
    });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      <div className="space-y-2">
        <Label>PASSWORD</Label>
        <Input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="••••••••"
          required
          autoFocus
        />
      </div>
      {error === "bad_password" && (
        <div className="text-[12px] text-saffron italic">Wrong password.</div>
      )}
      <Button type="submit" disabled={pending || !password} size="lg">
        {pending ? "Unlocking…" : "↓ Enable admin mode"}
      </Button>
    </form>
  );
}

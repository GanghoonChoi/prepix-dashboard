"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@heroui/react";
import { Skeleton } from "@heroui/react";
import { useOverlayState } from "@heroui/react";
import { Dialog } from "@/components/dialog";
import { useToast } from "@/components/toast";
import { usePageTitle } from "@/lib/hooks/use-page-title";
import { userService } from "@/lib/api/services/user.service";
import { authService } from "@/lib/api/services/auth.service";

const SUPPORT_EMAIL = "support@prepix.ai";

export default function SettingsPage() {
  usePageTitle("Settings");
  const router = useRouter();
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [profile, setProfile] = useState<Record<string, string> | null>(null);

  const nameModal = useOverlayState();
  const passwordModal = useOverlayState();
  const deleteModal = useOverlayState();

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  useEffect(() => {
    // Hydrate from the localStorage cache on mount (unavailable during SSR),
    // then refresh from the API below.
    const cached = localStorage.getItem("userInfo");
    if (cached) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      try { const p = JSON.parse(cached); setProfile(p); setFirstName(p.firstName || ""); setLastName(p.lastName || ""); } catch { /* */ }
    }

    userService.getProfile()
      .then((p) => {
        setProfile(p); setFirstName(p.firstName || ""); setLastName(p.lastName || "");
        localStorage.setItem("userInfo", JSON.stringify(p));
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleEditName = async () => {
    if (!firstName.trim() || !lastName.trim()) { toast("Name is required", "error"); return; }
    setSaving(true);
    try {
      await userService.updateProfile({ firstName, lastName });
      const p = await userService.getProfile();
      setProfile(p); localStorage.setItem("userInfo", JSON.stringify(p));
      toast("Name updated"); nameModal.close();
    } catch { toast("Failed to update name", "error"); }
    setSaving(false);
  };

  const handleUpdatePassword = async () => {
    if (!currentPassword || !newPassword || newPassword.length < 8) { toast("Password must be at least 8 characters", "error"); return; }
    if (newPassword !== confirmPassword) { toast("Passwords don't match", "error"); return; }
    setSaving(true);
    try {
      await userService.changePassword({ currentPassword, newPassword });
      passwordModal.close();
      authService.logout();
      toast("Password updated. Please sign in again.");
      router.push("/login");
    } catch { toast("Failed to update password", "error"); }
    setSaving(false);
  };

  const inputClass = "w-full rounded-md border border-border bg-field-background px-3 py-2.5 text-sm text-foreground outline-none transition-colors focus:border-foreground/30";

  return (
    <div className="max-w-3xl space-y-10">
      <h1 className="text-2xl font-semibold tracking-tight text-foreground">Settings</h1>

      {/* Account */}
      <section className="space-y-4">
        <h2 className="text-sm font-medium text-foreground">Account</h2>
        {loading ? (
          <Skeleton className="h-36 w-full rounded-lg" />
        ) : (
          <div className="divide-y divide-border rounded-lg border border-border">
            <SettingRow
              label="Name"
              value={profile?.firstName && profile?.lastName ? `${profile.firstName} ${profile.lastName}` : "Not set"}
              action="Edit"
              onAction={() => { setFirstName(profile?.firstName || ""); setLastName(profile?.lastName || ""); nameModal.open(); }}
            />
            <SettingRow label="Email" value={profile?.email || "Not set"} />
            <SettingRow
              label="Password" value="••••••••" action="Change"
              onAction={() => { setCurrentPassword(""); setNewPassword(""); setConfirmPassword(""); passwordModal.open(); }}
            />
          </div>
        )}
      </section>

      {/* Danger */}
      <section className="space-y-4">
        <h2 className="text-sm font-medium text-foreground">Danger zone</h2>
        <div className="flex items-center justify-between rounded-lg border border-border px-5 py-4">
          <div>
            <p className="text-sm font-medium text-foreground">Delete account</p>
            <p className="text-xs text-muted">Permanently remove your account and all data</p>
          </div>
          <Button variant="danger-soft" size="sm" onPress={() => deleteModal.open()}>Delete</Button>
        </div>
      </section>

      {/* Modals */}
      <Dialog state={nameModal} title="Edit name">
        <div className="space-y-3">
          <div><label className="mb-1 block text-xs font-medium text-muted">First name</label><input type="text" value={firstName} onChange={(e) => setFirstName(e.target.value)} className={inputClass} /></div>
          <div><label className="mb-1 block text-xs font-medium text-muted">Last name</label><input type="text" value={lastName} onChange={(e) => setLastName(e.target.value)} className={inputClass} /></div>
        </div>
        <div className="mt-6 flex justify-end gap-3">
          <Button variant="outline" size="sm" onPress={() => nameModal.close()} isDisabled={saving}>Cancel</Button>
          <Button variant="primary" size="sm" onPress={handleEditName} isDisabled={saving}>{saving ? "Saving..." : "Save"}</Button>
        </div>
      </Dialog>

      <Dialog state={passwordModal} title="Change password">
        <p className="mb-4 text-xs text-muted">You&apos;ll be logged out after changing your password.</p>
        <div className="space-y-3">
          <div><label className="mb-1 block text-xs font-medium text-muted">Current password</label><input type="password" autoComplete="current-password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} className={inputClass} /></div>
          <div><label className="mb-1 block text-xs font-medium text-muted">New password</label><input type="password" autoComplete="new-password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} className={inputClass} /></div>
          <div><label className="mb-1 block text-xs font-medium text-muted">Confirm new password</label><input type="password" autoComplete="new-password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} className={inputClass} /></div>
        </div>
        <div className="mt-6 flex justify-end gap-3">
          <Button variant="outline" size="sm" onPress={() => passwordModal.close()} isDisabled={saving}>Cancel</Button>
          <Button variant="primary" size="sm" onPress={handleUpdatePassword} isDisabled={saving}>{saving ? "Updating..." : "Update"}</Button>
        </div>
      </Dialog>

      <Dialog state={deleteModal} title="Delete account">
        <p className="text-sm text-muted">
          This permanently removes your account and all data. Email us from your
          account address and we&apos;ll process it.
        </p>
        <div className="mt-6 flex justify-end gap-3">
          <Button variant="outline" size="sm" onPress={() => deleteModal.close()}>Cancel</Button>
          <Button
            variant="danger"
            size="sm"
            onPress={() => {
              window.location.href = `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent("Account deletion request")}&body=${encodeURIComponent(`Please delete my Prepix account (${profile?.email ?? ""}).`)}`;
              deleteModal.close();
            }}
          >
            Contact support
          </Button>
        </div>
      </Dialog>
    </div>
  );
}

function SettingRow({ label, value, action, onAction }: {
  label: string; value: string; action?: string; onAction?: () => void;
}) {
  return (
    <div className="flex items-center justify-between px-5 py-4">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-foreground">{label}</p>
        <p className="truncate text-xs text-muted">{value}</p>
      </div>
      {action && onAction && (
        <button onClick={onAction} className="text-xs font-medium text-muted hover:text-foreground transition-colors">
          {action}
        </button>
      )}
    </div>
  );
}

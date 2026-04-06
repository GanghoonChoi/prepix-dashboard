"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button, Switch } from "@heroui/react";
import {
  Modal,
  ModalBackdrop,
  ModalContainer,
  ModalDialog,
  ModalHeader,
  ModalHeading,
  ModalBody,
  ModalFooter,
} from "@heroui/react";
import { Skeleton } from "@heroui/react";
import { useOverlayState } from "@heroui/react";
import { userService } from "@/lib/api/services/user.service";
import { authService } from "@/lib/api/services/auth.service";

export default function SettingsPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const [profile, setProfile] = useState<Record<string, string> | null>(null);
  const [notifications, setNotifications] = useState({
    emailNotifications: true,
    marketingEmails: false,
    productUpdates: true,
    usageAlerts: true,
  });

  const nameModal = useOverlayState();
  const passwordModal = useOverlayState();
  const deleteModal = useOverlayState();

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  useEffect(() => {
    const cached = localStorage.getItem("userInfo");
    if (cached) {
      try { const p = JSON.parse(cached); setProfile(p); setFirstName(p.firstName || ""); setLastName(p.lastName || ""); } catch { /* */ }
    }

    Promise.allSettled([userService.getProfile(), userService.getNotifications()])
      .then(([pRes, nRes]) => {
        if (pRes.status === "fulfilled") {
          const p = pRes.value;
          setProfile(p); setFirstName(p.firstName || ""); setLastName(p.lastName || "");
          localStorage.setItem("userInfo", JSON.stringify(p));
        }
        if (nRes.status === "fulfilled") setNotifications(nRes.value);
        setLoading(false);
      });
  }, []);

  const flash = (type: "success" | "error", text: string) => {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 3000);
  };

  const handleEditName = async () => {
    if (!firstName.trim() || !lastName.trim()) { flash("error", "Name is required"); return; }
    setSaving(true);
    try {
      await userService.updateProfile({ firstName, lastName });
      const p = await userService.getProfile();
      setProfile(p); localStorage.setItem("userInfo", JSON.stringify(p));
      flash("success", "Name updated"); nameModal.close();
    } catch { flash("error", "Failed to update name"); }
    setSaving(false);
  };

  const handleUpdatePassword = async () => {
    if (!currentPassword || !newPassword || newPassword.length < 8) { flash("error", "Password must be at least 8 characters"); return; }
    if (newPassword !== confirmPassword) { flash("error", "Passwords don't match"); return; }
    setSaving(true);
    try {
      await userService.changePassword({ currentPassword, newPassword });
      passwordModal.close(); authService.logout();
      alert("Password updated. Please login again."); router.push("/login");
    } catch { flash("error", "Failed to update password"); }
    setSaving(false);
  };

  const handleNotification = async (key: string, value: boolean) => {
    const prev = { ...notifications };
    setNotifications({ ...notifications, [key]: value });
    try { await userService.updateNotifications({ ...notifications, [key]: value }); }
    catch { setNotifications(prev); }
  };

  const inputClass = "w-full rounded-md border border-border bg-field-background px-3 py-2.5 text-sm text-foreground outline-none transition-colors focus:border-foreground/30";

  return (
    <div className="max-w-3xl space-y-10">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Settings</h1>
        <p className="mt-1 text-sm text-muted">Manage your account.</p>
      </div>

      {message && (
        <div className={`rounded-md border px-4 py-3 text-sm ${
          message.type === "success" ? "border-border text-foreground" : "border-danger/30 text-danger"
        }`}>{message.text}</div>
      )}

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

      {/* Notifications */}
      <section className="space-y-4">
        <h2 className="text-sm font-medium text-foreground">Notifications</h2>
        {loading ? (
          <Skeleton className="h-48 w-full rounded-lg" />
        ) : (
          <div className="divide-y divide-border rounded-lg border border-border">
            {([
              { key: "emailNotifications", label: "Email notifications", desc: "Receive notifications via email" },
              { key: "marketingEmails", label: "Marketing emails", desc: "Promotional content" },
              { key: "productUpdates", label: "Product updates", desc: "New features and improvements" },
              { key: "usageAlerts", label: "Usage alerts", desc: "Quota and limit warnings" },
            ] as const).map((item) => (
              <div key={item.key} className="flex items-center justify-between px-5 py-4">
                <div>
                  <p className="text-sm font-medium text-foreground">{item.label}</p>
                  <p className="text-xs text-muted">{item.desc}</p>
                </div>
                <Switch
                  isSelected={notifications[item.key]}
                  onChange={() => handleNotification(item.key, !notifications[item.key])}
                  size="sm"
                />
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Danger */}
      <section className="space-y-4">
        <h2 className="text-sm font-medium text-foreground">Danger zone</h2>
        <div className="flex items-center justify-between rounded-lg border border-border px-5 py-4">
          <div>
            <p className="text-sm font-medium text-foreground">Delete account</p>
            <p className="text-xs text-muted">Permanently remove all data</p>
          </div>
          <Button variant="danger-soft" size="sm" onPress={() => deleteModal.open()}>Delete</Button>
        </div>
      </section>

      {/* Modals */}
      <Modal state={nameModal}>
        <ModalBackdrop />
        <ModalContainer><ModalDialog>
          <ModalHeader><ModalHeading>Edit name</ModalHeading></ModalHeader>
          <ModalBody>
            <div className="space-y-3">
              <div><label className="mb-1 block text-xs font-medium text-muted">First name</label><input type="text" value={firstName} onChange={(e) => setFirstName(e.target.value)} className={inputClass} /></div>
              <div><label className="mb-1 block text-xs font-medium text-muted">Last name</label><input type="text" value={lastName} onChange={(e) => setLastName(e.target.value)} className={inputClass} /></div>
            </div>
          </ModalBody>
          <ModalFooter>
            <Button variant="outline" size="sm" onPress={() => nameModal.close()} isDisabled={saving}>Cancel</Button>
            <Button variant="primary" size="sm" onPress={handleEditName} isDisabled={saving}>{saving ? "Saving..." : "Save"}</Button>
          </ModalFooter>
        </ModalDialog></ModalContainer>
      </Modal>

      <Modal state={passwordModal}>
        <ModalBackdrop />
        <ModalContainer><ModalDialog>
          <ModalHeader><ModalHeading>Change password</ModalHeading></ModalHeader>
          <ModalBody>
            <p className="mb-4 text-xs text-muted">You&apos;ll be logged out after changing your password.</p>
            <div className="space-y-3">
              <div><label className="mb-1 block text-xs font-medium text-muted">Current password</label><input type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} className={inputClass} /></div>
              <div><label className="mb-1 block text-xs font-medium text-muted">New password</label><input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} className={inputClass} /></div>
              <div><label className="mb-1 block text-xs font-medium text-muted">Confirm new password</label><input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} className={inputClass} /></div>
            </div>
          </ModalBody>
          <ModalFooter>
            <Button variant="outline" size="sm" onPress={() => passwordModal.close()} isDisabled={saving}>Cancel</Button>
            <Button variant="primary" size="sm" onPress={handleUpdatePassword} isDisabled={saving}>{saving ? "Updating..." : "Update"}</Button>
          </ModalFooter>
        </ModalDialog></ModalContainer>
      </Modal>

      <Modal state={deleteModal}>
        <ModalBackdrop />
        <ModalContainer><ModalDialog>
          <ModalHeader><ModalHeading>Delete account</ModalHeading></ModalHeader>
          <ModalBody><p className="text-sm text-muted">This cannot be undone. All data will be permanently deleted.</p></ModalBody>
          <ModalFooter>
            <Button variant="outline" size="sm" onPress={() => deleteModal.close()}>Cancel</Button>
            <Button variant="danger" size="sm" onPress={() => { flash("error", "Please contact support to delete your account."); deleteModal.close(); }}>Delete account</Button>
          </ModalFooter>
        </ModalDialog></ModalContainer>
      </Modal>
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

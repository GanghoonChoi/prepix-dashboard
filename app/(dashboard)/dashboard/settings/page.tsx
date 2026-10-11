"use client";

import { useState, useEffect, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Skeleton, useOverlayState } from "@heroui/react";
import { Dialog } from "@/components/dialog";
import { useToast } from "@/components/toast";
import { usePageTitle } from "@/lib/hooks/use-page-title";
import { userService, type Profile } from "@/lib/api/services/user.service";
import { authService } from "@/lib/api/services/auth.service";
import { useT } from "@/lib/i18n/context";
import { LanguageSwitcher } from "@/components/language-switcher";
import { ThemeSwitcher } from "@/components/theme-switcher";
import {
  Button,
  DangerZone,
  inputClass,
  Page,
  SettingRow,
  SettingsSection,
} from "@/components/ui";

const SUPPORT_EMAIL = "support@prepix.ai";

export default function SettingsPage() {
  const t = useT();
  usePageTitle(t("settings.title"));
  const router = useRouter();
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [profile, setProfile] = useState<Profile | null>(null);

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
    if (!firstName.trim() || !lastName.trim()) { toast(t("settings.nameRequired"), "error"); return; }
    setSaving(true);
    try {
      await userService.updateProfile({ firstName, lastName });
      const p = await userService.getProfile();
      setProfile(p); localStorage.setItem("userInfo", JSON.stringify(p));
      toast(t("settings.nameUpdated")); nameModal.close();
    } catch { toast(t("settings.nameUpdateFailed"), "error"); }
    setSaving(false);
  };

  const handleUpdatePassword = async () => {
    if (!currentPassword || !newPassword || newPassword.length < 8) { toast(t("settings.passwordMin"), "error"); return; }
    if (newPassword !== confirmPassword) { toast(t("settings.passwordMismatch"), "error"); return; }
    setSaving(true);
    try {
      await userService.changePassword({ currentPassword, newPassword });
      passwordModal.close();
      authService.logout();
      toast(t("settings.passwordUpdated"));
      router.push("/login");
    } catch { toast(t("settings.passwordUpdateFailed"), "error"); }
    setSaving(false);
  };

  const field = (label: string, input: ReactNode) => (
    <label className="block space-y-1.5">
      <span className="text-[13px] font-medium">{label}</span>
      {input}
    </label>
  );

  // Sign-up only asks for a display name (`username`); first/last exist once
  // somebody edits them here. Reading only those printed "미설정" for an
  // account the home page greets by name.
  const name =
    [profile?.firstName, profile?.lastName].filter(Boolean).join(" ") ||
    profile?.username ||
    t("common.notSet");

  return (
    <Page title={t("settings.title")}>
      <SettingsSection title={t("settings.account")}>
        {loading ? (
          <Skeleton className="h-36 w-full rounded-lg" />
        ) : (
          <>
            <SettingRow label={t("settings.name")} description={name}>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => { setFirstName(profile?.firstName || ""); setLastName(profile?.lastName || ""); nameModal.open(); }}
              >
                {t("common.edit")}
              </Button>
            </SettingRow>
            <SettingRow label={t("settings.email")} description={profile?.email || t("common.notSet")} />
            <SettingRow label={t("settings.password")} description="••••••••">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => { setCurrentPassword(""); setNewPassword(""); setConfirmPassword(""); passwordModal.open(); }}
              >
                {t("common.change")}
              </Button>
            </SettingRow>
          </>
        )}
      </SettingsSection>

      {/* Two switches with one-word answers; a sentence under each restated
          what the segmented control already shows. */}
      <SettingsSection title={t("settings.preferences")}>
        <SettingRow label={t("settings.language")}>
          <LanguageSwitcher />
        </SettingRow>
        <SettingRow label={t("settings.theme")}>
          <ThemeSwitcher />
        </SettingRow>
      </SettingsSection>

      <DangerZone title={t("settings.deleteAccount")} description={t("settings.deleteAccountHint")}>
        <Button variant="danger" size="sm" onClick={() => deleteModal.open()}>
          {t("common.delete")}
        </Button>
      </DangerZone>

      <Dialog state={nameModal} title={t("settings.editName")}>
        <div className="space-y-3">
          {field(t("settings.firstName"), <input type="text" value={firstName} onChange={(e) => setFirstName(e.target.value)} className={inputClass} />)}
          {field(t("settings.lastName"), <input type="text" value={lastName} onChange={(e) => setLastName(e.target.value)} className={inputClass} />)}
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <Button variant="secondary" size="sm" onClick={() => nameModal.close()} disabled={saving}>{t("common.cancel")}</Button>
          <Button size="sm" onClick={handleEditName} disabled={saving} aria-busy={saving}>{saving ? t("common.saving") : t("common.save")}</Button>
        </div>
      </Dialog>

      <Dialog state={passwordModal} title={t("settings.changePassword")}>
        <p className="mb-4 text-xs text-muted">{t("settings.logoutAfterPassword")}</p>
        <div className="space-y-3">
          {field(t("settings.currentPassword"), <input type="password" autoComplete="current-password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} className={inputClass} />)}
          {field(t("settings.newPassword"), <input type="password" autoComplete="new-password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} className={inputClass} />)}
          {field(t("settings.confirmPassword"), <input type="password" autoComplete="new-password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} className={inputClass} />)}
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <Button variant="secondary" size="sm" onClick={() => passwordModal.close()} disabled={saving}>{t("common.cancel")}</Button>
          <Button size="sm" onClick={handleUpdatePassword} disabled={saving} aria-busy={saving}>{saving ? t("common.updating") : t("common.update")}</Button>
        </div>
      </Dialog>

      <Dialog state={deleteModal} title={t("settings.deleteAccount")}>
        <p className="text-sm text-muted">
          {t("settings.deleteBody")}
        </p>
        <div className="mt-6 flex justify-end gap-2">
          <Button variant="secondary" size="sm" onClick={() => deleteModal.close()}>{t("common.cancel")}</Button>
          <Button
            variant="danger"
            size="sm"
            onClick={() => {
              window.location.href = `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(t("settings.deleteSubject"))}&body=${encodeURIComponent(t("settings.deleteMailBody", { email: profile?.email ?? "" }))}`;
              deleteModal.close();
            }}
          >
            {t("common.contactSupport")}
          </Button>
        </div>
      </Dialog>
    </Page>
  );
}

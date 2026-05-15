import { ThemeSettings } from "@/components/settings/theme-settings";
import { AppearanceSettings } from "@/components/settings/appearance-settings";
import { EditorSettings } from "@/components/settings/editor-settings";
import { NotificationsSettings } from "@/components/settings/notifications-settings";
import { TerminalSettings } from "@/components/settings/terminal-settings";
import { JiraSettings } from "@/components/settings/jira-settings";
import { SlackSettings } from "@/components/settings/slack-settings";

export default function SettingsPage() {
  return (
    <div className="flex-1 min-h-0 overflow-y-auto">
      <div className="max-w-2xl mx-auto p-6 space-y-6">
        <h1 className="text-lg font-semibold">Settings</h1>
        <ThemeSettings />
        <AppearanceSettings />
        <EditorSettings />
        <NotificationsSettings />
        <TerminalSettings />
        <JiraSettings />
        <SlackSettings />
      </div>
    </div>
  );
}

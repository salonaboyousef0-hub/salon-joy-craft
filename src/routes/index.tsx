import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { LayoutDashboard, ListChecks, MessageCircle, CalendarDays, Settings2, Receipt, Network, BarChart3, Radio } from "lucide-react";

import { Dashboard } from "@/components/salon/Dashboard";
import { TaskManager } from "@/components/salon/TaskManager";
import { Chat } from "@/components/salon/Chat";
import { Schedules } from "@/components/salon/Schedules";
import { Admin } from "@/components/salon/Admin";
import { Cashier } from "@/components/salon/Cashier";
import { ExternalBranches } from "@/components/salon/ExternalBranches";
import { BranchOverview } from "@/components/salon/BranchOverview";
import { ControlCenter } from "@/components/salon/ControlCenter";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "المدير — صالون أبو يوسف" },
      { name: "description", content: "مساعد ذكي بشخصية مدير محترف لإدارة صالون أبو يوسف: قرارات، مهام، جداول، حوافز." },
      { property: "og:title", content: "المدير — صالون أبو يوسف" },
      { property: "og:description", content: "مساعد ذكي بشخصية مدير محترف لإدارة صالون أبو يوسف." },
    ],
  }),
  component: Index,
});

type TabId = "dashboard" | "control" | "cashier" | "branches" | "overview" | "tasks" | "chat" | "schedules" | "admin";

const TABS: { id: TabId; label: string; icon: typeof LayoutDashboard }[] = [
  { id: "dashboard", label: "لوحة القيادة", icon: LayoutDashboard },
  { id: "control", label: "مركز التحكم", icon: Radio },
  { id: "cashier", label: "الكاشير", icon: Receipt },
  { id: "branches", label: "الفروع", icon: Network },
  { id: "overview", label: "نظرة فرع", icon: BarChart3 },
  { id: "tasks", label: "المهام", icon: ListChecks },
  { id: "chat", label: "المدير", icon: MessageCircle },
  { id: "schedules", label: "جداول وحوافز", icon: CalendarDays },
  { id: "admin", label: "ضبط النظام", icon: Settings2 },
];

function Index() {
  const [tab, setTab] = useState<TabId>("dashboard");

  return (
    <div className="min-h-screen bg-background text-foreground">
      <main className="mx-auto max-w-5xl px-4 pb-28 pt-6">
        {tab === "dashboard" ? (
          <Dashboard
            onGoChat={() => setTab("chat")}
            onGoTasks={() => setTab("tasks")}
            onGoCashier={() => setTab("cashier")}
          />
        ) : tab === "control" ? (
          <ControlCenter />
        ) : tab === "cashier" ? (
          <Cashier />
        ) : tab === "branches" ? (
          <ExternalBranches />
        ) : tab === "overview" ? (
          <BranchOverview />
        ) : tab === "tasks" ? (
          <TaskManager />
        ) : tab === "chat" ? (
          <Chat />
        ) : tab === "schedules" ? (
          <Schedules />
        ) : (
          <Admin />
        )}
      </main>

      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-card/95 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-stretch justify-between px-2">
          {TABS.map((t) => {
            const active = tab === t.id;
            const Icon = t.icon;
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`flex flex-1 flex-col items-center gap-1 px-2 py-3 text-[11px] transition ${
                  active ? "text-[var(--gold)]" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Icon className={`h-5 w-5 ${active ? "scale-110" : ""}`} />
                <span className="font-semibold">{t.label}</span>
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
